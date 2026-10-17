# Operação Madeira - Das Spiel online stellen

Die Webseite braucht einen kleinen Server, damit alle drei Handys denselben
Spielstand sehen. Am einfachsten und **kostenlos ohne Kreditkarte** geht das mit
[PythonAnywhere](https://www.pythonanywhere.com). Der Server braucht keine
zusätzlichen Pakete.

Ergebnis: ein Link wie `https://maxi.pythonanywhere.com/k7Hq2xPz9w/` –
ohne den geheimen Teil am Ende gibt es nur „Not Found“. Beim ersten Öffnen
fragt die Seite nach Name und Passwort.

## 1. Konto anlegen

1. Auf <https://www.pythonanywhere.com> ein kostenloses „Beginner“-Konto anlegen.
   Der Benutzername steht später im Link (`benutzername.pythonanywhere.com`).

## 2. Code holen

1. Im Dashboard **Consoles → Bash** öffnen.
2. Eingeben:
   ```bash
   git clone -b claude/madeira-game-website-xyo2d8 https://github.com/maxalresch-coder/madeira-spiel.git
   ```
   Ist das Repository privat, fragt git nach Benutzername und einem
   GitHub-Token (statt Passwort). Alternativ das Repo kurz öffentlich machen.

## 3. Web-App einrichten

1. Oben auf **Web → Add a new web app** → Weiter → **Manual configuration** →
   eine Python-Version wählen (z. B. 3.10 oder neuer).
2. Auf der Web-Seite bei **Code → WSGI configuration file** auf den Link klicken.
3. Den gesamten Inhalt löschen und den Inhalt von `pythonanywhere_wsgi.py`
   einfügen. Darin anpassen:
   - `DEIN_BENUTZERNAME` → euer PythonAnywhere-Benutzername
   - `MADEIRA_PASSWORD` → euer Passwort
   - `MADEIRA_LINK_KEY` → ein langer, zufälliger Teil aus Buchstaben und Zahlen
     (z. B. `k7Hq2xPz9wLm`). Das ist der eigentliche Schutz.
4. Speichern, zurück zur Web-Seite und oben auf **Reload** klicken.
5. Unter **Security** „Force HTTPS“ einschalten.

Fertig. Der Link für euch drei lautet:

```
https://BENUTZERNAME.pythonanywhere.com/MADEIRA_LINK_KEY/
```

Tipp: Auf dem Handy die Seite „Zum Home-Bildschirm hinzufügen“ – dann
öffnet sie sich wie eine App.

## Updates einspielen

Wenn sich am Spiel etwas ändert (neue Quests, Optik …):

```bash
cd ~/madeira-spiel && git pull
```

und danach auf der Web-Seite **Reload** klicken. Der Spielstand liegt in
`~/madeira-spiel/data/state.json` und bleibt dabei erhalten, ebenso die Erinnerungsfotos
(`~/madeira-spiel/data/memories/`, Liste in `data/memories.json`) – die löscht nur der komplette Reset.

> Hinweis: Kostenlose PythonAnywhere-Apps muss man alle 3 Monate einmal per
> Knopfdruck („Run until 3 months from today“) verlängern – für einen Urlaub
> reicht das locker.

## Lokal ausprobieren

```bash
MADEIRA_PASSWORD=test MADEIRA_LINK_KEY=geheim python3 server.py
```

Dann <http://localhost:8000/geheim/> öffnen. Tests der Spiellogik:
`node tests/logic.test.js`.
