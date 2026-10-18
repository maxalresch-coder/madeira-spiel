# CLAUDE.md – Operação Madeira - Das Spiel

Kurzanleitung für neue Chats. Der Nutzer ist **Anfänger**: am Ende jeder Aufgabe kurz und einfach
auf Deutsch erklären, was geändert wurde, und sagen, ob nach dem Update ein **Reset** nötig ist.

## Arbeitsweise (immer)
- **Branch:** immer auf `claude/madeira-game-website-xyo2d8` arbeiten und genau dorthin pushen.
  Vorher `git pull origin claude/madeira-game-website-xyo2d8` (der Nutzer lädt z. B. Bilder über GitHub hoch).
  Keinen neuen Branch, keinen PR ohne ausdrücklichen Wunsch.
- **Repository- und Ordnername `madeira-spiel` nie ändern** (PythonAnywhere-Update hängt daran).
- Tests: `node tests/logic.test.js` muss durchlaufen; bei Regeländerungen Tests ergänzen.
- Spielregeln/Punkte/Quest-Texte nur ändern, wenn ausdrücklich verlangt. Quest-Texte **wortwörtlich** lassen.
- In Quest-Texten (content.js) **nie das Wort „geheim“** verwenden.
- Oberfläche im Browser prüfen (Playwright, Chromium vorinstalliert; Handybreite 360 und 390 px).
  Lokal: `MADEIRA_PASSWORD=test MADEIRA_LINK_KEY=geheim python3 server.py` → http://localhost:8000/geheim/
- **Android und iPhone:** Wir nutzen Android (Chrome) **und** iPhone (Safari). Jede Funktion muss auf beiden laufen. Wo ein
  Gerät etwas nicht kann, gibt es einen sinnvollen Ersatz (z. B. Vibration nur auf Android → auf dem iPhone kurzer Ton
  `beep`/`signalEnd` bzw. sichtbares Aufblinken `tapFeedback`; Datei-Felder nie `display:none`, sonst öffnet Safari die
  Auswahl teils nicht). Nach Änderungen zusätzlich in WebKit testen (Playwright `webkit` + iPhone-Geräteemulation). Ist
  WebKit in der Umgebung nicht installiert (`/opt/pw-browsers` enthält nur Chromium; `playwright install` nicht ausführen),
  in Chromium mit iPhone-Emulation testen (iPhone-Viewport/Touch, ohne `navigator.vibrate`, `createImageBitmap` ohne
  Größen-Optionen) und dem Nutzer sagen, was nur auf einem echten iPhone prüfbar ist.
- OpenStreetMap/Nominatim/Wikipedia sind in der Umgebung gesperrt; Koordinaten per Websuche ermitteln
  und mit den Gemeindegrenzen (CAOP, github.com/nmota/caop_GeoJSON) prüfen. Pins nie eigenmächtig verschieben,
  Abweichungen melden.

## Updates auf PythonAnywhere (für den Nutzer)
1. Bash-Konsole: `cd ~/madeira-spiel && git pull` (bei „local changes“: `git checkout -- . && git pull`)
2. Web-Tab → **Reload**.
3. Nur wenn nötig: auf der Seite „Neues Spiel starten“ bzw. Reset. Ein Reset ist nötig, wenn sich Quest-/Stapel-IDs
   oder die Spielstand-Struktur ändern (dann `SCHEMA` in logic.js erhöhen → App zeigt automatisch „Neue Spielinhalte“).
Konfiguration in der WSGI-Datei (`pythonanywhere_wsgi.py`): `MADEIRA_PASSWORD`, `MADEIRA_LINK_KEY` (geheimer Link-Teil).
Spielstand: `data/state.json`, Spielernamen: `data/players.json`, Mitspieler: `data/team.json`, Fotos der Hilfsmittel: `data/photos/`,
Erinnerungsfotos: `data/memories/` + `data/memories.json`, während einer Test-Simulation der echte Stand in `data/sim-backup/` (alles nicht in git). Details: ANLEITUNG.md.

## Fehlerprotokoll (bei Problemen ZUERST hier nachsehen)
- Jeder Fehler beim Foto-Upload wird vom Handy automatisch an den Server gemeldet (`POST api/client-error`, ohne Netz in
  localStorage `errQueue` gemerkt und später nachgeschickt) und in **`data/client-errors.log`** gespeichert (auf PythonAnywhere:
  `~/madeira-spiel/data/client-errors.log`; eine JSON-Zeile je Fehler, höchstens 500): `time`, `ua` (Gerät/Browser), `stage`
  (Auswahl / Lesen / Verkleinern / Hochladen / Server / Eintragen / Aufnahme / Kamera), `name`, `message`, `fileName`, `fileType`, `fileSize`,
  `attempts` (alle Fehlversuche davor), `player`, `detail` (RAM, Bildschirm, Zeit); bei Galerie-Fotos zusätzlich `source`
  (Knopf: Galerie / Dateien / Kamera-App), `autoTries` (automatische Wiederholungen), `okTry` (welcher Versuch/Weg geklappt hat),
  `readWays` (jeder Versuch mit allen Lesewegen arrayBuffer / createImageBitmap / Objekt-URL + img und Ergebnis),
  `lastModified` (der Datei), `pick`
  (die wievielte Auswahl in dieser Sitzung), `readDelayMs` (ms zwischen change-Event und Lesebeginn) und `sync` (ob während
  „Galerie offen“ bzw. „beim Lesen“ eine Synchronisierung lief – sollte immer „nein“ sein, sie ist dann pausiert).
- „Kamera: Kamera-Erlaubnis abgelehnt“ / „Kamera: Kamera nicht verfügbar“ (getUserMedia fehlt, kein Gerät, Wechsel
  fehlgeschlagen), „Aufnahme: …“ = Foto aus dem Videobild ging schief.
- Bisher gefundene Ursachen (Android 10, Chrome, 4 GB): `NotReadableError … permission problems …` = Android entzieht die
  Leseerlaubnis kurz nach der Auswahl (→ Lesen startet synchron im change-Event); „Seite neu geladen“ während der
  Kamera-App (→ Kamera in der Seite); zweite Galerie-Auswahl über dasselbe, wiederverwendete Datei-Feld scheiterte mit
  `NotReadableError` (→ frisches Datei-Feld je Auswahl); der Lesefehler ist **zufällig** (dasselbe Bild klappt mal, mal nicht,
  auch bei Lesebeginn 0 ms ohne Synchronisierung) – vermutlich vergibt die Android-Foto-Auswahl die Leseerlaubnis fehlerhaft
  (→ automatische Wiederholungen, einmal automatisch neu öffnen, „Aus Dateien wählen“). „Gelesen nach Wiederholung“ = Info.
- **Allgemeine Fehler** (`reportError(stage, e)` in app.js, `kind: "general"`): Stufen „Unerwarteter Fehler“ (`window`
  `error`/`unhandledrejection`), „Server-Anfrage“ (jede fehlgeschlagene `api()`-Anfrage: keine Antwort/Zeitüberschreitung oder
  HTTP ≥ 400; nicht 409, nicht falsches Passwort, nicht das Melden selbst) und „Synchronisierung“ (Abholen in `poll`
  fehlgeschlagen, auch Fehler beim Anwenden/Zeichnen eines neuen Stands; Konflikt nach 4 Versuchen in `act`; Hilfsmittel nicht
  gespeichert in `flushTools`). Felder: `where` (Seite + oberstes Fenster, `whereNow`: Quest/Region/Hilfsmittel/
  Erinnerungsfoto; Fenster bekommen `openModal(…, {where})`), `player`, `stack` (gekürzt), `detail`, `count`, Gerät = `ua`.
  **Zusammenfassen:** dasselbe (Stufe, Name, Meldung, Ort) höchstens 1× pro Minute senden, Wiederholungen zählen und nachreichen
  (`errSeen`); offline in `errQueue` zusammengefasst (höchstens 30), beim Wieder-online nachgeschickt; der Server
  (`_merge_error`) zählt gleiche Einträge (auch Spieler gleich) innerhalb von 10 min hoch (`count`, `lastTime`, rückt ans Ende).
  Gesamtgröße wie bisher höchstens 500 Einträge. Die Foto-Protokollierung (`reportPhotoError`) ist unverändert.
- „Auswahl: Seite neu geladen“ = die Seite wurde neu geladen, während Kamera/Galerie offen war (Android hat den Browser wegen
  Speichermangel beendet; erkannt über localStorage `photoPick`).
- In der App: Einstellungen → **Fehlerprotokoll** (Unterseite `errors`): letzte 30 Einträge (`GET api/client-errors`),
  „Kopieren“ (Text für den Nutzer zum Weiterschicken), „Protokoll leeren“ (`POST api/client-errors/clear`, mit Rückfrage).
  Den Nutzer bei Foto-Problemen bitten, das Protokoll zu kopieren und zu schicken.

## Zweck
Private Handy-Webseite für 3 Freunde im Madeira-Urlaub: als **ein Team** alle 10 Regionen erkunden,
Quests erledigen, Punkte sammeln, am Ende Restpunkte in Belohnungen tauschen, Zertifikat als PDF.
Login = Name + Passwort; Schutz = geheimer Link. Gemeinsamer Spielstand (Polling alle 4 s, Versionsnummer, Konflikt → neu anwenden).
Vertrauensbasis, keine Beweisfotos.

## Begriffe (verbindlich)
- **Regionale Quests**: 30 Stück, 3 je Region, an Orte gebunden (Pins auf der Inselkarte). Grammatik: „eine regionale Quest“.
- **Stapel-Quests**: 26 Stück, überall machbar, gemischter Stapel, immer **3 offen**, Rest verdeckt; „vom Stapel ziehen“, „zurück in den Stapel“.
- Quests **nie „Karte“** nennen (kein „Bonus-Karte“, „Handkarte“). „Karte“ nur für die **Inselkarte**.
  Ausnahme: Quest-Texte („Kartenhaus“, „Karte“) bleiben wortwörtlich.
