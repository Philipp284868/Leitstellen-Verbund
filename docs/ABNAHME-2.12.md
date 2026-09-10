# Abnahme 2.12.0 – Fortschritt, Region und Fahrtmodell

Lokale Prüfung am 08.09.2026, Windows, Node 24.19.0. Fachliche Regeln, alle Freischaltungen, Migration und Einschränkungen stehen in [PROGRESSION-KARTE.md](PROGRESSION-KARTE.md). Die folgenden Ergebnisse stammen aus tatsächlich ausgeführten Prüfungen. Der jeweilige Linux-CI-Status und der geprüfte Commit sind zusätzlich im zugehörigen Pull Request unter [GitHub Actions](https://github.com/Philipp284868/Leitstellen-Verbund/actions) nachvollziehbar; dieses Dokument ersetzt keine Prüfung des aktuellen PR-Commits.

## Lokale Prüfungen

| Prüfung                                         | Ergebnis                                                      |
| ----------------------------------------------- | ------------------------------------------------------------- |
| ESLint                                          | Erfolgreich                                                   |
| Produktionsbuild einschließlich TypeScript      | Erfolgreich                                                   |
| Vitest ohne den Linux-AMP-Autostarttest         | 170 Tests in 20 Dateien bestanden                             |
| Reproduzierbares Balancing und Rechnerbenchmark | Erfolgreich; vollständige Messdaten in PROGRESSION-AUDIT.json |
| Git-Diff auf Whitespacefehler                   | Erfolgreich                                                   |

Ausgeführte Befehle:

```text
node .tools/pnpm-11.19.0/bin/pnpm.cjs lint
node .tools/pnpm-11.19.0/bin/pnpm.cjs build
node .tools/pnpm-11.19.0/bin/pnpm.cjs exec vitest run --exclude tests/amp-autostart.test.ts
node --test tests/hard-reset.node.mjs
node scripts/progression-audit.mjs
```

Der zusätzliche Windows-Lauf von `tests/hard-reset.node.mjs` war **nicht vollständig erfolgreich**: 13 bestanden, zwei Symlink-Tests mit `EPERM` fehlgeschlagen, ein weiterer Prozesstest nach 30 Sekunden abgebrochen. Der Linux-AMP-Autostarttest wird lokal bewusst ausgeschlossen. Die unveränderte Ubuntu-CI führt beide Suiten vollständig aus, einschließlich echter Prozessstopps, Wiederherstellung und Wartungssperren. Es wurden keine Windows-Sicherheitsrechte geändert und keine Prüfungen in der CI deaktiviert.

## Abgedeckte fachliche Fälle

- XP-Schwellen einschließlich 9/10/11, 100/101 und 10.000, Rest-XP, mehrere Aufstiege, sicherer Zahlenbereich und Ablehnung manipulierter Werte.
- Alle vorhandenen Gebäude, Fahrzeuge und Erweiterungen mit ihren realen Voraussetzungen; serverseitige Kaufgrenzen und nutzbare Organisationseinstiege. Bestandsschutz und einmaliger Ausgleich ohne erfundene historische Einsatzbelohnungen.
- Vollständiger Notruf-/Alarmierungs-/Lagemeldungs-/Abschlussweg mit genau einer XP-Gutschrift, anschließendem Levelaufstieg, neu erlaubtem Fahrzeugkauf, doppelter Kaufanforderung und echtem SQLite-Neustart.
- Lesende CLI-Migrationsvorschau, automatische Sicherung, getrennte Spielmodi, laufende Position und Ausrückzeit, erneutes Öffnen ohne zweiten Ausgleich.
- Exakt 100.000 Meter pro Achse, sämtliche neuen Orte über reale Straßen erreichbar, alle 1.959 alten Knoten durch SHA-256-Vergleich unverändert. Nicht verbundene Kreuzungen müssen als Überführung gekennzeichnet sein.
- 1 km bei 30/50/60/80/100/120 km/h ergibt 120/72/60/45/36/30 Sekunden. 10 km bei 80 km/h ergeben 450 Sekunden. Gemischte 20-km-Referenz ergibt 864 Sekunden, jeweils ohne Beschleunigungs- oder Wartezusätze.
- Längere schnellere Route, gerichtete Kanten, Sperren und feste Verzögerungen einschließlich Wetterfaktor, Endpunkten desselben Abschnitts und angebrochenen Straßenkanten.
- Tatsächliche 80 km/h, Bremsen vor niedrigeren Limits, Segmentierungs- und Tickgrößenunabhängigkeit, stationäre Wartephase am betroffenen Abschnitt, übereinstimmende ETA, Ankunft, Kilometer und Markerposition.
- Vorhandene Sicherheits-, Authentifizierungs-, Kooperations-, Organisations-, Patienten-, Pannen-, Großlagen-, Historien-, Audio- und Wiederverbindungstests bleiben Bestandteil der Regression.

## Reale Browseransichten

Der vollständige lokale Playwright-Lauf mit Edge (`PW_EDGE=1`, Projekt `chromium`) bestand **32 von 32 Tests** in 2,7 Minuten. Nach der abschließenden Korrektur des Anzeigetextes für ein ausgewähltes Fahrzeug an der Wache wurden beide neuen Kartenabläufe zusätzlich wiederholt. Die vollständige Chromium-/Firefox-Matrix wird für den konkreten PR-Commit in GitHub Actions ausgeführt.

Die Aufnahmen stammen aus dem lokal gestarteten Produktionsbuild mit echtem Server, SQLite, Anmeldung und Socket.IO. Es sind keine separat nachgebauten Vorschauen. Die Kartenprüfungen bedienen Gesamtübersicht, Ortssuche, Fahrzeugauswahl, Filter, Folgemodus, manuelle Navigation, Zoom, Offline-/Reconnect-Verhalten und Ansichten mit 1.600, 1.100 und 390 Pixeln Breite. Der helle Mobilmodus wird zusätzlich geprüft. Ein zwischenzeitlicher Lauf scheiterte am gleichzeitigen lokalen Neubau eines nachgeladenen Berichtsmoduls; ein weiterer zeigte einen überstehenden Statistikbereich. Der Neubau erfolgt nun vor dem Testlauf, und der Statistikbereich ist durch einen gezielten Layouttest abgesichert.

- [Gesamte Region](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.12/region-overview-1600.png)
- [Neuer Ort Südbruck](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.12/region-new-town.png)
- [Ausgewähltes Fahrzeug mit Fahrtdaten](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.12/region-vehicle-details.png)
- [Ansicht mit 1.100 Pixeln](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.12/region-1100.png)
- [Mobile Karte und Fahrtdaten](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.12/region-mobile-390.png)
- [Heller Mobilmodus](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.12/region-mobile-light.png)
- [500 Fahrzeuge und 40 Einsätze](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.12/region-large-fleet.png)
- [Maschinenlesbare Browsermessung](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.12/large-map-performance.json)

Der Browserbestand umfasst 100 Wachen, 500 Fahrzeuge, davon 100 aktive Fahrten, und 40 Einsätze. Die JSON-Datei protokolliert Anmeldung/Öffnen, Gesamtübersicht/Suche/Auswahl sowie die tatsächliche Zahl der SVG-Elemente. Das ist eine Bedienungsprüfung mit synthetischem großem Bestand, keine Messung beliebiger Mehrbenutzerlast. Die gespeicherten Testbestände verwenden ausschließlich temporäre lokale Datenbanken.

## Leistung und Balancing

Rechner: Intel Core i7-13700K, Windows, Node 24.19.0. 500 Fahrzeuge, davon 120 lange Fahrten; 120 Routensuchen und 100 Positionsläufe. Gemischte kalte und gecachte Routen: Median 0,376 ms, p95 1,510 ms. Positionen für 500 Fahrzeuge: Median 0,060 ms, p95 0,108 ms. Der große Fahrzeugbestand allein erzeugt etwa 7,57 MB JSON bzw. 1,68 MB gzip. WebSocket-Kompression ist aktiviert. Ein Test mit sehr vielen gleichzeitig verbundenen Leitstellen wurde daraus nicht abgeleitet; Delta-Übertragung ist nicht implementiert.

Die Modellrechnung verwendet Straßenfahrten einschließlich Hin-/Rückfahrt und Beschleunigung, kleine bis mittlere Fuhrparks, Einsatztätigkeiten und 1–1,7 effektiv parallele Einsätze. Beispielzeiten pro Aufstieg: Stufe 1 rund 7,7 Minuten, Stufe 5 rund 10,9, Stufe 10 rund 20,8, Stufe 20 rund 48,8, Stufe 35 rund 80,3 und Stufe 60 rund 124,0. Das sind reproduzierbare Schätzungen, keine gemessenen Spielerzeiten. Einzelne Übergänge liegen knapp außerhalb der angefragten ungefähren Zielbänder. Credits und der begrenzte Anrufrhythmus werden nicht künstlich vervielfacht.

## Wesentliche geänderte Dateien

- Fortschritt: `src/progression.ts`, `src/model.ts`, `src/catalog.ts`, `src/purchase.ts`, `src/ProgressionPanel.tsx`, `src/Resources.tsx`, `src/App.tsx`, `src/Panels.tsx`.
- Welt und Karte: `src/region.ts`, `src/region-extension.ts`, `src/world.ts`, `src/spatial.ts`, `src/Map.tsx`, `src/MapTerrain.tsx`, `src/VehicleMarkers.tsx`, `src/MapTools.css`.
- Routing und Bewegung: `src/routing.ts`, `src/motion.ts`, `src/vehicle-position.ts`, `src/travel.ts`, `src/engine.ts`, `src/Desk.tsx`, `src/simulation/traffic.ts`, `staffing.ts`, `dispatch.ts`, `hospitals.ts`, `faults.ts`, `reports.ts`, `dynamics-schema.ts`.
- Migration und Server: `src/travel-migration.ts`, `server/database.ts`, `server/cli.ts`, `server/game.ts`, `server/index.ts`, `server/lab.ts`.
- Nachweise: `tests/progression-motion.test.ts`, `tests/e2e/progression-map.spec.ts`, angepasste bestehende Katalog-/Welt-/Browserfixtures und Regressionen, `server/progression-audit.ts`, `scripts/progression-audit.mjs`, die Auditdateien, README und AMP-Anleitung.

Die Entwicklung erfolgt im bestehenden `dev`-Zweig mit Pull Request nach `main`. Eine Übernahme wird erst nach erfolgreicher Prüfung des konkreten PR-Commits durchgeführt. Weder Datenreset noch automatische Produktionsinstallation sind Teil dieser Änderung.
