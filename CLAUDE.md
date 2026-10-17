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
- OpenStreetMap/Nominatim/Wikipedia sind in der Umgebung gesperrt; Koordinaten per Websuche ermitteln
  und mit den Gemeindegrenzen (CAOP, github.com/nmota/caop_GeoJSON) prüfen. Pins nie eigenmächtig verschieben,
  Abweichungen melden.

## Updates auf PythonAnywhere (für den Nutzer)
1. Bash-Konsole: `cd ~/madeira-spiel && git pull` (bei „local changes“: `git checkout -- . && git pull`)
2. Web-Tab → **Reload**.
3. Nur wenn nötig: auf der Seite „Neues Spiel starten“ bzw. Reset. Ein Reset ist nötig, wenn sich Quest-/Stapel-IDs
   oder die Spielstand-Struktur ändern (dann `SCHEMA` in logic.js erhöhen → App zeigt automatisch „Neue Spielinhalte“).
Konfiguration in der WSGI-Datei (`pythonanywhere_wsgi.py`): `MADEIRA_PASSWORD`, `MADEIRA_LINK_KEY` (geheimer Link-Teil).
Spielstand: `data/state.json`, Spielernamen: `data/players.json` (beide nicht in git). Details: ANLEITUNG.md.

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
  „Madeira erobert!“/„Madeira erschlossen!“ mit großer Animation, **ohne Punkte**, im Logbuch (auch „nicht mehr erfüllt“).
- Stapel-Quests: einfach 15 (10×), mittel 25 (10×), schwer 50 (6×) = 700. Basis 1.000 + 300 + 700 = 2.000; mit Stufen 2.400.
- Shop (gesperrt bei negativem Kontostand): **Region-Joker** 150 P, 1 im Spiel (Region gilt als erkundet, ohne 100 P;
  weitere Quests heben normal); **Tausch-Joker** 10 P, 5 im Spiel; **Multiplikator** 10 P, 3 im Spiel, einer pro Stapel-Quest:
  95 % ×0,5–×2,0 (Zehnerschritte), 5 % Jackpot ×5, aufgerundet; Stapel-Quest mit Multiplikator nicht tauschbar.
- **Variables Maximum** = 2.400 + Σ(multiplizierter Wert − Grundwert) aller Stapel-Quests mit Multiplikator (offen oder erledigt);
  sofort neu bei Kauf/Rückgängig. Anzeige: „Maximum: 2.430 (Basis 2.400, Multiplikatoren +30)“, ohne Mult. nur „Maximum: 2.400“.
- Ränge nach **verdienten** Punkten (nicht Kontostand): Landstreicher ab 0, Abenteurer ab 700, Inselkönig ab 1.500 (fest).
- Rückgängig für alles (nicht Meilensteine/Reset/Ende); gleiche Ergebnisse bei Wiederholung (Würfe/Stapel beim Start fest).
  Punkte immer aus dem Spielstand berechnet. Logbuch mit Zeit + Name. Reset gilt für alle, Eingabe „RESET“.
- **Offline-Schutz** (app.js): Server nicht erreichbar (Netz weg, Zeitüberschreitung, 5xx) → roter Streifen unter der Kopfzeile
  „Offline – Änderungen werden nicht gespeichert“, `body.is-offline`; speichernde Knöpfe (`SAVING_BUTTONS`: Abhaken, Rückgängig,
  Tausch, Multiplikator, Käufe, Ende, Reset, Wiederherstellen) sind ausgegraut und zeigen beim Antippen einen Hinweis. Ansehen
  geht weiter. Polling läuft weiter; ist der Server zurück, verschwindet der Streifen und der komplette Stand wird neu geladen.
  Schlägt das Speichern fehl → Fehlermeldung „… Die Aktion wurde NICHT ausgeführt.“, lokaler Stand bleibt unverändert.
- **Spielstand sichern/wiederherstellen** (Statistik, Abschnitt „Spielstand sichern“): lädt `operacao-madeira-JJJJ-MM-TT.json`
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
  - **Geheime Eingaben** (`kind` secretTerms/secretRank/secretWord, Logik `updateSecret` in tools.js): zuerst wählen, wer
    eingibt (Auswahl aus allen Spielern; „Andere Person“ bis zum Festschreiben). Nur diese Person kann auf ihrem Handy eingeben
    (Name-Vergleich mit `sameName`). Nach dem Festschreiben überall verdeckt; nur auf ihrem Handy „Anzeigen“ (5 s, lokal).
    „Auflösen“ deckt alles für alle auf. „Neue Runde“ = neue Eingabe derselben Person; Begriffe früherer Runden sind gesperrt
    (`used`, App weist darauf hin). Geheimes liegt leicht verschleiert im Spielstand (`hide`/`unhide`, Vertrauensbasis, kein
    echter Schutz). Wortvergleich (`norm`): Groß-/Kleinschreibung, Leerzeichen am Rand und Akzente egal; ä=ae, ö=oe, ü=ue, ß=ss.
  - Entwürfe vor dem Festschreiben (Sortierung, Auswahl) bleiben nur auf dem jeweiligen Handy; festgeschrieben wird synchron.
  - Sortieren: Ziehen am Griff (Pointer-Events, `touch-action: none`) + Pfeile hoch/runter; während des Ziehens kein Neuzeichnen.
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
  - „Fünf geheime Begriffe“ (Was Churchill sah): 5 Begriffe festschreiben; „Tipps: X von 6“ mit „+1 Tipp“/−1; nur die
    eingebende Person tippt Begriffe als „erraten“ an (erratene sind für alle sichtbar); ≥ 3 erraten → „Geschafft!“,
    6 Tipps und < 3 → „Daneben“ + „Neue Runde“ (neue Begriffe, keine Wiederholung).
  - „Geheime Rangfolge“ (Früchteschweiger): Person trägt 3 Früchte ein (Namen für alle sichtbar), sortiert geheim (oben = beste)
    und schreibt fest; die anderen sortieren ihre Vermutung und schreiben fest → sofort Vergleich; „Daneben“ zeigt die richtige
    Rangfolge mit grün/rot je Platz + „Neue Runde – mit anderen Früchten“.
  - „Geheimes Wort“ (Baumstaben): Wort ≥ 5 Buchstaben festschreiben; andere sehen „Wort mit X Buchstaben“; Tipps werden mit `norm`
    verglichen; falsch → „Daneben“, die eingebende Person kann „Trotzdem richtig“ tippen; weitere Tipps erlaubt; „Neue Runde“.
  - „Zwei Kriterien wählen“ (Mit Lorbeeren und UNESCO gekrönt): 10 UNESCO-Kriterien (i)–(x) mit deutscher Kurzfassung
    (`UNESCO_CRITERIA`), genau 2 wählen und festschreiben; Lösung (ix)+(x) in tools.js, vorher nie gezeigt; daneben →
    automatisch 10 min Strafzeit, Lösung wird dabei **nicht** gezeigt.
  - Links (`LINKS` in tools.js, eigene Zeilen): „Aktuelle Ankünfte am Flughafen Madeira“ (Halb gelandet) → https://www.madeiraairport.pt/en/fnc/arrivals;
    „Die zehn UNESCO-Kriterien“ (Mit Lorbeeren und UNESCO gekrönt) → https://whc.unesco.org/en/criteria/.