- Joker immer als **genutzt** zählen: „X von Y genutzt“ (nie „übrig“).
- Spielname: **„Operação Madeira - Das Spiel“** (Kurzform „Operação Madeira“).

## Regeln und Zahlen (logic.js)
- Regionen (Reihenfolge): Calheta, Ponta do Sol, Ribeira Brava, Câmara de Lobos, Funchal, Santa Cruz, Machico, Santana, São Vicente, Porto Moniz.
- Stufen je Region: 0 unbesucht (#c9ced4), 1 **Erkundet** (1 Quest, +100, #a6e3a1), 2 **Erobert** (2 Quests, +20, #2f9e44),
  3 **Erschlossen** (3 Quests, +20, #e5b53b). Diese Farben exakt überall verwenden, wo Stufen gezeigt werden.
- Alle 10 erkundet: „Madeira erkundet!“ +300 (Insel-Bonus). Alle erobert/erschlossen: Meilensteine
  „Madeira erobert!“/„Madeira erschlossen!“ mit großer Animation, **ohne Punkte**, bei den Aktivitäten (auch „nicht mehr erfüllt“).
- Stapel-Quests: einfach 15 (10×), mittel 25 (10×), schwer 50 (6×) = 700. Basis 1.000 + 300 + 700 = 2.000; mit Stufen 2.400.
- Shop (gesperrt bei negativem Kontostand): **Region-Joker** 150 P, 1 im Spiel (Region gilt als erkundet, ohne 100 P;
  weitere Quests heben normal); **Tausch-Joker** 10 P, 5 im Spiel; **Multiplikator** 10 P, 3 im Spiel, einer pro Stapel-Quest:
  95 % ×0,5–×2,0 (Zehnerschritte), 5 % Jackpot ×5, aufgerundet; Stapel-Quest mit Multiplikator nicht tauschbar.
- **Variables Maximum** = 2.400 + Σ(multiplizierter Wert − Grundwert) aller Stapel-Quests mit Multiplikator (offen oder erledigt);
  sofort neu bei Kauf/Rückgängig. Anzeige: „Maximum: 2.430 (Basis 2.400, Multiplikatoren +30)“, ohne Mult. nur „Maximum: 2.400“.
- Ränge nach **verdienten** Punkten (nicht Kontostand): Landstreicher ab 0, Abenteurer ab 700, Inselkönig ab 1.500 (fest).
- Rückgängig für alles (nicht Meilensteine/Reset/Ende); gleiche Ergebnisse bei Wiederholung (Würfe/Stapel beim Start fest).
  Punkte immer aus dem Spielstand berechnet. Aktivitäten (früher „Logbuch“) mit Zeit + Name. Reset gilt für alle, Eingabe „RESET“.
- **Offline-Schutz** (app.js): Server nicht erreichbar (Netz weg, Zeitüberschreitung, 5xx) → roter Streifen unter der Kopfzeile
  „Offline – Änderungen werden nicht gespeichert“, `body.is-offline`; speichernde Knöpfe (`SAVING_BUTTONS`: Abhaken, Rückgängig,
  Tausch, Multiplikator, Käufe, Ende, Reset, Wiederherstellen) sind ausgegraut und zeigen beim Antippen einen Hinweis. Ansehen
  geht weiter. Polling läuft weiter; ist der Server zurück, verschwindet der Streifen und der komplette Stand wird neu geladen.
  Schlägt das Speichern fehl → Fehlermeldung „… Die Aktion wurde NICHT ausgeführt.“, lokaler Stand bleibt unverändert.
- **Datum/Uhrzeit erledigter Quests:** `state.quests[id]` bzw. `state.done[id]` = `{by, t}`; `act` rechnet mit **Serverzeit**
  (`serverNow()`), damit alle Handys dieselbe Zeit speichern (für Erinnerungsfotos/Urlaubs-Rückblick). Rückgängig löscht den Eintrag.
- **Erinnerungsfotos** (app.js Abschnitt „Erinnerungsfotos“, server.py `_save_memory` …): je erledigter Quest (regional und Stapel)
  **genau ein** Foto, **dauerhaft**, als einzelne Dateien `data/memories/<id>.jpg` (+ Vorschaubild `<id>.t.jpg`, ≤ 320 px), Liste
  `data/memories.json` `{v, items: {questId: {f, t, by, label, size, tsize}}}` – **nicht im Spielstand**, nicht vom Aufräumen der
  Hilfsmittel-Fotos betroffen. Aufnehmen/Auswählen/Verkleinern laufen **unverändert** über die Foto-Grundlage (`photoPicker`,
  Kamera in der Seite, Galerie, „Aus Dateien wählen“, Wiederholungen, Fehlerprotokoll) mit der Kennung `"mem:<Quest-ID>"`
  (`isMem`; `toolBody` → `memoryBody`, `addPhotoJob` → `saveMemory` statt `toolDo`): Vorschaubild `makeThumb`, Hochladen
  `POST api/memory/<id>?tl=<Vorschau-Bytes>&label=…&by=…` (Body = Vorschaubild + Foto, über `uploadPhoto(blob, url)`), ersetzt ein
  altes Foto. Löschen `POST api/memory/<id>/delete`; Liste `GET api/memories` (+ `bytes`, `dataBytes`); Anzeigen
  `GET api/memory-file/<f>.jpg` bzw. `.t.jpg` `?t=<token>`. Jede Spielstand-Antwort hat `memv` → bei Änderung lädt `loadMemories`
  neu (synchron auf allen Handys). Wo: nach dem Abhaken (eigenes Handy) überspringbares Fenster „Erinnerungsfoto hinzufügen?“
  (`offerMemory`, wartet Banner/Animationen ab); im Quest-Fenster der erledigten Quest Zeile „Erinnerungsfoto hinzufügen/ansehen“
  (`memLine`); kleines Vorschaubild/Kamera-Knopf (`memChip`, 44 px) bei erledigten Stapel-Quests und bei den Aktivitäten;
  Fenster `openMemory` (Foto, Ersetzen, Löschen mit Rückfrage; nach einem Kamera-Foto schließt die Kamera). **Rückgängig** →
  Foto ausgeblendet (`memFor` zeigt nur Fotos erledigter Quests; Datei bleibt, erscheint nach erneutem Abhaken wieder).
  **Reset** → Server löscht alle (`_is_reset`: neuer Zufallswert + erster Aktivitäten-Eintrag „reset“; Wiederherstellen derselben
  Partie behält sie). Einstellungen → **Erinnerungsfotos** (Unterseite `photos`): Anzahl + belegter Speicher (Fotos und alle Daten),
  „Alle Fotos herunterladen (ZIP)“ = Link `GET api/memories.zip?t=<token>&tz=<Zeitzonen-Minuten>` (nur sichtbare Fotos, Namen
  `JJJJ-MM-TT_Region_Quest.jpg` aus Erledigt-Datum + `label`, Stapel-Quests „Stapel_…“), Raster mit Vorschaubildern.
- **Einführung** (`TOUR`, `startTour` in app.js): einmal pro Handy nach dem ersten Anmelden (localStorage `tourDone`), 5 Schritte
  mit Hervorhebung (Inselkarte, Kopf des Stapel-Quest-Blocks, Shop, Erfolge, Einstellungen), je ein Satz; Optik in **Gold**
  (Hervorhebung: goldener Rahmen + Schein; Erklär-Kasten hellgold mit goldenem Rand, „Weiter“ goldener Knopf); „Überspringen“, „Weiter“, am Ende
  „Los geht's“ (Escape = beenden). Wiederholbar: Einstellungen → Spielanleitung → „Einführung noch einmal ansehen“. Ebene `.tour`
  (z-index 75: über Fenstern, unter Toasts/Konfetti), Position wird bei Neuzeichnen/Scrollen/Größe angepasst (`tourPlace`).
- **Spielstand sichern/wiederherstellen** (Einstellungen, Abschnitt „Spielstand sichern“): lädt `operacao-madeira-JJJJ-MM-TT.json`
  herunter (`{app, savedAt, savedBy, version, state}`); Wiederherstellen prüft die Datei (`isCompatible`), fragt deutlich nach
  (überschreibt für alle Handys) und speichert sie als neuen Stand (nur online).
- **Hilfsmittel (Tools)** für einzelne regionale Quests und Stapel-Quests (`public/tools.js` = Liste `TOOLS` mit `label`/`icon` + reine Logik,
  getestet; Oberfläche in app.js). Zustand in `state.tools[questId]` (gleicher Server-Speicher wie der Spielstand,
  Warteschlange + Konflikt-Wiederholung, offline gesperrt); Reset löscht sie (newGame hat kein `tools`). Zeiten in
  **Serverzeit** (`now` in den API-Antworten → `app.clockOffset`), daher synchron auf allen Handys, auch nach Neuladen.
  **Regeln für alle (auch künftige) Hilfsmittel:**
  - Freiwillig; haken **nie** ab, geben **keine Punkte**; „Geschafft!“/„Daneben“ nur als Anzeige.
  - Das Wort „Werkzeug“ kommt in der App nicht vor (Begriff: „Hilfsmittel“).
  - Anzeige im Quest-Fenster unter der Aufgabe als **antippbare Zeile** wie ein Link: passendes Lucide-Icon + beschreibende
    Bezeichnung (z. B. „Countdown: 10 Sekunden“, „Höhe schätzen“), rechts ggf. Zustand (Strafzeit-Countdown, läuft, Geschafft)
    und Pfeil. Tippen öffnet das Hilfsmittel in einem eigenen Fenster. Links (`LINKS`) öffnen einen neuen Tab; eine Quest kann ein Hilfsmittel und Links haben.
  - **Strafzeit startet automatisch:** Erkennt das Hilfsmittel selbst einen Fehlversuch, startet sie sofort (ohne Rückfrage).
    Müssen Spieler selbst urteilen, gibt es einen Knopf „Daneben“ (Aktion `penalty`), der sie sofort startet. Nie zwei
    Bestätigungen hintereinander, kein Knopf „Strafzeit starten“. Gesperrt ist nur das Hilfsmittel dieser Quest (Countdown
    sichtbar, auch in der Zeile); alles andere bleibt nutzbar; synchron und übersteht Neuladen.
  - **Ein Handy für alle (Grundregel):** Jedes Hilfsmittel muss mit nur einem Handy komplett spielbar sein (3 Spieler, ein
    Handy) und weiterhin mit mehreren Handys. Neue Hilfsmittel darauf prüfen.
  - **Mitspieler** (Einstellungen → „Mitspieler“, Unterseite `team`): 3 frei bearbeitbare Namen, für alle Handys gleich
    (`data/team.json` auf dem Server, `POST api/team`, `team` kommt mit jeder Spielstand-Antwort → `app.team`; bleibt nach
    Reset). Leere Plätze erlaubt, keine doppelten Namen. Noch nie gespeichert → vorausgefüllt mit den ersten bekannten Anmelde-Namen (`data/players.json`).
    **Alle Hilfsmittel nehmen ihre Namen aus `teamNames()`** (Tic-Tac-Toe, Türen …), nicht aus den Anmeldungen; fehlen
    Namen, Hinweis + Knopf „Mitspieler eintragen“. Getipptes in den Feldern übersteht die Synchronisierung (`app.teamDraft`,
    Feld im Fokus wird nicht ersetzt).
  - **„Handy weitergeben“:** Nach dem Bestätigen von Geheimem (alle `T.isSecret`-Hilfsmittel, Aktion `fix` → Phase 2)
    zeigt **nur das bestätigende Handy** einen Zwischenbildschirm „Handy weitergeben“ mit „Weiter“ (`toolUI.handoff`,
    `handoffScreen`); andere Handys gehen direkt zum Raten. Ist die Phase inzwischen weiter, entfällt er automatisch.
  - Wortwahl: Knöpfe/Meldungen sagen **„Bestätigen“** (nie „Festschreiben“), z. B. „Bestätigen und vergleichen“.
  - **Mehrere Handys bleiben der Normalfall:** Jeder meldet sich auf seinem Handy mit eigenem Namen an und spielt gleichzeitig
    mit; „Handy weitergeben“ ist nur eine zusätzliche Möglichkeit. Neuer Anmelde-Name, der noch nicht in der Mitspieler-Liste
    steht → wird automatisch auf einen freien Platz gesetzt (leer oder unbenannt wie „Spieler 2“; `_team_autofill` beim
    Login und bei `POST api/player`), nie doppelt (Groß/klein egal); ist kein Platz frei, bleibt die Liste.
  - **Rollen hängen nie an einem Handy (Grundregel):** Wir spielen als Team und reichen Handys herum. Jeder Schritt eines
    Hilfsmittels (geheim eingeben, bestätigen, raten, auflösen, neue Runde) geht auf **jedem** eingeloggten Handy, auch auf
    dem, auf dem eingegeben wurde. Keine Auswahl „Wer gibt ein?“, keine Prüfung nach Spieler oder Gerät. Der Ablauf richtet
    sich nur nach der **Phase** des gemeinsamen Zustands (`T.phase`: 1 „Geheim eingeben“ → 2 „Raten“ → 3 „Ergebnis“, als
    Leiste `phaseBar` angezeigt); alle Handys zeigen immer dieselbe Phase.
  - **Geheime Eingaben** (`kind` secretTerms/secretRank/photoWord und die Foto-Rätsel photoGrid/photoNames/photoPick, Logik `updateSecret` in tools.js): In Phase 1 tippt, wer
    eingibt (die anderen schauen weg). Nach dem Bestätigen ist das Geheimnis auf **allen** Handys verdeckt, auch auf dem
    eingebenden. „Anzeigen“ ist auf jedem Handy möglich, aber nur durch **langes Drücken** (0,6 s → 5 s sichtbar, nur lokal)
    mit dem Hinweis „Nur für die Person, die eingegeben hat“ (Vertrauen). „Auflösen“ deckt alles für alle auf (→ Phase 3).
    „Neue Runde“ führt in **jeder** Phase zurück zu Phase 1; Begriffe früherer Runden sind gesperrt (`used`, App weist darauf hin).
  - **Format-Version (`fv` in `TOOLS`):** Ändert sich das gespeicherte Format eines Hilfsmittels, `fv` erhöhen. Zustände mit
    anderer/fehlender Version verwirft `T.sanitize` automatisch (in `update`, `result`, `phase` und `toolState`) – das
    Hilfsmittel startet dann in Phase 1 statt mit kaputtem Altzustand (z. B. Baumstaben-Wort ohne Fotos aus der Vorversion). Geheimes liegt leicht verschleiert im Spielstand (`hide`/`unhide`, Vertrauensbasis, kein
    echter Schutz). Wortvergleich (`norm`): Groß-/Kleinschreibung, Leerzeichen am Rand und Akzente egal; ä=ae, ö=oe, ü=ue, ß=ss.
  - Entwürfe vor dem Bestätigen (Sortierung, Auswahl) bleiben nur auf dem jeweiligen Handy; bestätigt wird synchron.
  - **Eingabefelder (Regel für alle Hilfsmittel):** Beim Tippen darf sich die Tastatur nie schließen und der Cursor nie aus
    dem Feld springen. Darum wird ein Feld, in dem gerade getippt wird, **nie ersetzt** (`typingIn`: `rerenderTools` und das
    Neuzeichnen des Hilfsmittel-Fensters werden aufgeschoben und nach Verlassen der Felder nachgeholt – mit ~350 ms
    Verzögerung, damit ein angetippter Knopf nicht unter dem Finger ersetzt wird). Gespeichert wird verzögert (500 ms nach
    der letzten Eingabe, `queueLetter`/`flushLetters`, `toolDo(…, quiet)` ohne Neuzeichnen), beim Verlassen der Felder oder
    spätestens beim Bestätigen/Verschieben (`flushLetters` vor jeder Aktion). Felder für **einzelne Buchstaben**
    (`.letter-input`, ohne `maxlength`): nach einem Buchstaben springt der Cursor ins nächste Feld (Tastatur bleibt offen);
    Tippen in ein volles Feld ersetzt den Buchstaben; Löschtaste im leeren Feld springt ins vorherige Feld und löscht dort
    (keydown „Backspace“ + `beforeinput` „deleteContentBackward“ für Android) – gehalten wird so Feld für Feld rückwärts
    gelöscht. `select()` nur auf das gerade aktive Feld anwenden (holt sonst den Fokus zurück). Gilt für eingebende Person
    und Ratende gleichermaßen.
  - Sortieren (`sortList`/`bindSort`): Ziehen am Griff (Pointer-Events, `touch-action: none`) – gezogene Box hebt sich ab
    (Schatten, etwas größer) und folgt dem Finger, die anderen rutschen animiert, Platznummern wandern mit. **Keine
    Hoch-/Runter-Pfeiltasten** (überall entfernt; der Platz gehört den Namen – einzeilig, `.sort-name` ohne Umbruch); während des Ziehens kein Neuzeichnen. `sync` = gemeinsame Sortierung über den Server (Aktion `arrange`).
  - **Zufall:** Ordnet ein Hilfsmittel etwas zufällig an oder mischt, muss jede mögliche Anordnung gleich wahrscheinlich sein,
    auch die richtige Lösung; nichts ausschließen oder bevorzugen. Dafür `T.shuffle` (Fisher-Yates) mit `T.randomInt`
    (unverzerrt durch Verwerfen) und `rand32()` aus `crypto.getRandomValues`. Der Zufall wird beim Auslösen im Browser
    gezogen und als Teil der Aktion gespeichert (damit Warteschlange/Wiederholung dasselbe Ergebnis bringen). Test prüft Gleichverteilung.
  - **Fotos (wiederverwendbare Foto-Grundlage):** `photoPicker(qid, mehrere)` zeigt „Foto aufnehmen“ (**Kamera in der Seite**,
    s. u.; nur als Rückfall die Kamera-App über `capture="environment"`) und „Aus Galerie wählen“ (`multiple`: mehrere Bilder auf einmal); offline stattdessen ein Hinweis. `processPhotos` verarbeitet
    die Bilder **nacheinander** (nie mehrere gleichzeitig im Speicher) mit Fortschrittsanzeige „Foto X von Y“, in der Reihenfolge,
    in der das Handy sie liefert. Für **jede** Auswahl erzeugt `choosePhotos` ein **frisches** Datei-Feld (`newPhotoInput`, Klasse
    `.photo-file`, `data-photo-input`: unsichtbar, aber nicht `display:none`) direkt am `<body>` außerhalb aller neu gezeichneten
    Bereiche – nie ein Feld wiederverwenden (Android lieferte bei der zweiten Auswahl über dasselbe Feld ungültige
    Datei-Referenzen). Es wird erst entfernt, wenn alle gewählten Dateien gelesen und verarbeitet sind (`processPhotos(…).finally`),
    bei „cancel“ sofort; nie benutzte Reste räumt die nächste Auswahl weg. Vom Öffnen der Galerie bis alle Dateien gelesen
    sind (`toolUI.picking`, `toolUI.reading`) sind **Synchronisierung** (`poll` setzt aus) und Neuzeichnen (`photoBusy`) pausiert.
    **Ablauf einer Galerie-Auswahl (`onPhotosChosen` → `processPhotos`):** Android entzieht die Leseerlaubnis kurz nach der
    Auswahl (`NotReadableError … permission problems …`). Darum startet `onPhotosChosen` (nicht async) das Lesen **jeder**
    Datei **synchron im change-Event** (`startRead`), vor jedem await, Neuzeichnen, Synchronisieren und Zurücksetzen des Feldes:
    Dateien bis 15 MB (`MEM_READ`) sofort vollständig in den Speicher (`arrayBuffer` → eigener Blob), größere nur
    Dateianfang (Zugriff prüfen) und später direkt aus der Datei verkleinert dekodieren (nie die ganze große Datei kopieren –
    Speicher). Danach streng nacheinander, immer nur ein Foto:
    `addPhotoJob` = verkleinern (`shrinkPhoto`) → `uploadPhoto` (bis zu 3 Versuche bei Netz-/Serverfehler) → eintragen
    (`toolDo(…, quiet)`). Jedes Foto merkt sich seinen Platz (`slot`); „Noch einmal wählen“ nach einem **Lesefehler** öffnet
    die Galerie (einzeln) für genau diesen Platz (`choosePhotos(…, {lid, at})`, Aktion `addPhoto` mit `at`), bei anderen
    Fehlern wird die Kopie im Speicher erneut verarbeitet. 0 Byte → Hinweis „nur in der Cloud?“. Dasselbe Bild kann erneut gewählt
    werden (jedes Mal ein neues Feld). Lesefehler: siehe „Lesen mit Wiederholungen“ unten.
    **Kamera in der Seite** (`openCamera`, weil Android den Browser beendete, während die Kamera-App offen war):
    `getUserMedia({video: {facingMode: "environment"}})`, Live-Vorschau im Hilfsmittel (`<video playsinline muted autoplay>`,
    nötig fürs iPhone; Frontkamera-Vorschau gespiegelt, Foto nicht), großer Auslöser, Knopf Kamera wechseln (alte Tracks
    erst stoppen), „Fertig“. Mehrere Fotos hintereinander: jedes Foto aus dem Videobild direkt in Zielgröße (≤ 1.000 px) ins
    Canvas (`shoot`), JPEG prüfen, nacheinander hochladen (`cam.queue`), erscheint sofort in der Liste; Zähler + Status in der
    Vorschau. Das Kamera-Element (`toolUI.cam.el`) wird einmal gebaut und nach jedem Neuzeichnen in seinen Platz
    `[data-cam-slot]` zurückgehängt (`mountCamera` in `bindTools`/`rerenderTools`/`updatePhotoZone`) – das Video läuft weiter;
    fehlt der Platz, wird die Kamera beendet. **Freigeben** (`stopCamera`, alle Tracks stoppen): „Fertig“, Schließen des
    Hilfsmittels (`m.onClose`), Seite im Hintergrund (`visibilitychange`/`pagehide`). Abgelehnt/nicht verfügbar
    (`camFail`, ins Fehlerprotokoll) → Rückfall `toolUI.camFallback`: Hinweis, „Foto aufnehmen“ über die Kamera-App mit
    „Falls die Seite abstürzt, nutze ‚Aus Galerie wählen‘“, plus „Kamera in der Seite erneut versuchen“.
    **Neuzeichnen pausieren:** Solange Kamera-App/Galerie offen ist (`toolUI.picking`, Ende über `change`/`cancel`/Rückkehr zur
    Seite) oder Fotos verarbeitet werden (`toolUI.uploading`), gilt `photoBusy(qid)`: `rerenderTools`, `m.refresh` und das
    Nachholen beim Verlassen der Felder werden aufgeschoben; nur die Foto-Zone (`[data-photo-zone]`, Fortschritt
    „Foto X von Y“) wird aktualisiert (`updatePhotoZone`); danach holt `photoDone` alles nach.
    **Dekodieren** (`decodePhoto`): (1) JPEG + `ImageDecoder` vorhanden (Chrome/Android): direkt verkleinert dekodieren mit
    `desiredWidth/desiredHeight` = kleinste JPEG-Stufe n/8 (`ceil(w·n/8)`), deren lange Seite ≥ Ziel ist (andere Größen
    lässt Chrome scheitern) – 48-MP-Foto: ~20 statt ~220 MB; dreht der Browser nicht selbst (`"rotation" in frame` fehlt),
    dreht das Canvas nach EXIF (1–8); (2) `createImageBitmap(file, {resizeWidth})`; (3) Bild-Element mit Objekt-URL
    (`img.decode()`, z. B. iPhone/HEIC). Scheitert alles: Dateianfang erneut lesen → nicht lesbar = Stufe „Lesen“, sonst
    kleiner erneut (3 Runden) → „Verkleinern“. Ergebnis jeder Verkleinerung prüfen (nicht leer, `isJpeg`), sonst kleiner/mit
    weniger Qualität erneut. **Lesen mit Wiederholungen** (`startRead`): Der `NotReadableError` ist **zufällig** (dasselbe Bild klappt mal, mal nicht –
    die Android-Foto-Auswahl vergibt die Leseerlaubnis manchmal fehlerhaft). 1. Versuch synchron im change-Event, dann nach
    150, 500 und 1.500 ms erneut (`READ_RETRIES`), jedes Mal alle Lesewege: `arrayBuffer` (`readWhole`), `createImageBitmap(file)`
    (`readViaBitmap`), Objekt-URL + `<img>` (`readViaImg`; beide zeichnen gleich verkleinert, `drawSmall`, dann `job.small`).
    Gerettete Bilder kommen als Info „Gelesen nach Wiederholung“ ins Protokoll. Scheitert alles: Auswahl **einmal
    automatisch** neu öffnen (`autoReopen`, für das erste betroffene Bild an seinem Platz; ist die Berührung nicht mehr
    „frisch“ – `navigator.userActivation` –, Fenster „Noch einmal wählen“ mit Knopf, weil Browser Auswahlen nur nach Antippen
    öffnen); danach Meldung „Bild konnte gerade nicht gelesen werden. Bitte noch einmal versuchen, über Dateien wählen oder
    die Kamera nutzen.“ mit „Noch einmal wählen“ / „Aus Dateien“ / „Entfernen“. Die anderen Bilder der Auswahl werden
    übernommen. **„Aus Dateien wählen“** (kleiner Knopf unter Kamera/Galerie, `kind` „files“): Datei-Feld **ohne** `accept`,
    damit Android die App „Dateien“ statt der Foto-Auswahl zeigt; nur Bilder werden übernommen (`isImageFile`), andere mit
    kurzer Meldung abgelehnt. Protokoll: `source` (Galerie/Dateien/Kamera-App), `autoTries`, `okTry`, `readWays`, `lastModified`.
    Fehlgeschlagene Fotos bleiben (nur lokal, `toolUI.photoFailed`) mit „Erneut versuchen“ und
    „Entfernen“ sichtbar; Meldung nennt die Stufe (`PHOTO_STAGES`: Auswahl / Lesen auf dem Handy / Verkleinern / Hochladen
    zum Server / Server hat abgelehnt / Eintragen / Aufnahme), „Details“ zeigen Fehlername, Dateityp, Größe und alle Fehlversuche;
    jeder Fehler landet im Fehlerprotokoll (`reportPhotoError`). Server (`_save_photo`) lehnt nur ab: leer, zu groß
    (> 600 KB), kein JPEG – jeweils mit eigener Meldung. Jedes Bild bekommt eigene, kurzlebige Canvas/Bitmap/Frame/Objekt-URL,
    sofort freigegeben (`close()`, Canvas 0×0, `revokeObjectURL`). **Nie ein Canvas in voller Kameraauflösung.** Ergebnis: lange Seite ≤ 1.000 px, JPEG < 200 KB. Jedes Foto wird
    **sofort** per `POST api/photo` (roh, image/jpeg, Bearer-Token) hochgeladen → Antwort `{id}` (`p` + 24 Hex),
    dann `toolDo(qid, {type: "addPhoto", photo: id})` – so liegt es auf dem Server, falls das Handy den Browser beim Öffnen
    der Kamera aus dem Speicher wirft. Das offene Hilfsmittel wird gemerkt (`openTool` in localStorage, 1 h) und nach dem
    Neuladen automatisch wieder geöffnet (`restoreOpenTool`). Anzeigen mit `photoImg(id)` (`GET api/photo/<id>?t=<token>`, weil `<img>`
    keinen Header schickt). Gespeichert in `data/photos/` (nicht in git). **Nur temporär:** Nach jedem Speichern des Spielstands
    löscht der Server alle Fotos, auf die der Spielstand nicht mehr verweist – **immer** erst nach 2 min Schonfrist (auch
    nach einem Reset: sonst löschte das Speichern eines anderen Handys ein frisch hochgeladenes, noch nicht eingetragenes Foto). Ein Hilfsmittel beendet eine Runde also, indem es die Foto-IDs aus seinem Zustand entfernt
    (Geschafft → `photos: []`, Neue Runde/Reset → Zustand leer). Foto-IDs nie verschleiern (`hide`), sonst findet der Server sie nicht.
  Aktuelle Hilfsmittel:
  - Countdown: Light Show 10 s, Dreieck auf Dreieck 10 s, Werdet brava … 30 s, Treibgutkreuz 30 s (Start/Abbrechen/Neustart, Ende: Anzeige + Vibration).
  - „Fahrzeit schätzen und stoppen“ (Seilbahn): Schätzung bestätigen, Stoppuhr, ≤ 15 s daneben, sonst neue Runde.
  - „Autos zählen“ (Höllen-Verkehr): Schätzung bestätigen, 1-Minuten-Countdown, „+1 Auto“/−1, ≤ 1 daneben, sonst neue Runde.
  - „Höhe schätzen“ (Angsthase oder Augenmaß?): echte Höhe **589 m** in content.js (`height`), vorher nie angezeigt; gemeinsame
    Schätzung bestätigen → sofort „Geschafft!“ (mit echter Höhe) bei ≤ 10 %, sonst „Daneben“ + automatisch 5 min Strafzeit.
  - „Kompass: Wo liegt Rio?“ (Grüße nach Rio): DeviceOrientation (iPhone: Erlaubnis per Knopf), Wert erst beim Tippen
    „Hier ist Rio!“, Ziel 208° ± **50°**; eine Runde = 2 Messungen, eine Treffer reicht, beide daneben → automatisch 5 min
    Strafzeit; ohne Kompass Hinweis auf Kompass-App + Wert eintragen.
  - „Tic-Tac-Toe-Spielfeld“ (Tic-Tac-São-Bento): 2 Spielende wählen, Sieg/Unentschieden, Zug zurück, neue Runde.
  - „Fünf geheime Begriffe“ (Was Churchill sah): 5 Begriffe bestätigen; „Tipps: X von 6“ mit „+1 Tipp“/−1; erratene
    Begriffe werden angetippt (auf jedem Handy; erratene sind für alle sichtbar); ≥ 3 erraten → „Geschafft!“ (Phase 3);
    6 Tipps und < 3 → „Daneben“ + „Neue Runde“, bleibt aber Phase 2, damit der letzte Tipp noch als erraten markiert werden kann.
  - „Geheime Rangfolge“ (Früchteschweiger): Phase 1: 3 Früchte eintragen (Namen später für alle sichtbar, „Früchte ändern“
    bis zum Bestätigen), geheim sortieren (oben = beste, Entwurf nur lokal) und bestätigen; dabei wird eine zufällige Startreihenfolge für die Ratenden gemischt (Zufallsregel, jede Reihenfolge
    gleich wahrscheinlich, auch die richtige). Geraten wird **gemeinsam** (synchron auf allen Handys, `guessOrder`)
    und schreiben fest → jede Position grün/rot („richtig wäre: …“); alle richtig = „Geschafft!“, sonst „Daneben“ + „Neue Runde – mit anderen Früchten“.
  - „Buchstaben-Fotos“ (Baumstaben, `kind: "photoWord"`): Phase 1 zeigt oben gut sichtbar „Foto aufnehmen“ (Kamera) und
    „Aus Galerie wählen“ (mehrere); ≥ 5 Fotos als sortierbare Liste (Ziehen am Griff mit Animation wie Früchteschweiger,
    Aktion `arrange` mit den Schlüsseln der Einträge, Löschen, **Duplizieren**; keine Pfeile), je Foto ein Feld für genau
    einen Buchstaben (A–Z, Ä, Ö, Ü, ß;
    `T.letter`); Entwurf `draft` (Einträge `{key, photo}`, `T.draftEntries`) + verschleierte `draftLetters`, synchron, übersteht
    Neuladen. **Dasselbe Bild darf mehrfach vorkommen** (z. B. doppeltes L): keine Prüfung auf doppelte Bilder; „Duplizieren“
    (Aktion `duplicate`) fügt eine Kopie direkt darunter ein, ohne erneutes Hochladen – eigener Schlüssel, eigenes
    Buchstabenfeld, unabhängig verschiebbar/löschbar; Kopien verweisen auf dieselbe Server-Datei, die bleibt, solange
    irgendein Eintrag sie nutzt (der Server löscht nur Fotos ohne Verweis). Erneutes Wählen desselben Bildes geht ebenfalls. „Bestätigen“ (ab 5 Fotos
    mit Buchstaben) setzt das geheime Wort zusammen (keine Wörter früherer Runden). Phase 2 und 3 wie bei der Eingabe
    **untereinander** (`photoRows`: ein Foto pro Zeile, von oben nach unten in Wortreihenfolge, Buchstabenfeld bzw.
    Buchstabe daneben; kein Raster). Phase 2: Fotos ohne Buchstaben, daneben je ein Feld → „Bestätigen und vergleichen“ (**nur ein Versuch**) → Buchstabe für Buchstabe
    grün/rot, „X von Y Buchstaben richtig“ (Groß/klein egal). Alle richtig = „Geschafft!“ mit Wort (Fotos werden gelöscht);
    sonst „Daneben“ (`failed`, Phase 3): Wort wird aufgedeckt, **kein** erneutes Bestätigen – nur „Neue Runde“ (neues Wort,
    neue Fotos) oder „Trotzdem richtig“ (knappe Fälle; entscheidet, wer das Wort ausgedacht hat).
  - **Foto-Rätsel** (`kind` photoGrid/photoNames/photoPick, `T.isPhotoPuzzle`, Logik `updatePhotoPuzzle`, Oberfläche
    `photoPuzzleBody`): nutzen die Foto-Grundlage unverändert (`photoPicker`, Aktionen `addPhoto`/`removePhoto` in Phase 1,
    Entwurf `draft` synchron). Geheime Auswahl nur lokal (`toolUI.sel`, `puzzleSel`) bis „Bestätigen“; danach nur
    verschleiert (`hide`) im Spielstand, für niemanden sichtbar (kein „Anzeigen“), keine Einträge bei den Aktivitäten.
    Fotos erscheinen beim Raten in zufälliger, gleichverteilter Reihenfolge (`T.shuffle` + `rand32`, Teil der Aktion `fix`).
    Ein Tipp pro Runde → Phase 3. „Neue Runde“ leert den Zustand (Fotos weg → Server löscht sie), Reset ebenso.
    - „Versteck im Foto“ (Bananenversteck, photoGrid): 1 Foto (ein neues ersetzt es), 4×4-Raster darüber; geheimes Feld
      markieren → die anderen tippen ein Feld → „Richtig“ (grün, gefunden → neu verstecken) oder „Falsch“ (rot, Versteck
      grün umrandet; „Nicht gefunden – Quest geschafft!“) + „Trotzdem richtig“ (Aktion `accept`). Zeile: „gefunden“/„Geschafft“.
    - „Türen zuordnen“ (Gespür für die richtige Tür, photoNames): 3 Fotos, jedem geheim einen anderen Namen (Chips der
      3 Mitspieler, `teamNames`); Raten: Fotos links fest, Namen rechts per Ziehen gemeinsam sortieren
      (`sortList` sync, Aktion `arrange`, `guessOrder` gemischt) → „Bestätigen“ → je Foto grün/rot („richtig: …“).
    - „Adler-Stein raten“ (Steinadler, photoPick): 3 Fotos, einen geheim als Adler antippen; Raten: Stein antippen →
      „Bestätigen“ → grün/rot, der Adler wird grün umrandet gezeigt.
  - „Zwei Kriterien wählen“ (Mit Lorbeeren und UNESCO gekrönt): 10 UNESCO-Kriterien (i)–(x) mit deutscher Kurzfassung
    (`UNESCO_CRITERIA`), genau 2 wählen und bestätigen; Lösung (ix)+(x) in tools.js, vorher nie gezeigt. Danach wird jedes
    gewählte Kriterium einzeln bewertet („(x) richtig“, „(ii) falsch“, grün/rot); nicht gewählte werden nie verraten;
    nicht beide richtig → automatisch 10 min Strafzeit.
  - „Bucht zeichnen und raten“ (Bucht gesucht, q-mac-2, `kind: "drawBay"`, `fv: 2`, geheim → Handy weitergeben): Karte der
    Ponta de São Lourenço (Caniçal/Prainha bis zur Spitze inkl. Ilhéus) aus `public/bay-map.js` (`window.BAY_MAP`, Koordinaten
    in Metern), erzeugt mit `tools/buchten_karte.py` aus der **CAOP-Küstenlinie** (Direção-Geral do Território, via
    github.com/nmota/caop_GeoJSON; OpenStreetMap war gesperrt), vereinfacht auf ~1,6 m – nie von Hand ändern, sondern Skript
    neu laufen lassen (`python3 tools/buchten_karte.py <MadeiraFreguesias.geojson> [vorschau-ordner]`; prüft jede Bucht und
    schreibt Vorschaubilder). 9 nummerierte Buchten `b1`–`b9` (Nordküste 1–6 West→Ost, Südküste 7–9 Ost→West), Namen nur bei
    echten: 8 „Baía d'Abra“, 9 „Prainha“. Je Bucht im Skript: Markierung + die **beiden Landspitzen am Eingang**; daraus
    berechnet: `poly` = Buchtküste von Landspitze zu Landspitze (geschlossen = Wasserfläche; das Skript rückt die Öffnung
    automatisch auf die äußersten Landspitzen), `isl` = Inseln darin, `rot` = Drehung, `d` = Landstreifen, `top`/`box`.
    **Nummern auf der Karte** (`place_labels` im Skript): jede Nummer (Radius `r`) im offenen Wasser **vor** ihrer Bucht
    (Nordküste 1–6 nach Norden, Südküste 7–9 nach Süden), mit Abstand zur Küste, dünne dezente Linie + Punkt zur Buchtmitte
    (`tx/ty`, von der Öffnung aus frei sichtbar); Nummern, Linien und Namen (`nx/ny/na`) berühren keine Küste, Insel oder Bucht
    und überlappen sich nicht (Skript sucht die Anordnung, Test prüft es); Kartenausschnitt `view` wird dafür erweitert.
    Antippen (`bayAt`): in einer Bucht → diese Bucht, sonst nächste Nummer/Buchtmitte; unsichtbare große Tippfläche
    (`.bm-hit`, 2,2 × r) um jede Nummer. Gilt genauso für die Auflösung.
    **Küstenausschnitt** (`bayCrop`): nur gedreht (nie gespiegelt), sodass die Öffnung **oben** liegt (Meer der Bucht oben,
    Land unten/seitlich); gezeigt wird **nur die Bucht**: gleichmäßiger Landstreifen (Breite `d`) entlang der Buchtküste,
    Wasser der Bucht, Inseln darin; alles oberhalb der Öffnung abgeschnitten (`clipPath`). Echtes Land außerhalb wird nicht
    gezeichnet → keine Nachbarbuchten, keine Gegenküste. Füllt die Fläche (`box` passt sich jeder Buchtgröße an).
    Ablauf: „Bucht auslosen“ (Aktion `start`, gleichverteilt mit `T.randomInt` über `T.bayChoices` = noch nicht gespielte
    Buchten, `used`; sind alle durch, alle außer der letzten) → nur das auslosende Handy (`here` im lokalen Entwurf) sieht den
    Küstenausschnitt (ohne Nummer/Name, ein-/ausblendbar) und zeichnet; andere Handys sehen „Auf einem anderen Handy wird
    gerade gezeichnet“ + „Hier zeichnen“ (Rückfrage, Ein-Handy-Fall nach Neuladen). „Bestätigen“ (Aktion `fix` mit `drawing`)
    → Handy weitergeben → Phase 2: Zeichnung + Karte mit allen Nummern (`bayMap`, zoombar mit `panZoom` wie die Inselkarte,
    Nummern bleiben gleich groß – `bayMarkScale`; „Ganze Karte“ unter der Karte, damit gezoomt keine Nummer verdeckt wird;
    Zoom in `toolUI.bayZoom`; Chips) → „Bestätigen“ (`guess`) → Phase 3: Richtig/Falsch, Zeichnung und gedrehter Ausschnitt nebeneinander,
    dazu die Bucht auf der Karte (nach Norden, ungedreht) grün hervorgehoben (`bm-hl` = `poly`); „Neue Runde“ (löscht
    Zeichnung), bei Falsch zusätzlich „Trotzdem richtig“ (`accept`).
    **Zeichenfläche** (`buildDrawEl`, einmal gebaut, nach jedem Neuzeichnen mit `mountDraw` in `[data-draw-slot]` zurückgehängt
    wie die Kamera): 1000×750-Koordinaten, Pointer-Events, `touch-action: none` (Seite scrollt/zoomt nicht), während des
    Zeichnens `toolUI.dragging` (kein Neuzeichnen). Werkzeuge Stift / weicher Pinsel / Radierer, 3 Stärken, 8 Farben,
    Rückgängig, Wiederholen, „Alles löschen“ (Rückfrage); kompakte Icon-Leiste. Entwurf nur lokal (localStorage `draw:<Runde>`),
    übersteht Neuladen; synchronisiert wird erst beim Bestätigen (`T.checkDrawing`: höchstens 600 Striche/60.000 Zahlen).
    Neue Runde/Reset entfernen die Zeichnung aus dem Spielstand.
  - **Stapel-Quests** (Zeile im Stapel-Quest-Kasten auf der Startseite, öffnet das Hilfsmittel; Ziele/Zeiten wie im Quest-Text):
    Zähler (`kind: "counter"`, großes „+1“, kleines „−1“, „3 von 10 …“, Balken, bei Ziel dezent „Ziel erreicht – abhaken
    macht ihr selbst“): Tunnelblick 10, Obrigado 3, Wasserfall-Marathon 10; Zähler + Timer (`minutes`): Wine-Tasting 3 + 1 h,
    Sprachensammler 5 + 1 h; Regionen-Liste (`kind: "regions"`, 10 Chips, Ziel 5): Fünf auf einen Streich; Timer
    (`kind: "timer"`): Fußdurchblutung 5 min, Levada-Spaziergang 30 min; „Höhe messen“ (`kind: "altitude"`, `local`):
    Gipfelgruß (> 1.000 m), Ups & Downs (1.000 m und −1 m). **Timer** rechnen mit der Startzeit in Serverzeit (`acc` = bisher
    gelaufen, `startedAt` = läuft seit; `T.timerLeft/timerEnd`): Start/Weiter, Pause, Zurücksetzen; laufen bei gesperrtem
    Handy, nach Neuladen und auf jedem Handy richtig weiter. Ende: `checkTimers` (jeder Takt, auch wenn eine andere Seite offen
    ist; nur bis 60 s nach Ablauf, kein alter Alarm nach Neuladen) → Meldung + `signalTimer` (Ton **und** Vibration; iPhone nur
    Ton – AudioContext wird beim Antippen freigeschaltet). Nie automatisch abhaken. **Zurücksetzen:** Abhaken und Tauschen
    löschen `state.tools[id]` der Stapel-Quest (`takeTool` in logic.js, alter Stand im Aktivitäten-Eintrag `data.tool`);
    Rückgängig stellt ihn wieder her (`giveTool`); Reset löscht alles. Zeile rechts: „3/10“, „⏱ 4:12“, „Pause …“, „Zeit um“.
  - **Höhe messen / Wo bin ich?** (nur auf Knopfdruck, einmalig `getCurrentPosition`, nichts gespeichert oder geteilt):
    GPS-Höhe auf Meeresspiegel umgerechnet (`T.seaLevelAltitude`: Android liefert Höhe über dem WGS84-Ellipsoid → minus
    **48 m** Geoid-Höhe Madeira (EGM96, 47–48 m, `GEOID_MADEIRA`); iPhone liefert schon Meeresspiegel) mit „± X m“
    (`altitudeAccuracy`), dazu Geländehöhe von **Open-Meteo Elevation API** (kostenlos, ohne Schlüssel; offline nur GPS),
    Hinweis auf GPS-Ungenauigkeit. Region per `T.regionAt` (Punkt-in-Polygon mit den Gemeindegrenzen aus map-data.js).
  - Links (`LINKS` in tools.js, eigene Zeilen): „Aktuelle Ankünfte am Flughafen Madeira“ (Halb gelandet) → https://www.madeiraairport.pt/en/fnc/arrivals;
    „Die zehn UNESCO-Kriterien“ (Mit Lorbeeren und UNESCO gekrönt) → https://whc.unesco.org/en/criteria/.
- **Urlaub beenden – Reihenfolge** (`startEnd`): Rückfrage → **Urlaubs-Rückblick** (überspringbar) → Restpunkte (verdient −
  ausgegeben) auf Belohnungen verteilen (`openRewards`; Massage/Live-Ständchen frei in 5er-Schritten; **zählbare** (`kind`
  „count“: Photoshop-Bild, Mystery-Drink, Profilbild-Diktat) nur in **ganzen Einheiten** = 100er-Schritten, `L.rewardAmount`
  rundet auch getippte Werte ab; unter 100 Restpunkten ist ihr Plus ausgegraut mit Hinweis „ab 100 P“; Knopf „Weiter: Fotos
  für die Urkunde“) → **Fotos für die Urkunde** wählen (`chooseCertPhotos`, „Zurück“ führt mit den verteilten Punkten zur
  Verteilung zurück; ohne Erinnerungsfotos entfällt der Schritt) → „Urkunde erstellen“ = Aktion `end` → Erfolge mit
  Belohnungen + Zertifikat (PDF). Rückblick in den Erfolgen erneut abspielbar (`#recap-btn`).
- **Ansicht „Urlaub beendet“** (`viewEnded`): solange `state.ended` gesetzt ist, zeigt `render` **nur** diese Ansicht
  (Klasse `body.is-ended`: Kopfzeilen-Navigation und Punkte-Band ausgeblendet, kein Wischen zwischen den Hauptseiten, auch
  Handy-Zurück bleibt dort). Knöpfe: Rückblick abspielen, Urlaub fortsetzen (Verteilung aufheben → Sperre weg), „Erfolge ansehen“
  (`app.endedStats`: Erfolge mit „← Zurück zum Urlaubsende“, ebenfalls ohne Wischen), PDF, ganz unten rot **„Kompletter
  Reset“** (wie in den Einstellungen mit Eintippen von „RESET“).
- **Plus/Minus gedrückt halten** (alle Knöpfe mit `data-hold="<Kennung>"`: Belohnungen, Zähler der Stapel-Quests, „+1 Auto“,
  „+1 Tipp“ und die −-Knöpfe dazu): kurzes Tippen = normaler Klick; nach 0,45 s gedrückt wiederholt (150 → 75 → 35 ms),
  Loslassen/Abbruch/Verschieben > 12 px stoppt sofort; ausgelöst wird der aktuelle Knopf mit derselben Kennung (`.click()`,
  übersteht Neuzeichnen), dadurch gelten alle Grenzen der normalen Klick-Funktion (Restpunkte, Minimum 0); der echte Klick
  beim Loslassen zählt nicht doppelt. CSS: kein Markieren, kein Kontextmenü (`-webkit-touch-callout`), `touch-action: manipulation`.
- **Urlaubs-Rückblick** (`startRecap` in app.js, Daten `L.recap(state, content)` in logic.js, getestet): Ereignisse **streng
  chronologisch** nach `state.quests[id].t` / `state.done[id].t` (Gleichstand: Reihenfolge der Aktivitäten); nur jetzt erledigte
  Quests, Rückgängiggemachtes fehlt ganz; der Region-Joker färbt seine Region zu seinem Zeitpunkt (ohne Auftritt). Je Ereignis:
  `points` (inkl. Stufen/Insel-Bonus, Summe = verdiente Punkte), `earned`, `levels`, `day` (1 = Spielbeginn), regional `km`
  (Luftlinie `L.distanceKm` zwischen den Pins). **Schnell:** je Ereignis 12,7 s / Anzahl (0,22–0,87 s), Einstieg 0,3 s → ca.
  10–15 s bei vollem Spiel. Bild: Vollbild-Ebene `.recap` (z-index 95): oben Titel, „Tag X · Punkte“ (zählen mit), „Überspringen“;
  Inselkarte (eigene Pfade ohne `data-region`): **sanft geschwungene Verbindung** (quadratische Kurve, abwechselnd nach links/
  rechts gebogen) zum Ort der nächsten regionalen Quest – Straßenrouten (OSRM/OpenStreetMap) waren in der Arbeitsumgebung
  gesperrt, daher keine echten Routen; Linie **dunkles Ozeanblau #073b4c mit weißem Rand** (`.rc-halo` + `.rc-path`, nie Gold –
  das ist „Erschlossen“), per stroke-dashoffset nachgezeichnet; Region färbt sich nach Stufe; kurzes Fenster (Titel, Region, Tag,
  +Punkte, Erinnerungsfoto-Vorschau, sonst Pin-Icon). Darunter „Tisch“ `.rc-table` mit Zähler: Stapel-Quest-Karte fliegt heran
  im **Hochformat** wie die Karten der App (124×176 px: Farbstreifen der Schwierigkeit oben, Erinnerungsfoto bzw. Icon, Schwierigkeit,
  Multiplikator, Titel, Punkte) und landet gedreht in **ganzen Grad −45° … +45°, jeder Winkel höchstens einmal** (alle 91 Winkel
  je Spiel gemischt mit `L.mulberry32(seed)`), versetzt (±60/±35 px, `L.hash(id:seed)`), neue verdeckt ältere nur teilweise. Eine Uhr per
  `requestAnimationFrame` (`run.vt`), nur transform/opacity/dashoffset; Pause (auch automatisch im Hintergrund), Tempo 0,5×–3×,
  Fortschrittsbalken; Fotos vorab geladen/dekodiert. Ende: **Rang-Feier** (Figur zoomt herein mit pulsierendem goldenem
  Leuchten, Rangname ploppt auf, Konfetti in den Spielfarben, Punkte zählen per rAF hoch; nur transform/opacity) und Zusammenfassung (Rang mit Figur, Punkte, Tage, Stapel-Quests,
  regionale Quests, bester Multiplikator, Luftlinie, Regionen je Stufe) mit „Nochmal“/„Fertig“. Geprüft mit 4-fach gedrosselter
  CPU bei 384×854.
- **Fotos für die Urkunde**: bis zu 6 Erinnerungsfotos, Auswahl per Antippen mit Häkchen und „X von 6“ (`certPickHTML`), in den
  Einstellungen → Erinnerungsfotos (sofort für alle gespeichert) und vor der Urkunde (vorbelegt). Server: `cert` in
  `data/memories.json` (`POST api/memories/cert {ids}`, höchstens 6; Reset → `null`). `certPhotoIds()`: gespeicherte Auswahl
  (nur sichtbare Fotos) bzw. – nie gewählt (`null`) – die ersten 6 chronologisch. Weniger als 6 (auch 0) erlaubt.
- **Zertifikat** (`certificateSVG(photos, withImages)`, 1188×840, A4 quer): Kopf in eigenen Zeilen „ZERTIFIKAT“ /
  „Operação Madeira – Das Spiel“ / (Leerzeile) Zeitraum Spielbeginn bis „Urlaub beenden“ (`L.dateRange`: „10. – 18. Oktober 2026“,
  über Monatsgrenzen „28. September – 5. Oktober 2026“, getestet) / „Hiermit wird bestätigt, dass“ / Namen / „Madeira als Team
  erkundet und den Rang … erreicht haben.“; darunter Rang mit Figur + Punkten (`certFigure`), Inselkarte mit Stufenfarben +
  Legende, Collage der gewählten Fotos; unten links untereinander „Regionale Quests X von 30“ und „Stapel-Quests X von 26“,
  rechts **eine** Box „Gutscheine“ mit einfacher Liste (ohne „Gutschein:“, ab 4 in zwei Spalten). Kein fleißigster Tag, keine
  Urlaubstage. Vorschau bei den Erfolgen mit Fotos (data-URLs, `loadCertPhotos`, Cache `certCache`); **PDF** (`downloadPDF`):
  SVG ohne Fotos ins Canvas (2×), Fotos direkt aufs Canvas (sicher für Safari), JPEG 0,85 → ca. 270 KB.
- **Test-Simulation** (Einstellungen → „Testspiel simulieren“, Unterseite `sim`, Bestätigung durch Eintippen von „TEST“):
  Spielstand von `L.simulateGame(content, seed, now, names)` (logic.js, getestet: jede Aktion über `apply`, ~7 Tage 8:30–21 Uhr,
  Regionen in allen Stufen, ~30 % ganz Madeira erkundet, 6–12 Stapel-Quests, Multiplikatoren, Tausch-/Region-Joker, 2–4
  Rückgängig). Server `POST api/sim/start {state}`: verschiebt den **echten** Stand (state.json, memories.json, `memories/`,
  `photos/`) nach `data/sim-backup/` (+ `sim.json`) und setzt den Test-Stand ein; danach lädt das Handy 7–10 erzeugte
  Platzhalter-Erinnerungsfotos hoch (`simPhoto`: Landschafts-Verlauf mit Quest-Namen). Jede Spielstand-Antwort hat `sim`
  → Band **„Simulation aktiv“** (`#sim-band`, lila gestreift) mit „Simulation beenden“ auf allen Handys (`setSim`).
  `POST api/sim/stop`: löscht alle Simulationsdaten und holt den echten Stand unverändert zurück (nur Versionsnummern von
  Spielstand und Fotoliste werden erhöht, damit alle Handys neu laden). Solange `data/sim-backup/` existiert, läuft die Simulation.

## Aufbau und Gestaltung
- Dateien: `server.py` (stdlib-WSGI), `public/logic.js` (Regeln), `public/app.js` (UI), `public/content.js` (Quests, Pins
  `pin:[lat,lon]`, `maps` = Google-Maps-Suchname oder null = Koordinaten, optional `mapsUrl` fester Link, optional `link` = Text in der Aufgabe als Link, `height` = Höhe für „Höhe schätzen“),
  `public/tools.js` (Hilfsmittel), `public/icons.js` (Lucide, Inline-SVG), `public/figures.js` (Rang-Figuren), `public/map-data.js`, `public/bay-map.js`
  (Buchten-Karte, erzeugt von `tools/buchten_karte.py`), `tests/logic.test.js`.
- Kopfzeile: links Schriftzug „Operação Madeira“ (Bebas Neue + goldener Kompass, einzeilig, Größe passt sich an),
  rechts genau 4 Icons in dieser Reihenfolge: Shop (shopping-bag) / **Erfolge** (trophy, früher „Statistik“) /
  **Aktivitäten** (history, früher „Logbuch“) / Einstellungen (settings, ganz rechts); beschriftet, aria-label; kein Hilfe-„?“.
  Interne View-Namen bleiben `stats` und `log`. Darunter Abzeichen: Rang-Figur · Rang · Kontostand (führt zu den Erfolgen).
  Bei ≤ 380 px: Knöpfe 44 px, lange Beschriftungen („Aktivitäten“, „Einstellungen“) kleiner (`.hdr-wide`, `.hdr-set`),
  Schriftzug passt sich an (fitLogo, bei 360 px ca. 16 px) – nach Änderungen an der Kopfzeile bei 360/390 px nachmessen.
  Eigenes Logo: `public/images/logo.svg` oder `logo.png` ersetzt den Schriftzug.
- Startseite (keine untere Leiste): Block „Regionale Quests“ (Überschrift auf Karten-Hintergrund, **einzeilig** wie
  „Stapel-Quests“; darunter einzeilig „X von 10 Regionen erkundet · X von 30 erledigt“, auch bei „10 von 10 · 30 von 30“;
  unter 340 px Schrift kleiner) mit Inselkarte, Legende nur 4 Stufen: **eine Zeile**, wenn sie passt (ab 411 px Breite),
  sonst sauber **2 × 2** (`grid`, nie 3 + 1); darunter der kräftig blaue Block „Stapel-Quests“ (3 offene, Tausch/Multiplikator,
  Zeile „… · Joker genutzt: Tausch X von 5 · Multiplikator X von 3“); dann Knopf „Alle Quests anzeigen“.
- Pins: einzelne = Punkt-Symbol, Farbe offen = unbesucht-Grau, erledigt = erkundet-Hellgrün, deutlicher Rand;
  nahe Pins → Gruppe mit Anzahl (Antippen = Auswahl). Pin → einzelne Quest; Region → alle 3 Quests.
  Größe `PIN` (r 11 px, Tippfläche `hit` 22 px Radius = 44 px). **Regionsnamen bleiben lesbar:** `avoidLabels` rückt
  Pin-Köpfe, die auf einem Namen oder einem anderen Kopf liegen, höchstens ~44 px weiter (zuerst nach oben); geht das nicht,
  werden sie zur Gruppe zusammengelegt (auch die Knöpfe oben rechts bleiben frei). Nach Änderungen bei 384×854 prüfen
  (alle 10 Namen frei, ungezoomt und gezoomt).
- **Zoomen/Verschieben wie eine Karten-App** (`panZoom(wrap, stage, st, opts)`, für Inselkarte und Buchten-Karte):
  zwei Finger = Pinch-Zoom um den Punkt zwischen den Fingern (1×–8×, `ZOOM_MAX`); ein Finger ungezoomt = Seite scrollt
  (`touch-action: pan-y`), gezoomt = Karte verschieben (`touch-action: none`); Doppeltippen = ×2 (bei 8× zurück);
  Knopf „Zurücksetzen“ (rundes Icon `scan`, nur gezoomt sichtbar, links neben „Wo bin ich?“) = ganze Insel; Mausrad/Ziehen am Computer. Die Karte wird **nur per
  CSS-Transform** des Inhalts (`#map-stage`, `translate3d … scale`) bewegt – kein Neuzeichnen; sie füllt immer den Rahmen
  (lässt sich nicht hinausschieben). Touch-Ereignisse mit `preventDefault` bei zwei Fingern/gezoomtem Verschieben (Seite
  zoomt nicht mit, iPhone zusätzlich `gesturestart`). Ein Verschieben gilt nie als Antippen; Antippen (`mapTap`):
  Pin/Gruppe sofort, Region nach 280 ms (sonst würde Doppeltippen sie öffnen). Zustand `mapUI.st` {s, tx, ty} bleibt beim
  Neuzeichnen; während einer Geste wird `render()` aufgeschoben (`mapUI.active`/`renderPending`). Grenzlinien werden nach
  der Geste wieder dünn (`--zs`, `stroke-width: calc(… / var(--zs))`).
  **Pins, Namen und Standortpunkt** liegen in einer eigenen Ebene darüber (`#map-ov`, Bildschirmpixel): immer gleich groß;
  während der Geste werden nur ihre Positionen nachgeführt (`moveOverlay`), Gruppen werden höchstens alle 150 ms neu
  gebildet (`maybeRelayout` → `layoutPins`: lösen sich beim Reinzoomen auf, fassen sich beim Rauszoomen zusammen).
- **„Wo bin ich?“** (rundes Standort-Symbol `locate-fixed` oben rechts in der Karte, `.map-locate`, gleiche Optik wie
  „Zurücksetzen“; Antippen läuft über `mapTap`, Maus/Tastatur über den Klick): Kasten unter der Karte („Ihr seid in …“ bzw.
  „Gerade in keiner Region.“ + Höhe, ×), Region blinkt 3× kurz (`here-hl`), roter pulsierender Punkt (SMIL-`animate`) am
  Standort; verweigerte Erlaubnis → kurze Meldung. Nur lokal (`mapUI.here`).
- Quest-Fenster: Bild oben (`public/images/quests/<ID>.jpg`, erst beim Öffnen geladen, fehlend = nichts), Titel,
  Standort als Google-Maps-Link, Beschreibung, **„Eure Aufgabe:“** fett. **„Alle Quests anzeigen“** zeigt dieselben Bilder
  genauso (`regionQuestHTML(q, false, true)`, `loading="lazy"` mit 16:9-Platzhalter `.quest-img-lazy`).
- **Regionen-Fenster** (`openRegion`, Inhalt `regionPaneHTML`): oben Pfeile ‹ › und 10 Punkte in Stufenfarbe (aktuelle Region
  hervorgehoben); Wischen nach links/rechts im Fenster (waagerecht, ab 14 px und |dx| ≥ 2·|dy|, > ¼ Breite oder schnell
  > 0,35 px/ms bei > 50 px) bzw. Pfeile wechseln zur nächsten/vorigen Region **im Kreis** (Karten-Reihenfolge).
  **Flüssig wie die Hauptseiten:** 3 Ebenen `.rg-pane` (vorige, aktuelle, nächste Region) liegen fertig gezeichnet
  nebeneinander, Bilder geladen und vorab dekodiert (`img.decode()` in `bindQuestImages`); beim Wischen nur `transform`
  per `requestAnimationFrame` (`place`/`moveTo`), **kein Neuzeichnen** (Synchronisierung wird aufgeschoben, `rg.pending`);
  nach dem Einrasten werden die Ebenen nur umsortiert, nur die neue unsichtbare Nachbarregion wird gezeichnet. Jede
  Ebene scrollt selbst (`touch-action: pan-y`), Fenster feste Höhe 92dvh (`.rg-modal`). Geprüft mit 4-fach gedrosselter CPU.
- **Fenster nach unten wegziehen** (`bindSheet`, in `openModal` für alle nicht-statischen Fenster mit X-Knopf → Klasse
  `.sheet` mit Griff-Strich oben): Ist der Inhalt ganz oben (`scrollTop` 0; beim Regionen-Fenster die aktuelle Ebene,
  `opts.sheet`), folgt das Fenster dem Finger nach unten (transform, rAF, Hintergrund wird heller) und schließt sich bei
  > 30 % der Höhe oder schnell (> 0,5 px/ms bei > 60 px), sonst federt es zurück. Ist der Inhalt gescrollt, scrollt Wischen
  nach unten zuerst den Inhalt zurück; erst ein neuer Wisch ganz oben schließt. Richtungssperre `m.lock` ("v"/"h") trennt
  es vom Links-Rechts-Wischen. Nicht in Feldern, Listen zum Ziehen, Karten, Zeichenfläche, Kamera (`SHEET_NO`).
  X-Knopf bleibt. Kleine Rückfragen (`confirmBox`, `promptBox`, statische Fenster) haben das nicht.
- **Aktivitäten:** Einträge zu einer Quest (quest/stack/mult) sind antippbar (`.log-open`, `data-open-q`) → regionale Quest
  öffnet `openQuest`, Stapel-Quest `openStackQuest` (Aufgabe, Status, Hilfsmittel wenn offen, Erinnerungsfoto wenn erledigt).
  Daneben bleibt das Erinnerungsfoto-Vorschaubild/der Kamera-Knopf (`memChip`).
- **Wischen zwischen den Hauptseiten** (`MAIN_PAGES`: Startseite – Shop – Erfolge – Aktivitäten – Einstellungen; links =
  weiter, rechts = zurück, nicht im Kreis): Seite gleitet mit dem Finger, Nachbarseite schiebt sich als Vorschau herein
  (`.swipe-peek`, ohne IDs), rastet ein (> ⅓ Breite oder schnell > 0,35 px/ms bei > 50 px), sonst federt zurück; am
  Anfang/Ende nur kleiner federnder Ausschlag. Erst ab 14 px und deutlich waagerecht (|dx| ≥ 2·|dy|); senkrecht bleibt
  normales Scrollen (`#view { touch-action: pan-y pinch-zoom }`). Nicht: 28 px an den Bildschirmrändern (Zurück-Geste
  Android/Safari), auf `SWIPE_NO` (Karte, Buchten-Karte, Zeichenfläche, Ziehen-Listen, Eingabefelder, Fenster), bei offenen
  Fenstern und auf Unterseiten der Einstellungen. Nur CSS-Transform. Punkte-Band (`#page-dots`, 5 Punkte) unter der
  Kopfzeile zeigt die aktuelle Hauptseite (auf Unterseiten ausgeblendet). Seiteninhalt kommt aus `pageHTML(view)`.
- **Navigation (Regel):** Bereiche Shop / Erfolge / Aktivitäten / Einstellungen (Views `shop`, `stats`, `log`, `settings`) haben
  oben „← Zu den Quests“ (direkt zur Startseite, auch Handy-Zurück; Bereiche ersetzen den History-Eintrag).
  **Unterseiten der Einstellungen** (`SETTINGS_PAGES`: `help`, `player`, `team`, `backup`, `photos`, `errors`, `end`, `sim`, `reset`) haben stattdessen zwei Knöpfe:
  „← Einstellungen“ und „Zu den Quests“. Wird eine Unterseite durch **Abbrechen einer Sicherheitsabfrage** verlassen
  (Reset, RESET-Eingabe, Urlaub beenden, Belohnungs-Fenster schließen, Wiederherstellen), landet man in den Einstellungen
  (`backToSettings(view)`). Neue Unterseiten der Einstellungen in `SETTINGS_PAGES` eintragen.
- **Einstellungen** = Menü aus antippbaren Zeilen (Reihenfolge): Spielanleitung · Spieler (angemeldeter Name, „Name ändern“,
  „Abmelden“) · Mitspieler (3 Namen für die Hilfsmittel) · Spielstand sichern (sichern/wiederherstellen) · Erinnerungsfotos · Fehlerprotokoll · Urlaub beenden & Belohnungen (gold umrandet; nach Ende:
  „Belohnungen & Zertifikat ansehen“ → Erfolge) · Testspiel simulieren · Kompletter Reset ganz unten mit Abstand, rot. Jede Zeile öffnet eine
  Unterseite; alle Sicherheitsabfragen bleiben.
- Erfolge (früher „Statistik“): Teamrang mit großer Figur + Rangleiter; Etappen-Balken (Farbe je Etappe = Stufenfarbe, Rang: 0–700–1.500–Maximum);
  Regionen-Block (Meilenstein-Abzeichen, Liste mit Sternen: voll gold/Umriss; **sortiert** Erschlossen → Erobert → Erkundet →
  Unbesucht, gleiche Stufe in Karten-Reihenfolge, zeilenweise links/rechts; gleiches Raster wie die Kacheln:
  `repeat(2, minmax(0, 1fr))`, Abstand 10 px – zwei Boxen zusammen exakt so breit wie eine breite Box; Sterne dort 17 px); Kacheln Punkte verdient | Kontostand,
  Regionale Quests | Stapel-Quests, % vom Maximum | bester Multiplikator; Maximum-Zeile; Punkte pro Tag + Durchschnitt;
  Tortendiagramme „Woher die Punkte kommen“ (Farben einfach/mittel/schwer, Legende % fett + Punkte klein, rechtsbündig)
  und „Stufen der Regionen“ (Anzahlen); „Joker genutzt:“ eingerückt, „Insgesamt ausgegeben“. Erfolge sind **nur zum Anschauen**
  (keine Spiel-Knöpfe, kein „Alle Quests“; nach Urlaubsende zeigt sie Belohnungen + Zertifikat). „Alle Quests anzeigen“ nur auf der Startseite.
- Icons: nur Lucide-Linien-Icons, keine Emojis. Rang-Figuren: dieselbe Person (Landstreicher: Hut, Bündel, Flicken;
  Abenteurer: Wanderhut, Rucksack, Kompass; Inselkönig: Krone, Umhang), Strich 2 px, goldener Akzent.
- Schriften: Fraunces (Überschriften), Inter (Text), Bebas Neue (Logo). Farben: Ozean #0b5f78/#073b4c, Sand-Hintergrund.
- Alles muss auf dem Handy gut lesbar und antippbar sein (≥ 44 px Ziele).
