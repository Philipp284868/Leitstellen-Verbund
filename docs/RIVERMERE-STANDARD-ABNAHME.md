# Rivermere als einzige ausgelieferte Karte

Auftrag vom 08.09.2026: Nur noch die neue Karte verwenden.

## Umsetzung

Client und Server werden fest für `rivermere-1` gebaut. Standardziel ist `dist/server/index.js`, CLI `dist/server/cli.js`, Website `dist/client/`. `LV_WORLD` schaltet keine alte Karte mehr ein. Der zweite Build wurde entfernt; das alte generierte Verzeichnis `dist/worlds/` wird bei einem vollständigen Build bereinigt. Entwicklung und Labor verwenden ebenfalls Rivermere. Die Entwicklung verwendet einen eigenen neuen Datenpfad, damit kein früherer Falkenried-Entwicklungsstand versehentlich geöffnet wird.

Schema 12, Rivermere-Seed und Weltkennung bleiben unverändert. Bestehende Rivermere-Spielstände bleiben kompatibel. Falkenried-Daten werden vor SQLite-Schreiboperationen abgewiesen, nicht verschoben oder zurückgesetzt. Der Schutztest öffnet einen echten alten Datenbestand mit dem neuen Standardserver, prüft die Fehlermeldung, bytegleiche SQLite-Datei und freigegebene Prozesssperre. Für Betreiber: [AMP](AMP.md), [Sicherung und Kartenwechsel](RIVERMERE.md).

Historische Geografie bleibt für vorhandene Migrations- und Wiederherstellungsprüfungen im Quellcode erhalten. Ein separates Vitest-Setup erzeugt dafür Testprogramme ausschließlich unter `.tools/legacy-tests`; sie gelangen nicht in `dist` oder das Linux-Paket. Die Browserprüfungen verwenden ausnahmslos den tatsächlich ausgelieferten Rivermere-Server. Die bestehende Rivermere-Neustartprüfung läuft ebenfalls gegen das Standardprogrammziel.

## Tatsächliche lokale Prüfungen

- Produktionsbuild, Typecheck, Lint und `git diff --check`: erfolgreich.
- Vitest unter Windows: 184 Tests bestanden, einschließlich acht Rivermere-Prüfungen. Der Linux-SIGTERM-Test wird zusätzlich in der vollständigen CI ausgeführt.
- Nach Anpassung der gemeinsamen Rettungsdienst-Testdaten: 21 betroffene Logik-/Betriebstests erneut erfolgreich.
- Edge: erster vollständiger Durchlauf 39 erfolgreich, fünf Fehler durch bisherige Kartenannahmen in Testdaten. Korrekturen: alte Ortsnamen ersetzt, sichtbare Markerpositionen und ausreichend entferntes Fahrziel auf Rivermere gewählt, Rettungswachen nur auf tatsächlich zulässigem Land gebaut. Keine Schutzprüfung oder Lastgrenze abgeschwächt.
- Gezielte Wiederholungen: 14 Karten-/HUD-Abläufe und sechs medizinische/organisatorische/Karten-Abläufe erfolgreich. Damit wurden alle 44 Browserfälle erfolgreich abgedeckt, einschließlich beider Lastprüfungen; der erste Gesamtlauf war ausdrücklich nicht vollständig grün.
- Echte neue Menü-/HUD-Aufnahmen in vier Desktopauflösungen erstellt; Rivermere und Fahrzeugroute in der 1920-Pixel-Aufnahme visuell kontrolliert.
- Node-Reset-Suite lokal: 13 bestanden, zwei Datei-Symlink-Prüfungen durch Windows-EPERM verhindert, echter Prozessablauf unter Windows mit Timeout. Die vollständige Linux-Suite bleibt unverändert verpflichtend; das Serverfixture verwendet nun das für Rivermere erforderliche ausdrückliche DATA_DIR.

Den aktuellen vollständigen Linux-CI-Status zeigen die GitHub-Actions-Läufe des zugehörigen main-Commits. Kein Produktionsserver wurde installiert, gestartet, zurückgesetzt oder automatisch aktualisiert.

## Nachprüfung der CI-Lastmessung

Der erste Rivermere-Standardcommit `da4c490` bestand in Linux 185 Vitest- und 16 Node-Prüfungen, den Paketstart sowie die Sicherheitsprüfung. Beide Browser bestanden ihre 42 regulären Abläufe. Chromium überschritt anschließend bei der Übersicht/Suche/Auswahl mit 14.089 ms die unveränderte Grenze von 10.000 ms; Firefox erreichte während der Lastphase das gesamte Job-Zeitlimit. Dieser Lauf war nicht erfolgreich.

Die betroffene Übersichtsmessung betrieb Simulation und Playwright-Steuerung im selben Node-Prozess. Sie verwendet jetzt wie die vorhandene zweite Rivermere-Lastprüfung einen separaten echten Serverprozess mit SQLite, Socket.IO und laufenden Fahrten. Die Lastdaten werden gemeinsam erzeugt und vor der Messung auf 100 Wachen, 500 Fahrzeuge, 40 Einsätze und 100 aktive Fahrten geprüft; die ursprüngliche Zielortverschiebung von fünf Orten bleibt erhalten. Zehn-Sekunden-Grenze und vollständige Bedienfolge bleiben unverändert. Lokal besteht die isolierte Edge-Messung mit 1.647 ms; beide Lastfälle bestehen und der Server stoppt sauber.

Die vollständigen Browserfälle werden in der CI pro Browser auf zwei getrennte Runner verteilt. Jede Teilmenge führt ihre Lastfälle erst nach den normalen Fällen mit einem Worker aus. Testfristen und das zwölfminütige Job-Limit wurden nicht angehoben. Eindeutige Artefaktnamen erhalten die Ergebnisse beider Teilmengen.
