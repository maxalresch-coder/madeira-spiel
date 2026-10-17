#!/usr/bin/env python3
"""Operação Madeira - Das Spiel – kleiner Server ohne externe Abhängigkeiten.

Aufgaben:
  * liefert die Webseite (Ordner public/) aus – nur unter dem geheimen Link
  * prüft das Passwort und gibt ein Token aus
  * speichert den gemeinsamen Spielstand (data/state.json) mit Versionsnummer,
    damit alle drei Handys denselben Stand sehen
  * nimmt Fotos der Hilfsmittel entgegen (data/photos/, nur vorübergehend: Fotos, auf die der
    Spielstand nicht mehr verweist, werden automatisch gelöscht – z. B. nach „Geschafft“, „Neue Runde“ oder Reset)
  * führt ein Fehlerprotokoll für den Foto-Upload (data/client-errors.log, eine JSON-Zeile je Fehler),
    das die Handys automatisch füllen – anzusehen in der App unter Einstellungen → Fehlerprotokoll
  * merkt sich alle Namen, mit denen sich jemand angemeldet hat (data/players.json),
    z. B. für die Spielerauswahl beim Tic-Tac-Toe (bleibt auch nach einem Reset)

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
import re
import secrets
import threading
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
MAX_BODY = 2 * 1024 * 1024
MAX_PHOTO = 600 * 1024          # Fotos werden im Browser auf ~1.000 px / < 200 KB verkleinert
PHOTO_ID = re.compile(r"p[0-9a-f]{24}")
PHOTO_GRACE = 120               # Sekunden: frisch hochgeladene Fotos nicht sofort wieder löschen
ERRLOG_KEEP = 500               # so viele Einträge behält das Fehlerprotokoll höchstens
ERRLOG_FIELDS = ("stage", "name", "message", "fileName", "fileType", "fileSize", "attempts", "player", "detail")
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


def _players_path(conf):
    return os.path.join(conf["data_dir"], "players.json")


def _load_players(conf):
    try:
        with open(_players_path(conf), encoding="utf-8") as f:
            names = json.load(f)
        return [n for n in names if isinstance(n, str)] if isinstance(names, list) else []
    except (FileNotFoundError, ValueError):
        return []


def _add_player(conf, name):
    """Namen merken (ohne Doppelte, Groß-/Kleinschreibung egal) und alle Namen zurückgeben."""
    name = " ".join(str(name or "").split())[:24]
    with _lock:
        names = _load_players(conf)
        if name and name.lower() not in [n.lower() for n in names] and len(names) < 50:
            names.append(name)
            os.makedirs(conf["data_dir"], exist_ok=True)
            tmp = _players_path(conf) + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(names, f, ensure_ascii=False)
            os.replace(tmp, _players_path(conf))
        return names


def _photo_dir(conf):
    return os.path.join(conf["data_dir"], "photos")


def _gc_photos(conf, state):
    """Löscht Fotos, auf die der Spielstand nicht (mehr) verweist. Nach einem Reset (kein „tools“)
    sofort, sonst erst nach einer kurzen Schonfrist (Upload kommt kurz vor dem Speichern)."""
    folder = _photo_dir(conf)
    if not os.path.isdir(folder):
        return
    used = set(PHOTO_ID.findall(json.dumps(state)))
    grace = PHOTO_GRACE if isinstance(state, dict) and state.get("tools") else 0
    now = time.time()
    for name in os.listdir(folder):
        pid = name[:-4]
        if not name.endswith(".jpg") or pid in used:
            continue
        path = os.path.join(folder, name)
        try:
            if now - os.path.getmtime(path) >= grace:
                os.remove(path)
        except OSError:
            pass


def _save_photo(conf, environ):
    """Speichert ein hochgeladenes JPEG. Liefert (id, None) oder (None, Fehlertext).
    Der Browser verkleinert jedes Foto vorher und schickt immer JPEG; geprüft wird nur, dass etwas ankam,
    dass es nicht zu groß ist und dass es mit der JPEG-Kennung (FF D8 FF) beginnt."""
    try:
        length = int(environ.get("CONTENT_LENGTH") or -1)
    except ValueError:
        length = -1
    if length > MAX_PHOTO:
        return None, "Foto zu groß (%d KB, erlaubt %d KB)" % (length // 1024, MAX_PHOTO // 1024)
    # ohne Längenangabe (z. B. „chunked“) höchstens MAX_PHOTO + 1 Bytes lesen
    data = environ["wsgi.input"].read(length if length >= 0 else MAX_PHOTO + 1)
    if not data:
        return None, "leeres Foto angekommen"
    if len(data) > MAX_PHOTO:
        return None, "Foto zu groß"
    if data[:3] != b"\xff\xd8\xff":
        return None, "kein JPEG angekommen"
    os.makedirs(_photo_dir(conf), exist_ok=True)
    pid = "p" + secrets.token_hex(12)
    with open(os.path.join(_photo_dir(conf), pid + ".jpg"), "wb") as f:
        f.write(data)
    return pid, None


def _errlog_path(conf):
    return os.path.join(conf["data_dir"], "client-errors.log")


def _log_client_error(conf, environ, body):
    """Hängt einen Fehler (vom Handy gemeldet) an data/client-errors.log an: Zeitpunkt, Gerät/Browser, Schritt,
    Fehlername und -meldung, Dateityp, Dateigröße … Alte Einträge werden ab ERRLOG_KEEP abgeschnitten."""
    entry = {"time": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()),
             "ua": str(environ.get("HTTP_USER_AGENT", ""))[:300]}
    for key in ERRLOG_FIELDS:
        val = body.get(key)
        if isinstance(val, (int, float)) and not isinstance(val, bool):
            entry[key] = val
        elif val is not None:
            entry[key] = str(val)[:500]
    line = json.dumps(entry, ensure_ascii=False)
    path = _errlog_path(conf)
    with _lock:
        os.makedirs(conf["data_dir"], exist_ok=True)
        lines = _read_errlog(conf)
        lines.append(line)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write("\n".join(lines[-ERRLOG_KEEP:]) + "\n")
        os.replace(tmp, path)


def _read_errlog(conf):
    try:
        with open(_errlog_path(conf), encoding="utf-8") as f:
            return [ln for ln in f.read().splitlines() if ln.strip()]
    except OSError:
        return []


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
            return _json(start_response, "200 OK", {"token": _token(conf), "players": _add_player(conf, body.get("name"))})
        time.sleep(1)  # bremst Rateversuche
        return _json(start_response, "401 Unauthorized", {"error": "Falsches Passwort"})

    # Fotos anzeigen: <img> kann keinen Header schicken, daher Token als ?t=…
    if path.startswith("photo/") and method == "GET":
        pid = path[6:]
        qs = environ.get("QUERY_STRING", "")
        tok = next((part[2:] for part in qs.split("&") if part.startswith("t=")), "")
        if not PHOTO_ID.fullmatch(pid) or not hmac.compare_digest(tok, _token(conf)):
            return _not_found(start_response)
        full = os.path.join(_photo_dir(conf), pid + ".jpg")
        if not os.path.isfile(full):
            return _not_found(start_response)
        with open(full, "rb") as f:
            body = f.read()
        start_response("200 OK", [("Content-Type", "image/jpeg"), ("Content-Length", str(len(body))),
                                  ("Cache-Control", "private, max-age=86400")])
        return [body]

    if not _authorized(environ, conf):
        return _json(start_response, "401 Unauthorized", {"error": "Nicht angemeldet"})

    if path == "photo" and method == "POST":
        pid, err = _save_photo(conf, environ)
        if not pid:
            return _json(start_response, "400 Bad Request", {"error": err})
        return _json(start_response, "200 OK", {"id": pid})

    # Fehlerprotokoll: melden, ansehen (neueste zuerst), leeren
    if path == "client-error" and method == "POST":
        body = _read_body(environ)
        if not isinstance(body, dict):
            return _json(start_response, "400 Bad Request", {"error": "Ungültige Anfrage"})
        _log_client_error(conf, environ, body)
        return _json(start_response, "200 OK", {"ok": True})
    if path == "client-errors" and method == "GET":
        entries = []
        for ln in reversed(_read_errlog(conf)[-30:]):
            try:
                entries.append(json.loads(ln))
            except ValueError:
                pass
        return _json(start_response, "200 OK", {"entries": entries, "total": len(_read_errlog(conf))})
    if path == "client-errors/clear" and method == "POST":
        with _lock:
            try:
                os.remove(_errlog_path(conf))
            except OSError:
                pass
        return _json(start_response, "200 OK", {"ok": True})

    # Name melden (beim App-Start und nach „Name ändern“) – auch für schon Angemeldete
    if path == "player" and method == "POST":
        body = _read_body(environ) or {}
        return _json(start_response, "200 OK", {"players": _add_player(conf, body.get("name"))})

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
            return _json(start_response, "200 OK", {"version": doc["version"], "unchanged": True, "now": _now_ms(),
                                                    "players": _load_players(conf)})
        return _json(start_response, "200 OK", dict(doc, now=_now_ms(), players=_load_players(conf)))

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
            _gc_photos(conf, body["state"])
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
