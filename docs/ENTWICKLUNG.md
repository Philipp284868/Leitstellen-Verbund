# Entwicklung und Qualitätsprüfung

Deutschland ist die einzige aktive Welt. PC-Multiplayer verwendet denselben serverseitigen Spielstand über Website, HTTP und Socket.IO. Der normale Build enthält genau `dist/client/` und `dist/server/`; fehlende Geodaten starten keine Ersatzwelt.

## Einrichtung und Entwicklung

Node.js 24 und pnpm 11.19.0 sind festgelegt. `node scripts/amp-setup.mjs` installiert den lokal geprüften Paketmanager, die Lockfile-Abhängigkeiten und baut das Produkt. `--install-only` bereitet ausschließlich Werkzeuge vor. Der Archivhash des Paketmanagers ist im Repository fixiert; ein beschädigter Cache wird erkannt.

Für AMP gilt die [Paketinstallation](AMP.md). Der getrennte Entwicklerweg `node scripts/install-germany.mjs` lädt ausdrücklich das große Geodatenpaket; normale Builds und UI-Entwicklung laden keine Deutschlanddaten.

`npm run dev` verwendet vorhandenes `GEODATA_DIR` und einen passenden lokalen Router in `GRAPHHOPPER_URL`. `DEV_DATA_DIR` bezeichnet einen getrennten Entwicklungsstand; das normale `DATA_DIR` wird nicht übernommen. Vite liefert Hot Reload, der Server wird nach tatsächlich betroffenen Importänderungen inkrementell neu übersetzt und sauber neu gestartet. Ports: `DEV_PORT` 5173, `DEV_API_PORT` 4010. Strg+C beendet die Prozesse und gibt SQLite frei.

## Befehle

| Befehl                                               | Tatsächlicher Umfang                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `check:quick`                                        | Projektgrenzen, Links, Format, Lint, vollständige Typprüfung                                                 |
| `build`                                              | Deutschland-Client und -Server; Typen und Bundlebudgets immer                                                |
| `build:fast`                                         | Gleiche Abnahme, unveränderte intakte Ausgaben aus dem Buildcache                                            |
| `start` / `preview`                                  | Derselbe Deutschland-Start einschließlich lokalem Router                                                     |
| `test:quick -- --base SHA`                           | Abhängigkeitsauswahl zwischen expliziter Basis und HEAD; bei unbekannter/breiter Änderung vollständige Logik |
| `test:unit` / `test:integration`                     | Nach tatsächlichen Laufzeitimporten ermittelte, disjunkte Gruppen                                            |
| `test` / `test:ci`                                   | Alle Logik-/Integrationstests und Node-Betriebsprüfungen                                                     |
| `test:e2e`                                           | Alle normalen Browserfälle in Chromium und Firefox, ein Start                                                |
| `test:e2e -- --load`                                 | Isolierte Kartenlastfälle, ein Worker, kein vorgelagerter normaler Durchlauf                                 |
| `test:full`                                          | Build, Struktur, Lint, gesamte Logik, Node, Audit und normale Browser                                        |
| `node scripts/ci-plan.mjs --profile full --base SHA` | Maschinenlesbarer vollständiger GitHub-Abnahmeplan                                                           |
| `clean`                                              | Nur Vorschau; ausdrücklicher Bereinigungsaufruf schützt Daten und Verknüpfungen                              |

`test:full` ist die lokale Vollprüfung. Die verbindliche Linux-Produktabnahme ergänzt echte Geodatenwerkzeuge, reproduzierbares Runtime-Paket und dessen Start/Neustart. Ein lokaler Windows-Lauf ersetzt insbesondere den Linux-SIGTERM- und Symlinknachweis nicht.

## Prüfprofile und Freigabe

`scripts/ci-contract.mjs` definiert Pflichtgruppen. `ci-plan.mjs` erfasst neue, umbenannte und gelöschte Pfade aus zwei vollständigen Commits. Fehlende Basis oder unbekannte Auswirkung führt zur vollen Abnahme. Simulation, Server, gemeinsame UI, Fixtures, Build- und Releasewerkzeuge erhalten keine schmale Auswahl. Änderungen an Karte/Geodaten schließen die vertiefte Kartenlast ein. Reine Markdown-Dokumentation braucht keinen Spielbuild.

