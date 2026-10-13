# Madeira-Spiel

Private Handy-Webseite für ein Urlaubsspiel zu dritt auf Madeira: Als Team
alle 10 Regionen erkunden, Bonus-Karten erledigen, Punkte sammeln und am Ende
gegen Belohnungen eintauschen – mit Zertifikat als PDF.

**Online stellen:** siehe [ANLEITUNG.md](ANLEITUNG.md).

## Was drin ist

- **Login** mit Name und Passwort, Seite nur unter einem geheimen Link erreichbar
- **Gemeinsamer Spielstand** für alle Handys (aktualisiert sich alle paar Sekunden)
- **Inselkarte** mit den echten Gemeindegrenzen; Regionen färben sich nach Stufe
  (grau → hellgrün → grün → gold), Antippen öffnet die 3 Quests
- **Bonus-Karten**: 26 Karten, fest gemischter Stapel, 3 auf der Hand, automatisches Nachziehen
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

Alle Quests, Bonus-Karten und Belohnungen stehen in
[`public/content.js`](public/content.js). Die Texte sind Entwürfe.

## Aufbau

| Datei | Zweck |
| --- | --- |
| `server.py` | kleiner Python-Server ohne Abhängigkeiten (Passwort, geheimer Link, Spielstand) |
| `public/logic.js` | Spielregeln (Punkte, Stufen, Stapel, Shop, Rückgängig) |
| `public/app.js` | Oberfläche |
| `public/content.js` | Quests, Bonus-Karten, Belohnungen |
| `public/map-data.js` | Umrisse der 10 Gemeinden (Quelle: CAOP, Direção-Geral do Território, vereinfacht) |
| `tests/logic.test.js` | Tests der Spielregeln (`node tests/logic.test.js`) |
