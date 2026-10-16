# Madeira-Spiel

Private Handy-Webseite für ein Urlaubsspiel zu dritt auf Madeira: Als Team
alle 10 Regionen mit Regions-Quests erkunden, Stapel-Quests erledigen, Punkte sammeln und am Ende
gegen Belohnungen eintauschen – mit Zertifikat als PDF.

**Online stellen:** siehe [ANLEITUNG.md](ANLEITUNG.md).

## Was drin ist

- **Login** mit Name und Passwort, Seite nur unter einem geheimen Link erreichbar
- **Gemeinsamer Spielstand** für alle Handys (aktualisiert sich alle paar Sekunden)
- **Inselkarte** mit den echten Gemeindegrenzen; Regionen färben sich nach Stufe
  (grau → hellgrün → grün → gold), Antippen öffnet die 3 Regions-Quests
- **Pins** für alle 30 Regions-Quests an ihrem Standort (Zoomen mit + / − oder zwei Fingern;
  nahe beieinanderliegende Pins werden zu einer Gruppe mit Anzahl zusammengefasst)
- **Stapel-Quests**: 26 Stück, fest gemischter Stapel, immer 3 offen, automatisch wird vom Stapel gezogen
- **Alle Quests**: Übersicht über alle 56 Quests (nur zum Ansehen)
- **Shop**: Region-Joker (150, einmal), Tausch-Joker (10), Multiplikator (10, max. 3,
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

Alle Regions-Quests (inkl. Pin-Koordinaten als Breiten-/Längengrad), Stapel-Quests und
Belohnungen stehen in [`public/content.js`](public/content.js).

## Aufbau

| Datei | Zweck |
| --- | --- |
| `server.py` | kleiner Python-Server ohne Abhängigkeiten (Passwort, geheimer Link, Spielstand) |
| `public/logic.js` | Spielregeln (Punkte, Stufen, Stapel, Shop, Rückgängig) |
| `public/app.js` | Oberfläche |
| `public/content.js` | Regions-Quests, Stapel-Quests, Belohnungen |
| `public/map-data.js` | Umrisse der 10 Gemeinden (Quelle: CAOP, Direção-Geral do Território, vereinfacht) |
| `tests/logic.test.js` | Tests der Spielregeln (`node tests/logic.test.js`) |