- Urlaub beenden: Restpunkte (verdient − ausgegeben) verteilen (+/−: Zeit-Belohnungen 5er-, zählbare 100er-Schritte), dann Zertifikat (PDF).

## Aufbau und Gestaltung
- Dateien: `server.py` (stdlib-WSGI), `public/logic.js` (Regeln), `public/app.js` (UI), `public/content.js` (Quests, Pins
  `pin:[lat,lon]`, `maps` = Google-Maps-Suchname oder null = Koordinaten, optional `mapsUrl` fester Link, optional `link` = Text in der Aufgabe als Link, `height` = Höhe für „Höhe schätzen“),
  `public/tools.js` (Hilfsmittel), `public/icons.js` (Lucide, Inline-SVG), `public/figures.js` (Rang-Figuren), `public/map-data.js`, `tests/logic.test.js`.
- Kopfzeile: links Schriftzug „Operação Madeira“ (Bebas Neue + goldener Kompass, einzeilig, Größe passt sich an),
  rechts Icons Shop / Logbuch / Statistik / Hilfe (beschriftet, aria-label). Darunter Abzeichen: Rang-Figur · Rang · Kontostand.
  Eigenes Logo: `public/images/logo.svg` oder `logo.png` ersetzt den Schriftzug.
- Startseite (keine untere Leiste): Block „Regionale Quests“ (Überschrift auf Karten-Hintergrund) mit Inselkarte, Zoom (+/−/⤢),
  Legende nur 4 Stufen; darunter der kräftig blaue Block „Stapel-Quests“ (3 offene, Tausch/Multiplikator,
  Zeile „… · Joker genutzt: Tausch X von 5 · Multiplikator X von 3“); dann Knopf „Alle Quests anzeigen“.
- Pins: einzelne = Punkt-Symbol, Farbe offen = unbesucht-Grau, erledigt = erkundet-Hellgrün, deutlicher Rand;
  nahe Pins → Gruppe mit Anzahl (Antippen = Auswahl). Pin → einzelne Quest; Region → alle 3 Quests.
- Quest-Fenster: Bild oben (`public/images/quests/<ID>.jpg`, erst beim Öffnen geladen, fehlend = nichts), Titel,
  Standort als Google-Maps-Link, Beschreibung, **„Eure Aufgabe:“** fett.
- Unterseiten Shop/Logbuch/Statistik mit „← Zu den Quests“ (führt immer direkt zur Startseite, auch Handy-Zurück).
- Statistik: Teamrang mit großer Figur + Rangleiter; Etappen-Balken (Farbe je Etappe = Stufenfarbe, Rang: 0–700–1.500–Maximum);
  Regionen-Block (Meilenstein-Abzeichen, Liste mit Sternen: voll gold/Umriss); Kacheln Punkte verdient | Kontostand,
  Regionale Quests | Stapel-Quests, % vom Maximum | bester Multiplikator; Maximum-Zeile; Punkte pro Tag + Durchschnitt;
  Tortendiagramme „Woher die Punkte kommen“ (Farben einfach/mittel/schwer, Legende % fett + Punkte klein, rechtsbündig)
  und „Stufen der Regionen“ (Anzahlen); „Joker genutzt:“ eingerückt, „Insgesamt ausgegeben“; Spiel-Knöpfe.
- Icons: nur Lucide-Linien-Icons, keine Emojis. Rang-Figuren: dieselbe Person (Landstreicher: Hut, Bündel, Flicken;
  Abenteurer: Wanderhut, Rucksack, Kompass; Inselkönig: Krone, Umhang), Strich 2 px, goldener Akzent.
- Schriften: Fraunces (Überschriften), Inter (Text), Bebas Neue (Logo). Farben: Ozean #0b5f78/#073b4c, Sand-Hintergrund.
- Alles muss auf dem Handy gut lesbar und antippbar sein (≥ 44 px Ziele).
