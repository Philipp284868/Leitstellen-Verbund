# Entwicklung und Qualitätsprüfung

Node.js 24 und das fixierte pnpm 11.19.0 verwenden. Einmalig `node scripts/amp-setup.mjs` ausführen. Danach benötigen normale Builds/Tests keine weitere Installation. `node .tools/pnpm-11.19.0/bin/pnpm.cjs <Befehl>` funktioniert ohne globales pnpm.

## Dauerhafte Entwicklung

`dev` startet standardmäßig das Deutschlandspiel. `GEODATA_DIR` verweist auf das vorhandene lokale Geodatenpaket; `GRAPHHOPPER_URL` auf dessen laufenden lokalen Router. Kein Download/Import beim UI-Start. Die Schritte für vorhandene Geodaten stehen in [Deutschland-Daten](DEUTSCHLAND-DATEN.md).

`DEV_DATA_DIR` bezeichnet ausschließlich einen eigenen Entwicklungsstand. Ohne Angabe wird ein eigener weltbezogener Nachbarordner angelegt. Das gewöhnliche `DATA_DIR` wird nicht zur Entwicklung übernommen. `DEV_PORT` (5173) und `DEV_API_PORT` (4010) sind konfigurierbar. Für erhaltene Rivermere-Kompatibilitätsprüfungen ausdrücklich `LV_BUILD_WORLD=rivermere-1` setzen.

Vite bleibt bei UI-Änderungen aktiv. Esbuild überwacht die tatsächlichen Serverimporte und übersetzt inkrementell; ein erfolgreicher veränderter Build startet nur den Backendprozess sauber neu. Fehler erscheinen im Terminal, der vorherige erfolgreiche Server bleibt bei Übersetzungsfehlern aktiv. Ausgaben liegen in `.tools/dev`, nicht im Produktionspaket. Strg+C beendet beide Prozesse und gibt die SQLite-Sperre frei.

## Befehle und Umfang

| Befehl               | Umfang                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `check:quick`        | Importgrenzen, aktive Links, Testgruppenvollständigkeit, Whitespace, Prettier, ESLint, vollständige inkrementelle Typprüfung        |
| `test:quick`         | Kurze Regressionen für Geld, Besatzung, Fuhrpark, Präferenzen, Audio, IDs, Speicher und Werkzeugschutz; keine vollständige Abnahme |
| `test:unit`          | Alle nach tatsächlichen Laufzeitimporten ermittelten Unit-Dateien                                                                  |
| `test:integration`   | Server, SQLite, Netz-/Prozessprüfungen, Migrations- und Weltkompatibilität                                                         |
| `test` / `test:ci`   | Vollständige Vereinigung der Logik-/Integrationstests einschließlich Node-Betriebstests                                            |
| `test:e2e`           | Chromium und Firefox; Desktopabläufe, danach Lastfälle isoliert; echte Server und getrennte Konten                                 |
| `test:full`          | Kalter Produktionsbuild mit Typprüfung, Projekt-/Lintprüfung, alle Logik-/Betriebstests, Audit und beide Browser                   |
| `build`              | Vollständiger Produktionsbuild beider erhaltenen Weltvarianten, keine Wiederverwendung früherer Builds                             |
| `build:fast`         | Vollständige inkrementelle Typprüfung; nur bytegeprüfte unveränderte Buildartefakte wiederverwenden                                |
| `bench:dev`          | Dokumentierte Start-/HMR- und Build-/Testmessung; siehe CLI-Hilfe                                                                  |
| `clean`              | Nur Vorschau freigegebener regenerierbarer Verzeichnisse                                                                           |
| `clean dist --apply` | Ausschließlich die geprüfte Buildausgabe entfernen; keine Spiel-/Geodaten                                                          |

Die Testgruppierung verfolgt Laufzeitimporte bis in Fixtures. Typimporte allein machen keine Integration aus. Neue Dateien werden automatisch erfasst; `check:project` prüft die vollständige disjunkte Vereinigung. Unbekannte gebaute Server-/Prozessimporte gehen in Integration. Schreibbare Daten, Sessions und Ports bleiben isoliert. Testresultate werden nie als Erfolgscache wiederverwendet. Linux prüft echtes SIGTERM und symbolische Dateiverknüpfungen; Windows verwendet für geordnetes Beenden die vorhandene IPC-Schnittstelle.

## Caches und Ausgabegrenzen

Buildcache-Schlüssel enthalten Quellcode, öffentliche Assets, Konfiguration, Skripte, Lockfile, Node-Version, Plattform, Architektur und Welt. Ein Treffer verifiziert die komplette Ausgabe mit SHA-256; fehlende, hinzugefügte oder geänderte Dateien erzwingen Neubau. Typprüfung erfolgt weiterhin. `.tools/cache` enthält nur wiederherstellbare Tooldaten. `clean` folgt keinen Symlinks/Junctions und verweigert Datenbanken, Sicherungen und Geheimnisdateien auch innerhalb eines vermeintlichen Ausgabeordners. Vorschau ist Standard; bei laufender Entwicklung keine parallele Bereinigung.

Bundlegrenzen werden pro Anwendungscode, Herstellerbibliothek, MapLibre und Kartenworker geprüft. Die große festgelegte Kartenbibliothek erhält eine begründete eigene Grenze. Laufzeiten werden als Messdaten erfasst, nicht mit einem unrealistischen gemeinsamen Sekundenlimit für alle Rechner bewertet. Bestehende echte Lasttests behalten ihre Grenzwerte. Bei messbarer Verschlechterung denselben Befehl, Fixturestand und Cachezustand vergleichen.

## Regel für jede Folgeänderung

1. Vorhandene Implementierung, Aufrufer, dynamische Einträge und gespeicherte IDs finden.
2. Bestehende Zuständigkeit erweitern oder gezielt ersetzen.
3. Alle gültigen Aufrufer migrieren; erst dann nachweislich überholte Teile entfernen.
4. Passende Tests aktualisieren und wirklich ausführen; bei gemeinsamen Grundlagen vollständig prüfen.
5. Geänderte Oberfläche im Browser benutzen: Fokus, Escape, Scrollen, Offline und Fehlermeldung beachten.
6. Neue Abhängigkeiten, Assets und Konfigurationsvarianten konkret begründen.
7. Aktive Anleitungen und Befehle gemeinsam mit der Implementierung aktualisieren.
8. Keine Daten, Secrets, Buildausgaben, Screenshotsammlungen oder temporären Protokolle committen. Rohbelege als begrenzte CI-/Abnahmeartefakte aufbewahren.

Historische Abnahmeberichte dokumentieren ihren damaligen Stand. [Phase 0](PHASE-0.md) beschreibt Befunde und Nachweise dieser Bereinigung. [CONTRIBUTING](../CONTRIBUTING.md) regelt main, lokale Vorprüfungen und Veröffentlichungen.
`format:check` prüft alle aktiven TypeScript-, JavaScript- und CSS-Dateien sowie die Workflows mit dem fixierten Prettier. Die vorher abweichenden 19 unveränderten Quelldateien wurden in einem eigenen Formatierungscommit vereinheitlicht; es gibt keine ignorierten Altverstöße. Der Prettier-Cache gehört zur geprüften regenerierbaren Toolablage.
Die Umsetzung verwendet die dokumentierten Mechanismen von [Vite](https://vite.dev/guide/performance), [esbuild](https://esbuild.github.io/api/#rebuild) und [React 19.2](https://react.dev/reference/react/useSyncExternalStore#my-subscribe-function-gets-called-after-every-re-render). Die Paketversionen wurden nicht aktualisiert.
