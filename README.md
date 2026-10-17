# Operação Madeira - Das Spiel

Private Handy-Webseite für ein Urlaubsspiel zu dritt auf Madeira: Als Team
alle 10 Regionen mit regionalen Quests erkunden, Stapel-Quests erledigen, Punkte sammeln und am Ende
gegen Belohnungen eintauschen – mit Zertifikat als PDF.

**Online stellen:** siehe [ANLEITUNG.md](ANLEITUNG.md). (Repository und Ordner heißen weiterhin `madeira-spiel`.)

## Was drin ist

- **Login** mit Name und Passwort, Seite nur unter einem geheimen Link erreichbar
- **Gemeinsamer Spielstand** für alle Handys (aktualisiert sich alle paar Sekunden)
- **Inselkarte** mit den echten Gemeindegrenzen; Regionen färben sich nach Stufe
  (grau → hellgrün → grün → gold), Antippen öffnet die 3 regionalen Quests
- **Pins** für alle 30 regionalen Quests an ihrem Standort (Zoomen mit + / − oder zwei Fingern;
  nahe beieinanderliegende Pins werden zu einer Gruppe mit Anzahl zusammengefasst)
- **Stapel-Quests**: 26 Stück, fest gemischter Stapel, immer 3 offen, automatisch wird vom Stapel gezogen
- **Alle Quests**: Übersicht über alle 56 Quests (nur zum Ansehen)
- **Shop**: Region-Joker (150, 1 im Spiel), Tausch-Joker (10, 5 im Spiel), Multiplikator (10, 3 im Spiel,
  95 % ×0,5–×2,0 / 5 % Jackpot ×5, aufgerundet); gesperrt bei negativem Kontostand
- **Rückgängig** für alles, mit identischem Ergebnis bei Wiederholung; **Logbuch** mit Zeit und Name
- **Kompletter Reset** mit doppelter Sicherheitsabfrage („RESET“ eintippen)
- **Ränge** Landstreicher / Abenteurer / Inselkönig nach verdienten Punkten
- **Animationen** beim Abhaken, beim Erkunden einer Region und groß bei „Madeira erkundet!“ (+300)
- **Statistiken** mit Rang, Punkten, bestem Multiplikator, Tagen, Punkten pro Tag (Diagramm)
- **Spielanleitung** über den „?“-Knopf
- **Urlaub beenden**: Restpunkte mit +/− auf Belohnungen verteilen, Live-Umrechnung,
  danach **Zertifikat als PDF** (gilt als Gutschein)

## Inhalte bearbeiten

Alle regionalen Quests (inkl. Pin-Koordinaten als Breiten-/Längengrad), Stapel-Quests und
Belohnungen stehen in [`public/content.js`](public/content.js).

**Eigenes Logo:** Eine Datei `public/images/logo.svg` (bevorzugt) oder `public/images/logo.png`
ersetzt automatisch den Schriftzug „Operação Madeira“ oben links. Gut geeignet: querformatig,
transparenter Hintergrund, helle Farben (die Kopfzeile ist dunkelblau), PNG ca. 600 × 120 Pixel.

## Aufbau

| Datei | Zweck |
| --- | --- |
| `server.py` | kleiner Python-Server ohne Abhängigkeiten (Passwort, geheimer Link, Spielstand) |
| `public/logic.js` | Spielregeln (Punkte, Stufen, Stapel, Shop, Rückgängig) |
| `public/app.js` | Oberfläche |
| `public/figures.js` | Rang-Figuren (Landstreicher, Abenteurer, Inselkönig) als Strichzeichnung |
| `public/icons.js` | Linien-Icons (Lucide, ISC-Lizenz) |
| `public/content.js` | Regionale Quests, Stapel-Quests, Belohnungen |
| `public/map-data.js` | Umrisse der 10 Gemeinden (Quelle: CAOP, Direção-Geral do Território, vereinfacht) |
| `tests/logic.test.js` | Tests der Spielregeln (`node tests/logic.test.js`) |