Das schnelle Profil enthält beide Engines, tatsächliche Anmeldung/Kartenbereitschaft und den Kernablauf aus `game.spec.ts` sowie betroffene Regressionen. Es ist ausdrücklich keine Releasefreigabe. Die vollständige Abnahme enthält alle aktuellen normalen Browserfälle; das vertiefte Profil ergänzt Lastmessungen.

Ein Job baut den Commit. Folgejobs erhalten dieselben Ausgaben und Werkzeuge, prüfen Plattform, Node-Version, Commit und Dateihash erneut. Ausgewählte und tatsächlich ausgeführte Dateien, Testzahlen und Laufzeiten stehen in den Artefakten. Fehlende/abgebrochene Pflichtjobs, fehlende oder doppelte Shards, leere Testdateien, Fehler, Flakiness und unerwartete Skips verhindern den Gesamtstatus. Tests werden nie als bestanden gecacht.

Ein Release verlangt vollständige Abnahme und Sicherheitslauf für exakt den aktuellen main-Commit, den aktuellen Vertrag, vollständige Dateiabdeckung sowie identische Build-/Paketprüfsummen. Der manuelle Releaseworkflow übernimmt das bereits getestete Paket; er baut kein neues ungeprüftes Paket.

Der manuelle Releaseworkflow startet standardmäßig mit `verify_only: true`: Nur lesende Repository-Rechte, Paketdownload, Prüfsummen und Freigabenachweis; kein Tag und kein Entwurf. Erst die ausdrücklich ausgeschaltete Option erlaubt dem getrennten Entwurfsjob Schreibrechte. Dieser prüft den main-Stand und die Paketbytes erneut.

## Fixtures und Wartung

`tests/fixtures/germany/` enthält einen kleinen technischen Berliner Ausschnitt, feste IDs/Zufallswerte und kontrollierte Zeit. Er ist kein spielbarer Ersatzdatensatz. Für Logiktests ist der externe Geodatenlieferant ein ausdrücklicher Vertragsprovider. HTTP- und Browserfälle verwenden echte Produktionsserver, SQLite und MapLibre mit kleiner SQLite/MBTiles-Datei und getrenntem Routerprozess. Parser-, Quellen-, Routing- und DEM-Verträge werden zusätzlich eigenständig geprüft.

Schreibbare Datenbanken und Sitzungen sind pro Test getrennt. Der kleine unveränderliche Geodatenbestand wird pro Worker wiederverwendet. Szenarien springen in kurzen Simulationsschritten bis zur geprüften Bedingung; Formularprüfungen bekommen direkt einen gültigen Kontostand. Gebäudekäufe verwenden die automatische Besetzung. Allgemeine Fixtures führen kein veraltetes hire/assign aus.

Browserdateien bleiben intern seriell. Zwei Worker verarbeiten unabhängige Dateien; gewichtete Shards nutzen gemessene Dateilaufzeiten aus `scripts/browser-costs.json`. Neue unbekannte Dateien erhalten ein konservatives Gewicht und werden vollständig zugeteilt.

Die zusätzliche Prüfung verweigerter Clipboard-Berechtigungen verwendet das ausschließlich in Chromium verfügbare CDP-Protokoll. Sie steht ausdrücklich in `clipboard-permissions.chromium.spec.ts`; Plan, Playwright und Releaseprüfung stimmen über diesen Engineumfang überein. Der normale Supportdialog, Datenschutz und der Fallback bei fehlender Clipboard-API laufen in beiden Engines. Es gibt dafür keinen zur Laufzeit übersprungenen Firefox-Fall.

[Zuordnung alter und neuer Prüfanforderungen](TESTMIGRATION.json) · [Datenbrücken](KOMPATIBILITAET.md) · [Laufzeitmessungen](https://github.com/Philipp284868/Leitstellen-Verbund/blob/8940407e97361c978cd95125922849c97dda9b19/docs/TESTLAUFZEITEN.md) · [Historische Nachweise](https://github.com/Philipp284868/Leitstellen-Verbund/blob/8940407e97361c978cd95125922849c97dda9b19/docs/HISTORIE.md)

## Repository-Prozess

Direkt auf `main` arbeiten, fremde Änderungen erhalten, abgeschlossene geprüfte Teilschritte committen und pushen. Kein Force-Push und kein automatisches privates Produktionsupdate. Reset und stabile Veröffentlichung benötigen ihre eigene ausdrückliche Freigabe. Ein privater Server wird durch einen Git-Push nicht verändert.
