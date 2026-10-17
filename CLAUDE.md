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
Spielstand: `data/state.json`, Spielernamen: `data/players.json`, Fotos der Hilfsmittel: `data/photos/` (alles nicht in git). Details: ANLEITUNG.md.

## Fehlerprotokoll (bei Problemen ZUERST hier nachsehen)
- Jeder Fehler beim Foto-Upload wird vom Handy automatisch an den Server gemeldet (`POST api/client-error`, ohne Netz in
  localStorage `errQueue` gemerkt und später nachgeschickt) und in **`data/client-errors.log`** gespeichert (auf PythonAnywhere:
  `~/madeira-spiel/data/client-errors.log`; eine JSON-Zeile je Fehler, höchstens 500): `time`, `ua` (Gerät/Browser), `stage`
  (Auswahl / Lesen / Verkleinern / Hochladen / Server / Eintragen), `name`, `message`, `fileName`, `fileType`, `fileSize`,
  `attempts` (alle Fehlversuche davor), `player`, `detail` (RAM, Bildschirm, Zeit).
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
- **Spielstand sichern/wiederherstellen** (Einstellungen, Abschnitt „Spielstand sichern“): lädt `operacao-madeira-JJJJ-MM-TT.json`
  herunter (`{app, savedAt, savedBy, version, state}`); Wiederherstellen prüft die Datei (`isCompatible`), fragt deutlich nach
  (überschreibt für alle Handys) und speichert sie als neuen Stand (nur online).
