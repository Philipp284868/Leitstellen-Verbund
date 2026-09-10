# Kartenabnahme: Rivermere und PC-Steuerung

Stand: 08.09.2026 · Version 2.15.0 · [Auftrag und abschließender Commit-/CI-Nachweis: Issue #26](https://github.com/Philipp284868/Leitstellen-Verbund/issues/26).

## Bestätigter Fehler und Korrektur

Der Regressionstest zog mit echten Browser-Mausereignissen über die Beschriftung ALTSTADT. Vor der Korrektur enthielt die native Auswahl tatsächlich `TADT`, `NORDHÖHE`, `LINDENAU` und `WESTEND`. Die Pointer-Verarbeitung ließ die native Textauswahl beginnen; Klick und Ziehen waren nicht ausreichend getrennt. Es war kein Grund vorhanden, den SVG-Renderer auszutauschen.

Die Karte verhindert diese Standardaktion jetzt gezielt auf ihrer eigenen Fläche. Begrenzte `user-select`-Regeln schützen Karte und Bedienknöpfe; editierbare Felder und kopierbare Texte bleiben benutzbar. Es gibt weder fortlaufendes Löschen der Dokumentauswahl noch eine globale Mausereignissperre.

Ab fünf CSS-Pixeln beginnt eine Ziehbewegung mit Pointer Capture. Ihre Kameraposition wird aus dem ursprünglichen Mauspunkt berechnet und im Renderzyklus übernommen. Genau der anschließende Drag-Klick wird unterdrückt. Pointer-Abbruch, Capture-Verlust, Fensterfokus, Sichtbarkeitswechsel, Dialogöffnung und Entfernen der Ansicht räumen den Zustand auf.

Der native Wheel-Listener ist nicht passiv; normale Karten-Wheel-Ereignisse verhindern äußeres Scrollen. Pixel-, Zeilen- und Seiten-Deltas werden vereinheitlicht. Die Zoomverankerung verwendet die tatsächliche SVG-Abbildung. Strg-/Meta-Zoom wird nicht zusätzlich als Kartenzoom verarbeitet. Listen und Dialoge liegen außerhalb dieser Kartenbehandlung.

## Welt und Bestandsschutz

Rivermere ist eine eigenständige Welt mit 100.000 Metern je Achse: 10.000 km². Weltkoordinaten werden mit exakt 12 Metern pro Einheit umgerechnet. Der Straßenstand enthält 13.504 Knoten, 3.576 Straßen, 14.772 Abschnitte und 22 getrennte Überführungen. Die Tests erreichen sämtliche Knoten aus einem zusammenhängenden Netz und prüfen Routen zu allen Orten und Stadtteilen.

Straßenzeichnung, Knoten, Abschnittslängen und Fahrzeugrouten verwenden dieselben Geometrien. Die vorhandene Fahrzeitsimulation mit Straßenlimits, Fahrzeuggrenzen, Sperren, Verkehr, Beschleunigung und Bremsung bleibt erhalten. Die Kamera beeinflusst weder Simulation noch fremde Clients.

Die Bildkomposition wurde in eine fiktive Vektorwelt übersetzt: zentraler Ballungsraum, 22 Außenorte, drei Seen und Flusslandschaft. Das Ergebnis ist keine fotorealistische Luftaufnahme. Kleine Straßen, Bebauung, Geländeflächen und Höhen sind konstruiert und nicht aus dem Bild vermessen. Hafenbauplätze liegen an Land; ihr vereinfachter Anschluss an den Fluss ist ausdrücklich in [RIVERMERE.md](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/RIVERMERE.md) beschrieben.

Eine verlustfreie Umplatzierung des bestehenden Falkenried ist nicht möglich. Deshalb bleiben der bisherige Server und seine Welt erhalten. Der Build liefert Rivermere zusätzlich unter `dist/worlds/rivermere/dist/server/index.js`. Diese Anwendung benötigt eine eigene Instanz und ein eigenes ausdrücklich gesetztes dauerhaftes `DATA_DIR`. Es wurde kein Produktivserver geändert.

Schema 12 speichert Weltkennung, Seed und Generierungsversion. Vor dem Schemawechsel wird die bestehende Sicherung erstellt. Die Migration verändert keine Wachen, Besitzstände, aktiven Einsätze oder Fahrten. Eine fremde Welt wird vor Datenbankschreiboperationen abgelehnt. `scripts/world-preview.mjs` bietet eine ausschließlich lesende Vorschau. Die Betriebsfolge steht in [RIVERMERE.md](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/RIVERMERE.md) und [AMP.md](AMP.md).

## Tatsächlich ausgeführte Prüfungen

| Prüfung | Nachweis |
| --- | --- |
| Produktionsbuild beider Welten inklusive Typecheck | Lokal erfolgreich |
| Lint | Lokal erfolgreich |
| Logik-, Sicherheits-, Migrations- und Integrationstests | 183 lokal bestanden; ausschließlich der Linux-SIGTERM-Test ist auf Windows ausgenommen |
| Vollständige lokale Browserprüfung | 44 Abläufe in Edge 152.0.4191.66 bestanden, darunter zwei anschließend isoliert ausgeführte Lastprüfungen |
| Abschließende gezielte Browserabnahme | Vier Eingabetests und zwei Rivermere-Tests bestanden; die Rivermere-Suite erzeugte die fünf nachstehenden Aufnahmen und die Messdatei |
| Linux-CI der Weltintegration `875a601` | 182 Logiktests, 16 Node-Betriebstests und je 44 Browserabläufe in Chromium und Firefox erfolgreich; [Lauf 34221356426](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34221356426) |
| CI nach den abschließenden Ergänzungen | Commitbezogene Ergebnisse und Links werden in Issue #26 festgehalten; der frühere Lauf ist kein Nachweis eines späteren Commits |

Die neuen Fälle prüfen außerdem eine echte Server-Neustartfolge mit gespeicherter Fahrt, deterministische erneute Weltgenerierung, bytegleich erhaltene SQLite-Dateien bei Weltkonflikt, fremde Objektaktionen und wiederholte Aktionen. Neue Wachen auf Flussknoten werden abgewiesen; trockene Wasserrettungsstandorte bleiben baubar.

Die CI führt höchstens zwei Logiktestdateien gleichzeitig aus und prüft die vollständige Rivermere-Weltgenerierung in einer anschließenden eigenen Gruppe. Zuvor konkurrierten Weltgenerierung und transaktionale Transport-/Wiederherstellungstests auf dem kleinen Prüfrechner; dabei traten Zeitüberschreitungen auf. Keine Testdatei entfällt. Die bestehende Fünf-Sekunden-Frist der einzelnen Logiktests wurde nicht pauschal erhöht; vollständige Weltgenerierung gehört zur gesondert begrenzten Testvorbereitung.

Die Browserabnahme benutzt echte Maus- und Tastatureingaben für Markerdrag, Folgeklick, HUD-Überquerung, Cursorzoom, Listenscroll, Suchfeld, Bauen, erneutes Öffnen und unabhängige Kameras. Die Fünf-Pixel-Schwelle wird auch bei doppelter Pixeldichte geprüft. Capture-Verlust wird über die Browser-Capture-API ausgelöst. Fokus- und Sichtbarkeitsbenachrichtigungen werden zusätzlich explizit ausgelöst; das ist kein manueller Betriebssystem-Alt-Tab-Test. Strg-Zoom wird auf fehlende zusätzliche Kartenaktion geprüft, nicht als vollständiger Test sämtlicher Browser-Menü-Zoomstufen.

Der durchgehende Rivermere-Ablauf umfasst Anmeldung, Regionsübersicht, Stadtsuche, Dorf, Verschieben, Einsatzwahl, tatsächliche zusätzliche Alarmierung über das HUD, sichtbare Anfahrt, Hilfeanfrage, Chattext mit Strg+A/Kopieren/Einfügen sowie erneutes Laden mit erhaltener Kamera. Bestehende Tests decken außerdem Einsatzabschluss, Transport, Kooperation, Berechtigungen und Reconnect ab.

Lokal war Edge verfügbar. Google Chrome war nicht installiert. Downloads der zusätzlichen Playwright-Browser Chromium und Firefox scheiterten lokal an Zeitüberschreitungen aller angebotenen Downloadserver. Chromium und Firefox wurden deshalb in der tatsächlichen Linux-CI geprüft; sie werden nicht als lokale Chrome- beziehungsweise Firefox-Läufe ausgegeben.

## Leistung und Messmethode

Testrechner: Windows 11 Pro 10.0.26200, Intel Core i7-13700K (16 Kerne / 24 Threads), etwa 32 GB RAM. Browser: Edge 152.0.4191.66, 1920 × 1080 CSS-Pixel. Lastbestand: 100 Wachen, 500 Fahrzeuge, 40 Einsätze, darunter 100 aktive Rückfahrten.

Ein eigener Serverprozess betreibt diesen Bestand. Playwright zieht mit 100 Mausbewegungsschritten; `requestAnimationFrame` erfasst die gesamte Geste bis zum Loslassen. [Messwerte](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/rivermere/chromium-performance.json) enthalten Dauer, erfasste Frames, Median, 95. Perzentil, Frames über 33 ms und SVG-Elementzahl. Trotz des Playwright-Projektnamens `chromium` identifiziert diese lokale Datei ihren tatsächlich verwendeten Browser als Edge.

Abschließender Lauf nach Korrektur der Bebauung an kurzen Straßenabschnitten: 5.922,5 ms Gestendauer, 288 erfasste Frames, Median 12,2 ms, 95. Perzentil 30,4 ms, zehn Frames über 33 ms und 4.496 SVG-Elemente. Das entspricht über die Geste ungefähr 49 erfassten Frames pro Sekunde. Die Zielmarke von durchgehend 60 fps wurde in diesem Lastlauf nicht erreicht. Andere Probeläufe lagen bei einem Median von 12,1 ms und einem 95. Perzentil von 24,3 ms; diese günstigeren Werte ersetzen nicht den abschließenden Messdatensatz.

Eine frühe Probe mit nur einem kurzen Messfenster bildete nicht die ganze Geste ab und wird nicht als Leistungsnachweis verwendet. Die endgültige Messung ist keine universelle 60-fps-Zusage und kein isolierter Benchmark ausschließlich des Renderers: Browserautomation, Simulation, Betriebssystem und Bildwiederholrate beeinflussen das Ergebnis.

Optimierungen: unveränderte eingeklappte Betriebsstatistiken werden wiederverwendet; Fahrzeugmarker außerhalb des relevanten Ausschnitts werden ausgespart; Gelände wird in überlappenden Ausschnitten aktualisiert; Walddetails und Häuser werden nach Sichtbereich geladen. Transparente Hintergrundunschärfe wird während des Ziehens reduziert. Die tatsächlich ausgewählten Fahrzeuge und ihre Einsatzzuordnung bleiben erhalten.

## Reale Ansichten

Die Aufnahmen stammen aus der gestarteten Anwendung mit einem isolierten Testkonto, nicht aus einem Entwurf. Die Testzeit und Kontodaten sind künstliche Testdaten. Es gibt keine nachträglich aufgemalten Routen oder HUD-Flächen.

- [Gesamte Region](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/rivermere/chromium-region.png)
- [Rivermere / Innenstadt](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/rivermere/chromium-city.png)
- [Westhaven / kleinere Stadt](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/rivermere/chromium-town.png)
- [Meadowbrook / Dorf und Umland](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/rivermere/chromium-village.png)
- [Einsatz mit Fahrzeugroute](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/rivermere/chromium-incident-route.png)

Eine zusätzliche Bedienungsaufnahme als Video wurde nicht erstellt. Die Interaktionsnachweise sind die ausgeführten Browserprüfungen.

## Dateien und GitHub

Wesentliche Implementierung: `src/Map.tsx`, `src/map-camera.ts`, `src/MapTools.css`, `src/App.tsx`, `src/ui.tsx`, `src/Operations.tsx`, `src/world.ts`, `src/region.ts`, `src/world-choice.ts`, `src/rivermere/geography.ts`, `src/rivermere/Terrain.tsx`, `src/MapTerrain.tsx`, `src/purchase.ts`, `src/model.ts`, `src/world-migration.ts`, `server/database.ts`, `server/config.ts`, Buildskripte und Weltvorschau. Menü und HUD beziehen den Weltnamen aus derselben Weltwahl.

Nachweise: `tests/e2e/map-input.spec.ts`, `tests/e2e/rivermere.spec.ts`, `tests/rivermere.test.ts`, `tests/rivermere-fixture.ts`, `tests/helpers/rivermere-load-server.mjs` und bestehende Migrationsprüfungen. Keine bestehenden Pflichtprüfungen wurden abgeschwächt oder aus der CI entfernt.

Die Änderungen werden direkt auf `main` übertragen. Eingabekorrektur: `8123af9`; versionierte Weltintegration: `875a601`. Den abschließenden Stand benennt Issue #26. Kein Force-Push, kein neuer Feature-Branch und keine Produktionsbereitstellung.

Die Wiki-Quellen einschließlich Rivermere-Seite und Navigation wurden unter `docs/wiki/` erweitert. Nachtrag vom 08.09.2026: Nach Anmeldung des Inhabers wurde die Wiki initialisiert und der geprüfte Quellenstand `3445f6d` veröffentlicht (Wiki-Commit `71a2906`, zwölf Inhaltsseiten plus Navigation). Die [Rivermere-Seite](https://github.com/Philipp284868/Leitstellen-Verbund/wiki/Rivermere) ist online. Auch das separate [Entwicklungsboard](PROJECT-EINRICHTUNG.md) ist jetzt eingerichtet und mit den vorhandenen Issues verknüpft. Beide früheren Einrichtungshindernisse sind behoben. Wiki-Verfahren: `WIKI-VEROEFFENTLICHUNG.md`.
