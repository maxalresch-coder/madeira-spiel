#!/usr/bin/env python3
"""Operação Madeira - Das Spiel – kleiner Server ohne externe Abhängigkeiten.

Aufgaben:
  * liefert die Webseite (Ordner public/) aus – nur unter dem geheimen Link
  * prüft das Passwort und gibt ein Token aus
  * speichert den gemeinsamen Spielstand (data/state.json) mit Versionsnummer,
    damit alle drei Handys denselben Stand sehen

Konfiguration über Umgebungsvariablen:
  MADEIRA_PASSWORD   Passwort für den Login (Pflicht)
  MADEIRA_LINK_KEY   geheimer Teil des Links, z. B. "k7Hq2xPz" -> https://host/k7Hq2xPz/
                     (leer = Seite liegt direkt unter "/")
  MADEIRA_SECRET     optional, Schlüssel zum Signieren der Tokens
  MADEIRA_DATA_DIR   optional, Ordner für den Spielstand (Standard: ./data)

Lokal starten:  MADEIRA_PASSWORD=test MADEIRA_LINK_KEY=geheim python3 server.py
Auf PythonAnywhere: siehe ANLEITUNG.md – dort wird `application` als WSGI-App genutzt.
"""
import hashlib
import hmac
import json
import mimetypes
import os
import threading
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
MAX_BODY = 2 * 1024 * 1024
_lock = threading.Lock()


def _conf():
    password = os.environ.get("MADEIRA_PASSWORD", "")
    secret = os.environ.get("MADEIRA_SECRET") or ("madeira:" + password)
    return {
        "password": password,
        "key": os.environ.get("MADEIRA_LINK_KEY", "").strip("/"),
        "secret": secret.encode(),
        "data_dir": os.environ.get("MADEIRA_DATA_DIR") or os.path.join(BASE_DIR, "data"),
    }


def _token(conf):
    return hmac.new(conf["secret"], b"madeira-team", hashlib.sha256).hexdigest()


def _state_path(conf):
    return os.path.join(conf["data_dir"], "state.json")


def _load(conf):
    try:
        with open(_state_path(conf), encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return {"version": 0, "state": None}


def _save(conf, doc):
    os.makedirs(conf["data_dir"], exist_ok=True)
    path = _state_path(conf)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False)
    os.replace(tmp, path)


def _now_ms():
    """Serverzeit in ms – alle Handys rechnen Timer damit, damit sie synchron laufen."""
    return int(time.time() * 1000)


def _json(start_response, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    start_response(status, [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Content-Length", str(len(body))),
        ("Cache-Control", "no-store"),
    ])
    return [body]


def _not_found(start_response):
    body = b"Not Found"
    start_response("404 Not Found", [("Content-Type", "text/plain"), ("Content-Length", str(len(body)))])
    return [body]


def _read_body(environ):
    try:
        length = int(environ.get("CONTENT_LENGTH") or 0)
    except ValueError:
        length = 0
    if length <= 0 or length > MAX_BODY:
        return None
    try:
        return json.loads(environ["wsgi.input"].read(length).decode("utf-8"))
    except ValueError:
        return None


def _authorized(environ, conf):
    auth = environ.get("HTTP_AUTHORIZATION", "")
    return auth.startswith("Bearer ") and hmac.compare_digest(auth[7:], _token(conf))


def _api(path, environ, start_response, conf):
    method = environ["REQUEST_METHOD"]

    if path == "login" and method == "POST":
        body = _read_body(environ) or {}
        if conf["password"] and hmac.compare_digest(str(body.get("password", "")), conf["password"]):
            return _json(start_response, "200 OK", {"token": _token(conf)})
        time.sleep(1)  # bremst Rateversuche
        return _json(start_response, "401 Unauthorized", {"error": "Falsches Passwort"})

    if not _authorized(environ, conf):
        return _json(start_response, "401 Unauthorized", {"error": "Nicht angemeldet"})

    if path == "state" and method == "GET":
        doc = _load(conf)
        qs = environ.get("QUERY_STRING", "")
        since = None
        for part in qs.split("&"):
            if part.startswith("since="):
                try:
                    since = int(part[6:])
                except ValueError:
                    pass
        if since is not None and since == doc["version"]:
            return _json(start_response, "200 OK", {"version": doc["version"], "unchanged": True, "now": _now_ms()})
        return _json(start_response, "200 OK", dict(doc, now=_now_ms()))

    if path == "state" and method == "POST":
        body = _read_body(environ)
        if not body or "state" not in body or "baseVersion" not in body:
            return _json(start_response, "400 Bad Request", {"error": "Ungültige Anfrage"})
        with _lock:
            doc = _load(conf)
            if body["baseVersion"] != doc["version"]:
                return _json(start_response, "409 Conflict", doc)
            doc = {"version": doc["version"] + 1, "state": body["state"]}
            _save(conf, doc)
        return _json(start_response, "200 OK", {"version": doc["version"], "now": _now_ms()})

    return _not_found(start_response)


def _static(rel, start_response):
    rel = rel or "index.html"
    full = os.path.normpath(os.path.join(PUBLIC_DIR, rel))
    if not full.startswith(PUBLIC_DIR + os.sep) or not os.path.isfile(full):
        return _not_found(start_response)
    ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
    if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
        ctype += "; charset=utf-8"
    with open(full, "rb") as f:
        body = f.read()
    start_response("200 OK", [
        ("Content-Type", ctype),
        ("Content-Length", str(len(body))),
        # Bilder dürfen kurz zwischengespeichert werden, alles andere immer frisch
        ("Cache-Control", "public, max-age=600" if rel.startswith("images/") else "no-cache"),
        ("X-Robots-Tag", "noindex, nofollow"),
        ("Referrer-Policy", "no-referrer"),
    ])
    return [body]


def application(environ, start_response):
    conf = _conf()
    path = environ.get("PATH_INFO", "/")
    if path == "/robots.txt":
        body = b"User-agent: *\nDisallow: /\n"
        start_response("200 OK", [("Content-Type", "text/plain"), ("Content-Length", str(len(body)))])
        return [body]

    # Alles liegt hinter dem geheimen Link-Teil.
    if conf["key"]:
        prefix = "/" + conf["key"]
        if path == prefix:
            start_response("302 Found", [("Location", prefix + "/"), ("Content-Length", "0")])
            return [b""]
        if not path.startswith(prefix + "/"):
            return _not_found(start_response)
        path = path[len(prefix):]

    rel = path.lstrip("/")
    if rel.startswith("api/"):
        return _api(rel[4:], environ, start_response, conf)
    return _static(rel, start_response)


if __name__ == "__main__":
    from socketserver import ThreadingMixIn
    from wsgiref.simple_server import WSGIServer, make_server

    class _Server(ThreadingMixIn, WSGIServer):
        daemon_threads = True

    if not os.environ.get("MADEIRA_PASSWORD"):
        raise SystemExit("Bitte MADEIRA_PASSWORD setzen, z. B.: MADEIRA_PASSWORD=test python3 server.py")
    port = int(os.environ.get("PORT", "8000"))
    key = _conf()["key"]
    print(f"Operação Madeira läuft auf http://localhost:{port}/{key + '/' if key else ''}")
    make_server("", port, application, server_class=_Server).serve_forever()