- **Hilfsmittel (Tools)** für einzelne regionale Quests (`public/tools.js` = Liste `TOOLS` mit `label`/`icon` + reine Logik,
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
  - **Spielerauswahl** zeigt alle Namen, mit denen sich je jemand angemeldet hat (Server speichert sie in `data/players.json`
    beim Login und beim App-Start/Namenswechsel über `POST api/player`; `players` kommt mit jeder Spielstand-Antwort).
    Kein Eingabefeld für weitere Namen.
  - **Rollen hängen nie an einem Handy (Grundregel):** Wir spielen als Team und reichen Handys herum. Jeder Schritt eines
    Hilfsmittels (geheim eingeben, festschreiben, raten, auflösen, neue Runde) geht auf **jedem** eingeloggten Handy, auch auf
    dem, auf dem eingegeben wurde. Keine Auswahl „Wer gibt ein?“, keine Prüfung nach Spieler oder Gerät. Der Ablauf richtet
    sich nur nach der **Phase** des gemeinsamen Zustands (`T.phase`: 1 „Geheim eingeben“ → 2 „Raten“ → 3 „Ergebnis“, als
    Leiste `phaseBar` angezeigt); alle Handys zeigen immer dieselbe Phase.
  - **Geheime Eingaben** (`kind` secretTerms/secretRank/photoWord, Logik `updateSecret` in tools.js): In Phase 1 tippt, wer
    eingibt (die anderen schauen weg). Nach dem Festschreiben ist das Geheimnis auf **allen** Handys verdeckt, auch auf dem
    eingebenden. „Anzeigen“ ist auf jedem Handy möglich, aber nur durch **langes Drücken** (0,6 s → 5 s sichtbar, nur lokal)
    mit dem Hinweis „Nur für die Person, die eingegeben hat“ (Vertrauen). „Auflösen“ deckt alles für alle auf (→ Phase 3).
    „Neue Runde“ führt in **jeder** Phase zurück zu Phase 1; Begriffe früherer Runden sind gesperrt (`used`, App weist darauf hin).
  - **Format-Version (`fv` in `TOOLS`):** Ändert sich das gespeicherte Format eines Hilfsmittels, `fv` erhöhen. Zustände mit
    anderer/fehlender Version verwirft `T.sanitize` automatisch (in `update`, `result`, `phase` und `toolState`) – das
    Hilfsmittel startet dann in Phase 1 statt mit kaputtem Altzustand (z. B. Baumstaben-Wort ohne Fotos aus der Vorversion). Geheimes liegt leicht verschleiert im Spielstand (`hide`/`unhide`, Vertrauensbasis, kein
    echter Schutz). Wortvergleich (`norm`): Groß-/Kleinschreibung, Leerzeichen am Rand und Akzente egal; ä=ae, ö=oe, ü=ue, ß=ss.
  - Entwürfe vor dem Festschreiben (Sortierung, Auswahl) bleiben nur auf dem jeweiligen Handy; festgeschrieben wird synchron.
  - **Eingabefelder (Regel für alle Hilfsmittel):** Beim Tippen darf sich die Tastatur nie schließen und der Cursor nie aus
    dem Feld springen. Darum wird ein Feld, in dem gerade getippt wird, **nie ersetzt** (`typingIn`: `rerenderTools` und das
    Neuzeichnen des Hilfsmittel-Fensters werden aufgeschoben und nach Verlassen der Felder nachgeholt – mit ~350 ms
    Verzögerung, damit ein angetippter Knopf nicht unter dem Finger ersetzt wird). Gespeichert wird verzögert (500 ms nach
    der letzten Eingabe, `queueLetter`/`flushLetters`, `toolDo(…, quiet)` ohne Neuzeichnen), beim Verlassen der Felder oder
    spätestens beim Festschreiben/Verschieben (`flushLetters` vor jeder Aktion). Felder für **einzelne Buchstaben**
    (`.letter-input`, ohne `maxlength`): nach einem Buchstaben springt der Cursor ins nächste Feld (Tastatur bleibt offen);
    Tippen in ein volles Feld ersetzt den Buchstaben; Löschtaste im leeren Feld springt ins vorherige Feld und löscht dort
    (keydown „Backspace“ + `beforeinput` „deleteContentBackward“ für Android) – gehalten wird so Feld für Feld rückwärts
    gelöscht. `select()` nur auf das gerade aktive Feld anwenden (holt sonst den Fokus zurück). Gilt für eingebende Person
    und Ratende gleichermaßen.
  - Sortieren (`sortList`/`bindSort`): Ziehen am Griff (Pointer-Events, `touch-action: none`) – gezogene Box hebt sich ab
    (Schatten, etwas größer) und folgt dem Finger, die anderen rutschen animiert, Platznummern wandern mit – plus Pfeile
    hoch/runter; während des Ziehens kein Neuzeichnen. `sync` = gemeinsame Sortierung über den Server (Aktion `arrange`).
  - **Zufall:** Ordnet ein Hilfsmittel etwas zufällig an oder mischt, muss jede mögliche Anordnung gleich wahrscheinlich sein,
    auch die richtige Lösung; nichts ausschließen oder bevorzugen. Dafür `T.shuffle` (Fisher-Yates) mit `T.randomInt`
    (unverzerrt durch Verwerfen) und `rand32()` aus `crypto.getRandomValues`. Der Zufall wird beim Auslösen im Browser
    gezogen und als Teil der Aktion gespeichert (damit Warteschlange/Wiederholung dasselbe Ergebnis bringen). Test prüft Gleichverteilung.
  - **Fotos (wiederverwendbare Foto-Grundlage):** `photoPicker(qid, mehrere)` zeigt „Foto aufnehmen“ (`capture="environment"`)
    und „Aus Galerie wählen“ (`multiple`: mehrere Bilder auf einmal); offline stattdessen ein Hinweis. `processPhotos` verarbeitet
    die Bilder **nacheinander** (nie mehrere gleichzeitig im Speicher) mit Fortschrittsanzeige „Foto X von Y“, in der Reihenfolge,
    in der das Handy sie liefert. Die Datei-Felder (`#photo-camera`, `#photo-gallery`, Klasse `.photo-file`: unsichtbar, aber
    nicht `display:none`) liegen **dauerhaft** direkt im `<body>` außerhalb aller neu gezeichneten Bereiche und werden nie ersetzt (`photoInput`; sonst kann Android den Zugriff auf gewählte Dateien entziehen), Knöpfe rufen `choosePhotos` auf.
    **Ablauf einer Auswahl (`onPhotosChosen` → `processPhotos`):** Dateien **nie** komplett in den Speicher kopieren
    (kein `file.arrayBuffer()`/neuer Blob der ganzen Datei – das verdoppelte bei großen Kamerafotos den Speicher und Android
    beendete den Browser: „Zu wenig Speicher für vorherige Operation“). Streng nacheinander, immer nur ein Foto:
    `shrinkPhoto(file)` direkt aus der Datei → `uploadPhoto` (bis zu 3 Versuche bei Netz-/Serverfehler) → eintragen
    (`toolDo(…, quiet)`). Lesen nur des Dateianfangs (256 KB, `readHeader`, bis zu 3 Versuche mit Pause; 0 Byte → Hinweis
    „nur in der Cloud?“). Das Datei-Feld wird erst vor der **nächsten** Auswahl geleert (`choosePhotos`), damit „Erneut
    versuchen“ die Datei noch hat und dasselbe Bild erneut gewählt werden kann.
    **Neuzeichnen pausieren:** Solange Kamera/Galerie offen ist (`toolUI.picking`, Ende über `change`/`cancel`/Rückkehr zur
    Seite) oder Fotos verarbeitet werden (`toolUI.uploading`), gilt `photoBusy(qid)`: `rerenderTools`, `m.refresh` und das
    Nachholen beim Verlassen der Felder werden aufgeschoben; nur die Foto-Zone (`[data-photo-zone]`, Fortschritt
    „Foto X von Y“) wird aktualisiert (`updatePhotoZone`); danach holt `photoDone` alles nach.
    **Dekodieren** (`decodePhoto`): (1) JPEG + `ImageDecoder` vorhanden (Chrome/Android): direkt verkleinert dekodieren mit
    `desiredWidth/desiredHeight` = kleinste JPEG-Stufe n/8 (`ceil(w·n/8)`), deren lange Seite ≥ Ziel ist (andere Größen
    lässt Chrome scheitern) – 48-MP-Foto: ~20 statt ~220 MB; dreht der Browser nicht selbst (`"rotation" in frame` fehlt),
    dreht das Canvas nach EXIF (1–8); (2) `createImageBitmap(file, {resizeWidth})`; (3) Bild-Element mit Objekt-URL
    (`img.decode()`, z. B. iPhone/HEIC). Scheitert alles: Dateianfang erneut lesen → nicht lesbar = Stufe „Lesen“, sonst
    kleiner erneut (3 Runden) → „Verkleinern“. Ergebnis jeder Verkleinerung prüfen (nicht leer, `isJpeg`), sonst kleiner/mit
    weniger Qualität erneut. Fehlgeschlagene Fotos bleiben (nur lokal, `toolUI.photoFailed`) mit „Erneut versuchen“ und
    „Entfernen“ sichtbar; Meldung nennt die Stufe (`PHOTO_STAGES`: Auswahl / Lesen auf dem Handy / Verkleinern / Hochladen
    zum Server / Server hat abgelehnt / Eintragen), „Details“ zeigen Fehlername, Dateityp, Größe und alle Fehlversuche;
    jeder Fehler landet im Fehlerprotokoll (`reportPhotoError`). Server (`_save_photo`) lehnt nur ab: leer, zu groß
    (> 600 KB), kein JPEG – jeweils mit eigener Meldung. Jedes Bild bekommt eigene, kurzlebige Canvas/Bitmap/Frame/Objekt-URL,
    sofort freigegeben (`close()`, Canvas 0×0, `revokeObjectURL`). **Nie ein Canvas in voller Kameraauflösung.** Ergebnis: lange Seite ≤ 1.000 px, JPEG < 200 KB. Jedes Foto wird
    **sofort** per `POST api/photo` (roh, image/jpeg, Bearer-Token) hochgeladen → Antwort `{id}` (`p` + 24 Hex),
    dann `toolDo(qid, {type: "addPhoto", photo: id})` – so liegt es auf dem Server, falls das Handy den Browser beim Öffnen
    der Kamera aus dem Speicher wirft. Das offene Hilfsmittel wird gemerkt (`openTool` in localStorage, 1 h) und nach dem
    Neuladen automatisch wieder geöffnet (`restoreOpenTool`). Anzeigen mit `photoImg(id)` (`GET api/photo/<id>?t=<token>`, weil `<img>`
    keinen Header schickt). Gespeichert in `data/photos/` (nicht in git). **Nur temporär:** Nach jedem Speichern des Spielstands
    löscht der Server alle Fotos, auf die der Spielstand nicht mehr verweist (nach 2 min Schonfrist für frische Uploads;
    nach Reset sofort). Ein Hilfsmittel beendet eine Runde also, indem es die Foto-IDs aus seinem Zustand entfernt
    (Geschafft → `photos: []`, Neue Runde/Reset → Zustand leer). Foto-IDs nie verschleiern (`hide`), sonst findet der Server sie nicht.
  Aktuelle Hilfsmittel:
  - Countdown: Light Show 10 s, Dreieck auf Dreieck 10 s, Werdet brava … 30 s, Treibgutkreuz 30 s (Start/Abbrechen/Neustart, Ende: Anzeige + Vibration).
  - „Fahrzeit schätzen und stoppen“ (Seilbahn): Schätzung festschreiben, Stoppuhr, ≤ 15 s daneben, sonst neue Runde.
  - „Autos zählen“ (Höllen-Verkehr): Schätzung festschreiben, 1-Minuten-Countdown, „+1 Auto“/−1, ≤ 1 daneben, sonst neue Runde.
  - „Höhe schätzen“ (Angsthase oder Augenmaß?): echte Höhe **589 m** in content.js (`height`), vorher nie angezeigt; gemeinsame
    Schätzung festschreiben → sofort „Geschafft!“ (mit echter Höhe) bei ≤ 10 %, sonst „Daneben“ + automatisch 5 min Strafzeit.
  - „Kompass: Wo liegt Rio?“ (Grüße nach Rio): DeviceOrientation (iPhone: Erlaubnis per Knopf), Wert erst beim Tippen
    „Hier ist Rio!“, Ziel 208° ± **50°**; eine Runde = 2 Messungen, eine Treffer reicht, beide daneben → automatisch 5 min
    Strafzeit; ohne Kompass Hinweis auf Kompass-App + Wert eintragen.
  - „Tic-Tac-Toe-Spielfeld“ (Tic-Tac-São-Bento): 2 Spielende wählen, Sieg/Unentschieden, Zug zurück, neue Runde.
  - „Fünf geheime Begriffe“ (Was Churchill sah): 5 Begriffe festschreiben; „Tipps: X von 6“ mit „+1 Tipp“/−1; erratene
    Begriffe werden angetippt (auf jedem Handy; erratene sind für alle sichtbar); ≥ 3 erraten → „Geschafft!“ (Phase 3);
    6 Tipps und < 3 → „Daneben“ + „Neue Runde“, bleibt aber Phase 2, damit der letzte Tipp noch als erraten markiert werden kann.
  - „Geheime Rangfolge“ (Früchteschweiger): Phase 1: 3 Früchte eintragen (Namen später für alle sichtbar, „Früchte ändern“
    bis zum Festschreiben), geheim sortieren (oben = beste, Entwurf nur lokal) und festschreiben; dabei wird eine zufällige Startreihenfolge für die Ratenden gemischt (Zufallsregel, jede Reihenfolge
    gleich wahrscheinlich, auch die richtige). Geraten wird **gemeinsam** (synchron auf allen Handys, `guessOrder`)
    und schreiben fest → jede Position grün/rot („richtig wäre: …“); alle richtig = „Geschafft!“, sonst „Daneben“ + „Neue Runde – mit anderen Früchten“.
  - „Buchstaben-Fotos“ (Baumstaben, `kind: "photoWord"`): Phase 1 zeigt oben gut sichtbar „Foto aufnehmen“ (Kamera) und
    „Aus Galerie wählen“ (mehrere); ≥ 5 Fotos als sortierbare Liste (Ziehen am Griff mit Animation wie Früchteschweiger,
    Aktion `arrange` mit den Schlüsseln der Einträge, plus Pfeile ▲▼, Löschen, **Duplizieren**), je Foto ein Feld für genau
    einen Buchstaben (A–Z, Ä, Ö, Ü, ß;
    `T.letter`); Entwurf `draft` (Einträge `{key, photo}`, `T.draftEntries`) + verschleierte `draftLetters`, synchron, übersteht
    Neuladen. **Dasselbe Bild darf mehrfach vorkommen** (z. B. doppeltes L): keine Prüfung auf doppelte Bilder; „Duplizieren“
    (Aktion `duplicate`) fügt eine Kopie direkt darunter ein, ohne erneutes Hochladen – eigener Schlüssel, eigenes
    Buchstabenfeld, unabhängig verschiebbar/löschbar; Kopien verweisen auf dieselbe Server-Datei, die bleibt, solange
    irgendein Eintrag sie nutzt (der Server löscht nur Fotos ohne Verweis). Erneutes Wählen desselben Bildes geht ebenfalls. „Festschreiben“ (ab 5 Fotos
    mit Buchstaben) setzt das geheime Wort zusammen (keine Wörter früherer Runden). Phase 2 und 3 wie bei der Eingabe
    **untereinander** (`photoRows`: ein Foto pro Zeile, von oben nach unten in Wortreihenfolge, Buchstabenfeld bzw.
    Buchstabe daneben; kein Raster). Phase 2: Fotos ohne Buchstaben, daneben je ein Feld → „Festschreiben und vergleichen“ (**nur ein Versuch**) → Buchstabe für Buchstabe
    grün/rot, „X von Y Buchstaben richtig“ (Groß/klein egal). Alle richtig = „Geschafft!“ mit Wort (Fotos werden gelöscht);
    sonst „Daneben“ (`failed`, Phase 3): Wort wird aufgedeckt, **kein** erneutes Festschreiben – nur „Neue Runde“ (neues Wort,
    neue Fotos) oder „Trotzdem richtig“ (knappe Fälle; entscheidet, wer das Wort ausgedacht hat).
  - „Zwei Kriterien wählen“ (Mit Lorbeeren und UNESCO gekrönt): 10 UNESCO-Kriterien (i)–(x) mit deutscher Kurzfassung
    (`UNESCO_CRITERIA`), genau 2 wählen und festschreiben; Lösung (ix)+(x) in tools.js, vorher nie gezeigt. Danach wird jedes
    gewählte Kriterium einzeln bewertet („(x) richtig“, „(ii) falsch“, grün/rot); nicht gewählte werden nie verraten;
    nicht beide richtig → automatisch 10 min Strafzeit.
  - Links (`LINKS` in tools.js, eigene Zeilen): „Aktuelle Ankünfte am Flughafen Madeira“ (Halb gelandet) → https://www.madeiraairport.pt/en/fnc/arrivals;
    „Die zehn UNESCO-Kriterien“ (Mit Lorbeeren und UNESCO gekrönt) → https://whc.unesco.org/en/criteria/.
- Urlaub beenden: Restpunkte (verdient − ausgegeben) verteilen (+/−: Zeit-Belohnungen 5er-, zählbare 100er-Schritte), dann Zertifikat (PDF).

## Aufbau und Gestaltung
- Dateien: `server.py` (stdlib-WSGI), `public/logic.js` (Regeln), `public/app.js` (UI), `public/content.js` (Quests, Pins
  `pin:[lat,lon]`, `maps` = Google-Maps-Suchname oder null = Koordinaten, optional `mapsUrl` fester Link, optional `link` = Text in der Aufgabe als Link, `height` = Höhe für „Höhe schätzen“),
  `public/tools.js` (Hilfsmittel), `public/icons.js` (Lucide, Inline-SVG), `public/figures.js` (Rang-Figuren), `public/map-data.js`, `tests/logic.test.js`.
- Kopfzeile: links Schriftzug „Operação Madeira“ (Bebas Neue + goldener Kompass, einzeilig, Größe passt sich an),
  rechts genau 4 Icons in dieser Reihenfolge: Shop (shopping-bag) / **Erfolge** (trophy, früher „Statistik“) /
  **Aktivitäten** (history, früher „Logbuch“) / Einstellungen (settings, ganz rechts); beschriftet, aria-label; kein Hilfe-„?“.
  Interne View-Namen bleiben `stats` und `log`. Darunter Abzeichen: Rang-Figur · Rang · Kontostand (führt zu den Erfolgen).
  Bei ≤ 380 px: Knöpfe 44 px, lange Beschriftungen („Aktivitäten“, „Einstellungen“) kleiner (`.hdr-wide`, `.hdr-set`),
  Schriftzug passt sich an (fitLogo, bei 360 px ca. 16 px) – nach Änderungen an der Kopfzeile bei 360/390 px nachmessen.
  Eigenes Logo: `public/images/logo.svg` oder `logo.png` ersetzt den Schriftzug.
- Startseite (keine untere Leiste): Block „Regionale Quests“ (Überschrift auf Karten-Hintergrund) mit Inselkarte, Zoom (+/−/⤢),
  Legende nur 4 Stufen; darunter der kräftig blaue Block „Stapel-Quests“ (3 offene, Tausch/Multiplikator,
  Zeile „… · Joker genutzt: Tausch X von 5 · Multiplikator X von 3“); dann Knopf „Alle Quests anzeigen“.
- Pins: einzelne = Punkt-Symbol, Farbe offen = unbesucht-Grau, erledigt = erkundet-Hellgrün, deutlicher Rand;
  nahe Pins → Gruppe mit Anzahl (Antippen = Auswahl). Pin → einzelne Quest; Region → alle 3 Quests.
- Quest-Fenster: Bild oben (`public/images/quests/<ID>.jpg`, erst beim Öffnen geladen, fehlend = nichts), Titel,
  Standort als Google-Maps-Link, Beschreibung, **„Eure Aufgabe:“** fett.
- **Navigation (Regel):** Bereiche Shop / Erfolge / Aktivitäten / Einstellungen (Views `shop`, `stats`, `log`, `settings`) haben
  oben „← Zu den Quests“ (direkt zur Startseite, auch Handy-Zurück; Bereiche ersetzen den History-Eintrag).
  **Unterseiten der Einstellungen** (`SETTINGS_PAGES`: `help`, `player`, `backup`, `errors`, `end`, `reset`) haben stattdessen zwei Knöpfe:
  „← Einstellungen“ und „Zu den Quests“. Wird eine Unterseite durch **Abbrechen einer Sicherheitsabfrage** verlassen
  (Reset, RESET-Eingabe, Urlaub beenden, Belohnungs-Fenster schließen, Wiederherstellen), landet man in den Einstellungen
  (`backToSettings(view)`). Neue Unterseiten der Einstellungen in `SETTINGS_PAGES` eintragen.
- **Einstellungen** = Menü aus antippbaren Zeilen (Reihenfolge): Spielanleitung · Spieler (angemeldeter Name, „Name ändern“,
  „Abmelden“) · Spielstand sichern (sichern/wiederherstellen) · Fehlerprotokoll · Urlaub beenden & Belohnungen (gold umrandet; nach Ende:
  „Belohnungen & Zertifikat ansehen“ → Erfolge) · Kompletter Reset ganz unten mit Abstand, rot. Jede Zeile öffnet eine
  Unterseite; alle Sicherheitsabfragen bleiben.
- Erfolge (früher „Statistik“): Teamrang mit großer Figur + Rangleiter; Etappen-Balken (Farbe je Etappe = Stufenfarbe, Rang: 0–700–1.500–Maximum);
  Regionen-Block (Meilenstein-Abzeichen, Liste mit Sternen: voll gold/Umriss); Kacheln Punkte verdient | Kontostand,
  Regionale Quests | Stapel-Quests, % vom Maximum | bester Multiplikator; Maximum-Zeile; Punkte pro Tag + Durchschnitt;
  Tortendiagramme „Woher die Punkte kommen“ (Farben einfach/mittel/schwer, Legende % fett + Punkte klein, rechtsbündig)
  und „Stufen der Regionen“ (Anzahlen); „Joker genutzt:“ eingerückt, „Insgesamt ausgegeben“. Erfolge sind **nur zum Anschauen**
  (keine Spiel-Knöpfe, kein „Alle Quests“; nach Urlaubsende zeigt sie Belohnungen + Zertifikat). „Alle Quests anzeigen“ nur auf der Startseite.
- Icons: nur Lucide-Linien-Icons, keine Emojis. Rang-Figuren: dieselbe Person (Landstreicher: Hut, Bündel, Flicken;
  Abenteurer: Wanderhut, Rucksack, Kompass; Inselkönig: Krone, Umhang), Strich 2 px, goldener Akzent.
- Schriften: Fraunces (Überschriften), Inter (Text), Bebas Neue (Logo). Farben: Ozean #0b5f78/#073b4c, Sand-Hintergrund.
- Alles muss auf dem Handy gut lesbar und antippbar sein (≥ 44 px Ziele).
