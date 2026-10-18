#!/usr/bin/env python3
"""Operação Madeira - Das Spiel – kleiner Server ohne externe Abhängigkeiten.

Aufgaben:
  * liefert die Webseite (Ordner public/) aus – nur unter dem geheimen Link
  * prüft das Passwort und gibt ein Token aus
  * speichert den gemeinsamen Spielstand (data/state.json) mit Versionsnummer,
    damit alle drei Handys denselben Stand sehen
  * nimmt Fotos der Hilfsmittel entgegen (data/photos/, nur vorübergehend: Fotos, auf die der
    Spielstand nicht mehr verweist, werden automatisch gelöscht – z. B. nach „Geschafft“, „Neue Runde“ oder Reset)
  * führt ein Fehlerprotokoll (data/client-errors.log, eine JSON-Zeile je Fehler), das die Handys automatisch füllen:
    Foto-Upload, unerwartete Fehler, fehlgeschlagene Server-Anfragen und Synchronisierung – anzusehen in der App unter
    Einstellungen → Fehlerprotokoll. Gleiche allgemeine Fehler kurz hintereinander werden zusammengefasst (count).
  * speichert Erinnerungsfotos – höchstens eins je Quest, dauerhaft (data/memories/, Liste in data/memories.json,
    jeweils Foto + kleines Vorschaubild); gelöscht werden sie nur einzeln oder beim kompletten Reset
  * speichert die 3 Mitspieler-Namen für die Hilfsmittel (data/team.json, Einstellungen → Mitspieler)
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
from urllib.parse import parse_qs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
MAX_BODY = 2 * 1024 * 1024
MAX_PHOTO = 600 * 1024          # Fotos werden im Browser auf ~1.000 px / < 200 KB verkleinert
PHOTO_ID = re.compile(r"p[0-9a-f]{24}")
PHOTO_GRACE = 120               # Sekunden: frisch hochgeladene Fotos nicht sofort wieder löschen
ERRLOG_KEEP = 500               # so viele Einträge behält das Fehlerprotokoll höchstens
ERRLOG_FIELDS = ("stage", "name", "message", "fileName", "fileType", "fileSize", "attempts", "player", "detail",
                 "pick", "readDelayMs", "sync", "readWays", "lastModified",
                 "source", "autoTries", "okTry",
                 "kind", "where", "count", "stack")
ERRLOG_MERGE = 600              # Sekunden: gleiche allgemeine Fehler in diesem Abstand werden zusammengefasst
MEMORY_ID = re.compile(r"m[0-9a-f]{24}")
QUEST_ID = re.compile(r"[A-Za-z0-9_-]{1,40}")
MAX_THUMB = 120 * 1024          # Vorschaubild (im Browser ~240 px)
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


def _team_path(conf):
    return os.path.join(conf["data_dir"], "team.json")


def _load_team(conf):
    """Die 3 Mitspieler-Namen (Einstellungen → Mitspieler), die alle Hilfsmittel verwenden. Noch nie gespeichert:
    vorausgefüllt mit den ersten bekannten Anmelde-Namen (fehlende Plätze leer)."""
    try:
        with open(_team_path(conf), encoding="utf-8") as f:
            names = json.load(f)
        if isinstance(names, list) and len(names) == 3 and all(isinstance(n, str) for n in names):
            if not any(n.strip() for n in names):  # alles leer: wie nie gespeichert
                raise ValueError
            return {"names": names, "saved": True}
    except (FileNotFoundError, ValueError):
        pass
    known = _load_players(conf)[:3]
    return {"names": known + [""] * (3 - len(known)), "saved": False}


def _save_team(conf, names):
    if not isinstance(names, list) or len(names) != 3:
        return "Bitte genau 3 Namen."
    clean = [" ".join(str(n or "").split())[:24] for n in names]
    filled = [n.lower() for n in clean if n]
    if len(set(filled)) != len(filled):
        return "Bitte keine doppelten Namen."
    with _lock:
        _write_team(conf, clean)
    return None


def _write_team(conf, names):
    os.makedirs(conf["data_dir"], exist_ok=True)
    tmp = _team_path(conf) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(names, f, ensure_ascii=False)
    os.replace(tmp, _team_path(conf))


UNNAMED = re.compile(r"(mit)?spieler\s*\d?", re.I)


def _team_autofill(conf, name):
    """Meldet sich jemand mit einem neuen Namen an und ist in der Mitspieler-Liste ein Platz frei (leer oder
    unbenannt, z. B. „Spieler 2“), wird der Name dort eingetragen – nie doppelt. Ohne gespeicherte Liste ergibt sie sich
    ohnehin aus den Anmelde-Namen (siehe _load_team)."""
    name = " ".join(str(name or "").split())[:24]
    if not name:
        return
    with _lock:
        try:
            with open(_team_path(conf), encoding="utf-8") as f:
                team = json.load(f)
        except (FileNotFoundError, ValueError):
            return
        if not (isinstance(team, list) and len(team) == 3):
            return
        if name.lower() in [str(n).lower() for n in team]:
            return
        for i, n in enumerate(team):
            if not str(n).strip() or UNNAMED.fullmatch(str(n).strip()):
                team[i] = name
                _write_team(conf, team)
                return


def _photo_dir(conf):
    return os.path.join(conf["data_dir"], "photos")


def _gc_photos(conf, state):
    """Löscht Fotos, auf die der Spielstand nicht (mehr) verweist – immer erst nach einer kurzen Schonfrist:
    Ein Foto wird hochgeladen, kurz bevor es in den Spielstand eingetragen wird. Speichert in diesem Moment ein
    anderes Handy (auch direkt nach einem Reset, wenn es noch gar keine Hilfsmittel-Zustände gibt), darf das frische
    Foto nicht verschwinden."""
    folder = _photo_dir(conf)
    if not os.path.isdir(folder):
        return
    used = set(PHOTO_ID.findall(json.dumps(state)))
    grace = PHOTO_GRACE
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
    path = _errlog_path(conf)
    with _lock:
        os.makedirs(conf["data_dir"], exist_ok=True)
        lines = _read_errlog(conf)
        if entry.get("kind") == "general":
            lines = _merge_error(lines, entry)
        else:
            lines.append(json.dumps(entry, ensure_ascii=False))
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write("\n".join(lines[-ERRLOG_KEEP:]) + "\n")
        os.replace(tmp, path)


def _merge_error(lines, entry):
    """Allgemeine Fehler (nicht Foto): Gab es denselben Fehler (Schritt, Name, Meldung, Ort, Spieler) vor kurzem schon,
    wird dieser Eintrag hochgezählt (count, lastTime) und ans Ende gerückt, statt hundertfach eingetragen zu werden."""
    key = tuple(entry.get(k) for k in ("stage", "name", "message", "where", "player"))
    try:
        count = max(1, int(entry.get("count") or 1))
    except (TypeError, ValueError):
        count = 1
    entry["count"] = count
    now = time.time()
    for i in range(len(lines) - 1, max(-1, len(lines) - 51), -1):
        try:
            old = json.loads(lines[i])
        except ValueError:
            continue
        if old.get("kind") != "general" or tuple(old.get(k) for k in ("stage", "name", "message", "where", "player")) != key:
            continue
        last = old.get("lastTime") or old.get("time") or ""
        try:
            age = now - time.mktime(time.strptime(last, "%Y-%m-%d %H:%M:%S"))
        except ValueError:
            age = ERRLOG_MERGE + 1
        if age > ERRLOG_MERGE:
            break
        old["count"] = int(old.get("count") or 1) + count
        old["lastTime"] = entry["time"]
        old["ua"] = entry.get("ua", old.get("ua"))
        del lines[i]
        lines.append(json.dumps(old, ensure_ascii=False))
        return lines
    lines.append(json.dumps(entry, ensure_ascii=False))
    return lines


def _read_errlog(conf):
    try:
        with open(_errlog_path(conf), encoding="utf-8") as f:
            return [ln for ln in f.read().splitlines() if ln.strip()]
    except OSError:
        return []

# ---------------------------------------------------------------- Erinnerungsfotos
# Je Quest höchstens ein Foto, dauerhaft (nicht im Spielstand, nicht vom Aufräumen der Hilfsmittel-Fotos betroffen).
# Dateien: data/memories/<id>.jpg (≤ 1.000 px, im Browser verkleinert) und <id>.t.jpg (Vorschaubild).
# Liste: data/memories.json = {"v": Versionsnummer, "items": {questId: {"f": id, "t": ms, "by": Name, "label": …,
# "size": Bytes, "tsize": Bytes}}}. Ist eine Quest gerade nicht erledigt (rückgängig gemacht), bleibt ihr Foto liegen,
# wird aber nirgends angezeigt und nicht heruntergeladen. Der komplette Reset löscht alle.
def _mem_dir(conf):
    return os.path.join(conf["data_dir"], "memories")


def _mem_path(conf):
    return os.path.join(conf["data_dir"], "memories.json")


def _load_mem(conf):
    try:
        with open(_mem_path(conf), encoding="utf-8") as f:
            doc = json.load(f)
        if isinstance(doc, dict) and isinstance(doc.get("items"), dict):
            return doc
    except (FileNotFoundError, ValueError):
        pass
    return {"v": 0, "items": {}}


def _save_mem(conf, doc):
    os.makedirs(conf["data_dir"], exist_ok=True)
    doc["v"] = int(doc.get("v") or 0) + 1
    tmp = _mem_path(conf) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False)
    os.replace(tmp, _mem_path(conf))


def _mem_remove_files(conf, fid):
    for suffix in (".jpg", ".t.jpg"):
        try:
            os.remove(os.path.join(_mem_dir(conf), fid + suffix))
        except OSError:
            pass


def _dir_bytes(folder):
    total = 0
    for root, _dirs, files in os.walk(folder):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass
    return total


def _mem_info(conf):
    doc = _load_mem(conf)
    return {"v": doc.get("v", 0), "items": doc["items"], "cert": doc.get("cert"), "bytes": _dir_bytes(_mem_dir(conf)),
            "dataBytes": _dir_bytes(conf["data_dir"])}


def _save_cert(conf, ids):
    """Fotos für die Urkunde (Einstellungen → Erinnerungsfotos, vor der Urkunde): bis zu 6 Quest-IDs, für alle Handys."""
    if not isinstance(ids, list) or len(ids) > 6 or not all(isinstance(i, str) and QUEST_ID.fullmatch(i) for i in ids):
        return "Bitte höchstens 6 Fotos."
    with _lock:
        doc = _load_mem(conf)
        doc["cert"] = list(dict.fromkeys(ids))
        _save_mem(conf, doc)
    return None


# ---------------------------------------------------------------- Test-Simulation
# „Testspiel simulieren“ (Einstellungen): Der echte Stand (state.json, memories.json, Erinnerungsfotos, Hilfsmittel-Fotos)
# wird nach data/sim-backup/ verschoben, dann gilt der vom Handy erzeugte Test-Spielstand (für alle Handys).
# „Simulation beenden“ löscht alle Simulationsdaten und holt den echten Stand unverändert zurück (nur die Versionsnummern
# werden erhöht, damit jedes Handy neu lädt). Solange data/sim-backup/ existiert, ist die Simulation aktiv.
SIM_ITEMS = ("state.json", "memories.json", "memories", "photos")


def _sim_dir(conf):
    return os.path.join(conf["data_dir"], "sim-backup")


def _sim_info(conf):
    try:
        with open(os.path.join(_sim_dir(conf), "sim.json"), encoding="utf-8") as f:
            info = json.load(f)
        return {"active": True, "since": info.get("since"), "by": info.get("by", "")}
    except (OSError, ValueError):
        return {"active": os.path.isdir(_sim_dir(conf))}


def _remove(path):
    import shutil
    if os.path.isdir(path):
        shutil.rmtree(path, ignore_errors=True)
    elif os.path.exists(path):
        os.remove(path)


def _sim_start(conf, state, by):
    import shutil
    if os.path.isdir(_sim_dir(conf)):
        return "Es läuft schon eine Simulation."
    if not isinstance(state, dict) or not isinstance(state.get("log"), list):
        return "Ungültiger Test-Spielstand."
    with _lock:
        real = _load(conf)
        real_v = _load_mem(conf).get("v", 0)
        tmp = _sim_dir(conf) + ".tmp"
        _remove(tmp)
        os.makedirs(tmp)
        for name in SIM_ITEMS:  # echter Stand: Dateien kopieren bzw. Ordner verschieben
            src = os.path.join(conf["data_dir"], name)
            if os.path.isdir(src):
                shutil.move(src, os.path.join(tmp, name))
            elif os.path.exists(src):
                shutil.copy2(src, os.path.join(tmp, name))
        with open(os.path.join(tmp, "sim.json"), "w", encoding="utf-8") as f:
            json.dump({"since": _now_ms(), "by": " ".join(str(by or "").split())[:24], "version": real["version"], "memv": real_v}, f)
        os.replace(tmp, _sim_dir(conf))
        _remove(os.path.join(conf["data_dir"], "memories.json"))
        _save(conf, {"version": real["version"] + 1, "state": state})
        _save_mem(conf, {"v": real_v + 1, "items": {}, "cert": None})
    return None


def _sim_stop(conf):
    import shutil
    backup = _sim_dir(conf)
    if not os.path.isdir(backup):
        return "Es läuft keine Simulation."
    with _lock:
        sim_v = _load(conf)["version"]
        sim_mv = _load_mem(conf).get("v", 0)
        for name in SIM_ITEMS:  # alle Simulationsdaten löschen
            _remove(os.path.join(conf["data_dir"], name))
        for name in SIM_ITEMS:  # echten Stand zurückholen
            src = os.path.join(backup, name)
            if os.path.exists(src):
                shutil.move(src, os.path.join(conf["data_dir"], name))
        real = _load(conf)
        if real.get("state") is not None:  # Inhalt unverändert, nur neue Versionsnummer
            _save(conf, {"version": max(sim_v, real["version"]) + 1, "state": real["state"]})
        else:
            _remove(_state_path(conf))
        mem = _load_mem(conf)
        mem["v"] = max(sim_mv, mem.get("v", 0))
        _save_mem(conf, mem)
        _remove(backup)
    return None


def _clean_label(text):
    """Teil des Dateinamens im ZIP: nur Buchstaben, Ziffern, - und _ (der Browser schreibt Umlaute schon um)."""
    text = re.sub(r"[^A-Za-z0-9_-]+", "-", str(text or ""))
    return re.sub(r"-{2,}", "-", text).strip("-_")[:80] or "Quest"


def _save_memory(conf, environ, qid, query):
    """Body = Vorschaubild + Foto hintereinander (beide JPEG), tl = Länge des Vorschaubilds. Ersetzt ein altes Foto."""
    try:
        length = int(environ.get("CONTENT_LENGTH") or -1)
        tl = int(query.get("tl", "0"))
    except ValueError:
        return "Ungültige Anfrage"
    if length > MAX_PHOTO + MAX_THUMB:
        return "Foto zu groß (%d KB)" % (length // 1024)
    data = environ["wsgi.input"].read(length if length >= 0 else MAX_PHOTO + MAX_THUMB + 1)
    if not data:
        return "leeres Foto angekommen"
    if len(data) > MAX_PHOTO + MAX_THUMB or not 0 < tl <= MAX_THUMB or len(data) - tl > MAX_PHOTO:
        return "Foto zu groß"
    thumb, full = data[:tl], data[tl:]
    if thumb[:3] != b"\xff\xd8\xff" or full[:3] != b"\xff\xd8\xff":
        return "kein JPEG angekommen"
    os.makedirs(_mem_dir(conf), exist_ok=True)
    fid = "m" + secrets.token_hex(12)
    with open(os.path.join(_mem_dir(conf), fid + ".jpg"), "wb") as f:
        f.write(full)
    with open(os.path.join(_mem_dir(conf), fid + ".t.jpg"), "wb") as f:
        f.write(thumb)
    with _lock:
        doc = _load_mem(conf)
        old = doc["items"].get(qid)
        doc["items"][qid] = {"f": fid, "t": _now_ms(), "by": " ".join(str(query.get("by", "")).split())[:24],
                             "label": _clean_label(query.get("label")), "size": len(full), "tsize": len(thumb)}
        _save_mem(conf, doc)
    if old and old.get("f") != fid:
        _mem_remove_files(conf, old.get("f", ""))
    return None


def _delete_memory(conf, qid):
    with _lock:
        doc = _load_mem(conf)
        old = doc["items"].pop(qid, None)
        if old:
            _save_mem(conf, doc)
    if old:
        _mem_remove_files(conf, old.get("f", ""))


def _clear_memories(conf):
    """Kompletter Reset: alle Erinnerungsfotos löschen."""
    with _lock:
        doc = _load_mem(conf)
        if doc["items"] or doc.get("cert") is not None:
            doc["items"] = {}
            doc["cert"] = None
            _save_mem(conf, doc)
    folder = _mem_dir(conf)
    if os.path.isdir(folder):
        for name in os.listdir(folder):
            try:
                os.remove(os.path.join(folder, name))
            except OSError:
                pass


def _is_reset(old, new):
    """Neues Spiel durch „Kompletter Reset“ (bzw. „Neues Spiel starten“): anderer Zufallswert und der erste Eintrag
    bei den Aktivitäten ist der Reset. Ein Wiederherstellen derselben Partie behält den Zufallswert."""
    if not isinstance(old, dict) or not isinstance(new, dict) or old.get("seed") == new.get("seed"):
        return False
    log = new.get("log")
    return isinstance(log, list) and bool(log) and isinstance(log[0], dict) and log[0].get("type") == "reset"


def _memories_zip(conf, tz_minutes):
    """Alle sichtbaren Erinnerungsfotos (nur Quests, die gerade erledigt sind) als ZIP, Dateinamen
    JJJJ-MM-TT_Region_Quest.jpg – Datum = wann die Quest erledigt wurde (Ortszeit des Handys: tz_minutes)."""
    import io
    import zipfile
    state = _load(conf).get("state") or {}
    done = {}
    for group in ("quests", "done"):
        for qid, info in (state.get(group) or {}).items():
            if isinstance(info, dict):
                done[qid] = info.get("t") or 0
    items = sorted(_load_mem(conf)["items"].items(), key=lambda kv: (done.get(kv[0], 0), kv[0]))
    buf = io.BytesIO()
    names = set()
    count = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        for qid, item in items:
            if qid not in done:
                continue
            full = os.path.join(_mem_dir(conf), str(item.get("f", "")) + ".jpg")
            if not MEMORY_ID.fullmatch(str(item.get("f", ""))) or not os.path.isfile(full):
                continue
            ts = (done[qid] or item.get("t") or 0) / 1000.0 - tz_minutes * 60
            base = time.strftime("%Y-%m-%d", time.gmtime(ts)) + "_" + _clean_label(item.get("label") or qid)
            name, n = base + ".jpg", 2
            while name in names:
                name, n = "%s-%d.jpg" % (base, n), n + 1
            names.add(name)
            zf.write(full, name)
            count += 1
    return buf.getvalue(), count


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


def _query(environ):
    return {k: v[0] for k, v in parse_qs(environ.get("QUERY_STRING", "")).items()}


def _token_ok(environ, conf):
    """Token als ?t=… – für <img> und Download-Links, die keinen Header schicken können."""
    return hmac.compare_digest(_query(environ).get("t", ""), _token(conf))


def _authorized(environ, conf):
    auth = environ.get("HTTP_AUTHORIZATION", "")
    return auth.startswith("Bearer ") and hmac.compare_digest(auth[7:], _token(conf))


def _api(path, environ, start_response, conf):
    method = environ["REQUEST_METHOD"]

    if path == "login" and method == "POST":
        body = _read_body(environ) or {}
        if conf["password"] and hmac.compare_digest(str(body.get("password", "")), conf["password"]):
            players = _add_player(conf, body.get("name"))
            _team_autofill(conf, body.get("name"))
            return _json(start_response, "200 OK", {"token": _token(conf), "players": players})
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

    # Erinnerungsfotos anzeigen (…/<id>.jpg, Vorschaubild …/<id>.t.jpg) und alle als ZIP herunterladen
    if path.startswith("memory-file/") and method == "GET":
        name = path[12:]
        fid = name[:-6] if name.endswith(".t.jpg") else name[:-4] if name.endswith(".jpg") else ""
        if not MEMORY_ID.fullmatch(fid) or not _token_ok(environ, conf):
            return _not_found(start_response)
        full = os.path.join(_mem_dir(conf), name)
        if not os.path.isfile(full):
            return _not_found(start_response)
        with open(full, "rb") as f:
            body = f.read()
        start_response("200 OK", [("Content-Type", "image/jpeg"), ("Content-Length", str(len(body))),
                                  ("Cache-Control", "private, max-age=31536000, immutable")])
        return [body]
    if path == "memories.zip" and method == "GET":
        if not _token_ok(environ, conf):
            return _not_found(start_response)
        try:
            tz = max(-900, min(900, int(_query(environ).get("tz", "0"))))
        except ValueError:
            tz = 0
        body, _count = _memories_zip(conf, tz)
        fname = "operacao-madeira-fotos-" + time.strftime("%Y-%m-%d", time.gmtime(time.time() - tz * 60)) + ".zip"
        start_response("200 OK", [("Content-Type", "application/zip"), ("Content-Length", str(len(body))),
                                  ("Content-Disposition", 'attachment; filename="' + fname + '"'),
                                  ("Cache-Control", "no-store")])
        return [body]

    if not _authorized(environ, conf):
        return _json(start_response, "401 Unauthorized", {"error": "Nicht angemeldet"})

    if path == "memories" and method == "GET":
        return _json(start_response, "200 OK", _mem_info(conf))
    if path == "memories/cert" and method == "POST":
        err = _save_cert(conf, (_read_body(environ) or {}).get("ids"))
        if err:
            return _json(start_response, "400 Bad Request", {"error": err})
        return _json(start_response, "200 OK", _mem_info(conf))
    if path == "sim/start" and method == "POST":
        body = _read_body(environ) or {}
        err = _sim_start(conf, body.get("state"), body.get("by"))
        if err:
            return _json(start_response, "409 Conflict", {"error": err})
        return _json(start_response, "200 OK", dict(_load(conf), now=_now_ms(), sim=_sim_info(conf)))
    if path == "sim/stop" and method == "POST":
        err = _sim_stop(conf)
        if err:
            return _json(start_response, "409 Conflict", {"error": err})
        return _json(start_response, "200 OK", dict(_load(conf), now=_now_ms(), sim=_sim_info(conf)))
    if path.startswith("memory/") and method == "POST":
        parts = path[7:].split("/")
        if not QUEST_ID.fullmatch(parts[0]) or len(parts) > 2 or (len(parts) == 2 and parts[1] != "delete"):
            return _not_found(start_response)
        if len(parts) == 2:
            _delete_memory(conf, parts[0])
        else:
            err = _save_memory(conf, environ, parts[0], _query(environ))
            if err:
                return _json(start_response, "400 Bad Request", {"error": err})
        return _json(start_response, "200 OK", _mem_info(conf))

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

    # Mitspieler (3 Namen für alle Hilfsmittel) speichern – gilt für alle Handys, bleibt auch nach einem Reset
    if path == "team" and method == "POST":
        body = _read_body(environ) or {}
        err = _save_team(conf, body.get("names"))
        if err:
            return _json(start_response, "400 Bad Request", {"error": err})
        return _json(start_response, "200 OK", {"team": _load_team(conf)})

    # Name melden (beim App-Start und nach „Name ändern“) – auch für schon Angemeldete
    if path == "player" and method == "POST":
        body = _read_body(environ) or {}
        players = _add_player(conf, body.get("name"))
        _team_autofill(conf, body.get("name"))
        return _json(start_response, "200 OK", {"players": players})

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
                                                    "players": _load_players(conf), "team": _load_team(conf),
                                                    "memv": _load_mem(conf).get("v", 0), "sim": _sim_info(conf)})
        return _json(start_response, "200 OK", dict(doc, now=_now_ms(), players=_load_players(conf), team=_load_team(conf),
                                                    memv=_load_mem(conf).get("v", 0), sim=_sim_info(conf)))

    if path == "state" and method == "POST":
        body = _read_body(environ)
        if not body or "state" not in body or "baseVersion" not in body:
            return _json(start_response, "400 Bad Request", {"error": "Ungültige Anfrage"})
        with _lock:
            doc = _load(conf)
            if body["baseVersion"] != doc["version"]:
                return _json(start_response, "409 Conflict", doc)
            reset = _is_reset(doc.get("state"), body["state"])
            doc = {"version": doc["version"] + 1, "state": body["state"]}
            _save(conf, doc)
            _gc_photos(conf, body["state"])
        if reset:
            _clear_memories(conf)  # kompletter Reset: auch alle Erinnerungsfotos weg
        return _json(start_response, "200 OK", {"version": doc["version"], "now": _now_ms(),
                                                "memv": _load_mem(conf).get("v", 0), "sim": _sim_info(conf)})

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
