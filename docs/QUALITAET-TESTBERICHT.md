# Prüfbericht zur Qualitätsüberarbeitung 2.19

Stand: 09.09.2026. Dieser Bericht beschreibt tatsächlich ausgeführte Prüfungen der Qualitätsüberarbeitung auf `main`. **Die vollständige GitHub-Linux-CI für den Implementierungscommit `9926590` ist erfolgreich: 1.021 Logik-/Integrationstests, 16 Node-Betriebsfälle und 120 Browserfälle.** Die lokale Edge-Prüfung ist ebenfalls bestanden. Die unten ausgewiesenen lokalen Windows-Betriebsfehler bleiben getrennt dokumentiert.

Die Änderungen erweitern das bestehende Spiel. SQLite-Schema 13, Weltzuordnung, Konten, Besitz, Fortschritt und historische Daten bleiben erhalten. Es wurden keine Produktionsdaten zurückgesetzt und keine automatische Produktionsbereitstellung durchgeführt. Testserver verwenden isolierte Datenverzeichnisse und Testkonten.

Die lokalen Läufe erfolgten unter Windows mit Node.js **24.19.0**, lokalem pnpm **11.19.0** und Microsoft Edge über das Chromium-Projekt von Playwright **1.63.0**. Die Linux- und Firefox-Ergebnisse werden davon getrennt betrachtet.

## Ergebnisübersicht

| Prüfung | Tatsächliches Ergebnis | Nachweis und Einordnung |
|---|---|---|
| Produktionsbuild | Beide vorhandenen Builds erfolgreich: Bestandsserver und Deutschland-Client/-Server | Abschließend `.tools/test-runs/quality-release-build.log`. Der große Deutschland-Vendor-Chunk erzeugt weiterhin eine Buildwarnung; der Build ist erfolgreich. |
| Typecheck | Erfolgreich | `node .tools/pnpm-11.19.0/bin/pnpm.cjs run typecheck` wurde ausgeführt. |
| Vollständiges ESLint | Erfolgreich | Abschließend `.tools/test-runs/quality-release-lint.log` |
| Vollständiger Vitest-Lauf unter Windows | **1.020 Fälle: 1.018 bestanden, 1 fehlgeschlagen, 1 übersprungen** | `.tools/test-runs/quality-final-vitest.json`; 95 Suites, davon 94 erfolgreich. Der fehlgeschlagene AMP-Stopp und der übersprungene DEM-Symlinkfall stehen unten. |
| Zusätzliche Node-Betriebsprüfung | **16 Fälle: 13 bestanden, 2 fehlgeschlagen, 1 wegen Zeitüberschreitung abgebrochen** | `.tools/test-runs/quality-node.log`; echte lokale Symlink-/Prozessgrenzen, keine Umwertung zu bestandenen Tests. |
| Vollständiger Browserlauf mit Microsoft Edge | **58/58 bestanden**, keine übersprungenen, unerwarteten oder als instabil gewerteten Fälle | `.tools/test-runs/quality-full-edge.json`; Gesamtdauer **466,831 s** einschließlich getrenntem Lastabschnitt. |
| Normaler Abschnitt dieses Browserlaufs | **56/56 bestanden** in **419,764 s** | `.tools/test-runs/quality-full-edge-normal.json` |
| Anschließender isolierter Lastabschnitt | **2/2 bestanden** in **45,030 s** | `.tools/test-runs/quality-full-edge-load.json`; ein Worker. Erneut mit separat aufbewahrten Detailmessungen **2/2 in 51,7 s** bestanden. |
| Erneute Topbar-/Phase-1-Abnahme nach abschließenden Bedienkorrekturen | **6/6 bestanden** in **53,6 s** | `.tools/test-runs/quality-final-ui.log`. Drei Topbar-/Formularfälle und drei Phase-1-Abläufe. |
| Abschließende Deutschland-Kartenprüfung | **5/5 bestanden** in **11,7 s** | `.tools/test-runs/quality-final-map.log`; einschließlich aller drei einzeln auswählbaren Einrichtungen an identischer Koordinate bei Zoom 18. Zugehörige POI-Modultests: **8/8 bestanden**. |
| Deutschland-Abnahme mit echten lokalen Geodaten und Router | **Erfolgreich**, auch nach erneutem Lauf des versionierten Abnahmeskripts auf dem zuletzt gebauten Stand; Exit 0 | Aktualisierter [Messbeleg](quality-evidence/quality-screen-layout.json) und 13 erneuerte Bildschirmaufnahmen. |
| Firefox lokal | Nicht erfolgreich ausgeführt | Der benötigte Playwright-Browser konnte wegen Download-Zeitüberschreitungen nicht installiert werden. Keine Übertragung der Edge-Ergebnisse auf Firefox. |
| Vollständige GitHub-Linux-CI des Implementierungscommits | **Erfolgreich** | [Lauf 34347567149](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34347567149) für `992659034486c5f6ba2f6962577bce9521865465`: beide Serverjobs und sämtliche vier Browserjobs erfolgreich. |
| Chromium unter Linux | **60/60 bestanden** | Shards mit 32 und 28 Fällen, jeweils einschließlich isolierter Lastmessung; keine übersprungenen, unerwarteten oder instabilen Fälle. |
| Firefox unter Linux | **60/60 bestanden** | Shards mit 32 und 28 Fällen, jeweils einschließlich isolierter Lastmessung; keine übersprungenen, unerwarteten oder instabilen Fälle. |
| CodeQL | **Erfolgreich** | [Code-Sicherheit 34347567147](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34347567147), derselbe Implementierungscommit. |

Der Linux-Buildjob des Implementierungscommits `9926590` ist inzwischen erfolgreich nachgelesen: **1.021/1.021 Vitest-Fälle in 60 Dateien**, **16/16 Node-Betriebsfälle**, keine Auslassung oder abgebrochener Node-Fall. Der zusätzliche POI-Regressionsfall erklärt die Differenz zum früheren lokalen 1.020-Fälle-Lauf. Die drei Linux-Testabschnitte benötigten zusammen **123,559 s**. Kaltes AMP-Setup, ESLint, Produktionsaudit (keine bekannten gemeldeten Schwachstellen), zweimalige reproduzierbare Runtime-Verpackung und echter Runtime-Start samt Registrierung, sauberem Stopp und persistentem Neustart bestanden ebenfalls. Linux verwendete Node.js **24.20.0**. Die unten dokumentierten Windows-Fehlversuche werden dadurch nicht nachträglich als lokale Erfolge umgewertet.

Die Zahlen bezeichnen unterschiedliche Prüfläufe. Die sechs später wiederholten Browserfälle und gezielten Modultests werden nicht als zusätzliche unabhängige Abdeckung zu den 58 beziehungsweise 1.020 Fällen addiert.

## Geprüfte Spielabläufe und Integration

Die Browser- und Modultests prüfen zusammen den Weg vom ankommenden Notruf bis zum Archiv: Annahme und Rückfragen, bekanntes Meldebild, gespeicherte AAO und freie Fahrzeugauswahl, verbindliche Alarmierung, tatsächliche Besatzungsbildung, Ausrücken, Anfahrt, FMS, erste Lagemeldung, Nachforderung, Patientenversorgung, Klinikübergabe, Abschluss und Wiederverfügbarkeit.

Besonders relevant für diese Überarbeitung:

- **Notruf und Lage:** Unbestätigte Anruferangaben ersetzen keine bereits bestätigte Einsatzart. Die erste Erkundung wird nur durch die zugehörige Lagemeldungsaktion bestätigt. Wiederholte Aktionen erzeugen keine zweite Bestätigung.
- **Machbarkeit und Besatzung:** Initiale Patienten-, Gefahren- und Organisationsanforderungen fließen in die Generierung ein. Noch nicht erfüllbare Folgeereignisse bleiben erhalten. Ein AAO-Vorschlag beziehungsweise eine Alarmierung kann dieselben bekannten FF-Poolkräfte nicht mehrfach verplanen. Die privaten tatsächlichen Rückmeldungen freiwilliger Kräfte bleiben serverseitig.
- **Anfahrt und Abschluss:** Ereignisse mit Sekundenbruchteil verwenden die exakte Abfahrt. Offene Gefahren und Pflichtaufgaben verhindern eine vorzeitige Auszahlung. Eine erneut erforderliche Nachkontrolle beginnt von vorn. Rückfahrt, Nachbereitung und Verletzungen bleiben wirksame Sperren.
- **Kliniken:** Geeignete Fachbereiche, Intensiv- und Verbrennungsbedarf, vorhandene Belegung, Reservierungen und berechenbare Routen werden berücksichtigt. Die neuen stabilen Klinikfähigkeiten sind ausdrücklich bezeichnete Spielprofile.
- **Archiv:** Der Browserfall prüft 73 gleichzeitig aktive Einsätze, alle sechs Prioritäten, eine weiterhin alarmierbare Reserve und 137 Berichte über alle Archivseiten. Suche, JSON-Bericht und Serverneustart gehören zum Ablauf. Weitere HTTP-/CLI-Tests prüfen vollständige Exporte und Leitstellenberechtigungen.
- **Mehrspieler:** Getrennte Konten behalten private Spielstände und Einsätze. Berechtigte Mitglieder derselben Leitstelle arbeiten gemeinsam. Öffentliche Präsenz gibt weder Kontostände noch private Fahrzeug- oder Einsatzlisten frei. Mehrere Tabs, Wiederverbindung, abgelaufene Sitzungen, Widerruf und Mitgliedschaftsänderungen sind geprüft.
- **Oberfläche:** Die Karte reicht unter der 62 Pixel hohen Topbar bis zum unteren Bildschirmrand. Arbeitsbereiche sind anfangs geschlossen. Suche, Scrollen, Drag, Mausrad, Tastatur, Fokus, Escape, lokale Kameraposition und die Rückkehr aus dem Hauptmenü sind geprüft. Inline-Umbenennung speichert tatsächlich; abgebrochene Verkäufe verändern keine Daten.
- **Bestandsprofile:** Ältere reguläre Personalprofile ohne gespeicherte Dienstangaben werden serverseitig ergänzt. Die tatsächlichen Deutschland-Clientkomponenten wurden ohne installierten serverseitigen Geodatenprovider gerendert; sie rekonstruieren keine privaten OSM-Knoten. FF-Profile bleiben ausgeblendet. Der HTTP-Fall bestätigt die Herkunft ergänzter Knoten aus dem Serverindex und den unveränderten gespeicherten Bestand.

Der [Simulationsaudit](QUALITAET-SIMULATION.md) beschreibt sieben bestätigte Fehlergruppen und die zugehörigen Module. Vor dem Gesamtlauf bestanden außerdem 170 gezielte Tests gemeinsam sowie anschließend 18 Deutschland-Client-/HTTP-Fälle. [Präsenz und Berechtigungen](QUALITAET-PRAESENZ.md) und [Kartensymbole und POI-Daten](QUALITAET-KARTENSYMBOLE.md) dokumentieren ihre eigenen gezielten Nachweise und Grenzen. Die [Gesamtübersicht](QUALITAET-2.19.md) ordnet die Funktionen und neuen Bedienwege zu.

## Echte Deutschlandkarte und visuelle Abnahme

Die versionierten Bildschirmaufnahmen entstanden in der gestarteten Anwendung mit dem vorhandenen lokalen Deutschlandpaket und einem echten GraphHopper-11-Router. Die abschließende Wiederholung über `scripts/quality-acceptance.mjs` endete erfolgreich und aktualisierte den Messbeleg sowie alle 13 Aufnahmen. Es handelt sich um isolierte vorbereitete Spielsituationen mit Testkonten; sie belegen keine Verbindung zu einer produktiven Leitstelle und keine vollständige geografische Prüfung jeder deutschen Straße.

Der [gespeicherte Abnahmebeleg](quality-evidence/quality-screen-layout.json) enthält:

- Vier getrennt angemeldete Konten, darunter zwei Disponenten derselben Leitstelle und ein Konto ohne platzierten Spielstandort. Für Letzteres entsteht kein erfundener Kartenstandort.
- Unabhängige lokale Kameras, tatsächlichen Serverneustart und Offline-/Wiederverbindung.
- Kartenmaße **1920 × 1018**, **2560 × 1378** und **1366 × 706** Pixel, jeweils ab y=62. Die Dokumentgröße entspricht bei allen drei Messungen der jeweiligen Bildschirmgröße.
- Einen einmaligen Einsatzabschluss: **842.350 → 849.350 Credits** und **26.825 → 26.965 XP**, also **+7.000 Credits und +140 XP**, mit genau einem Abschlussereignis. Der Abnahmelauf prüft den erhaltenen Stand nach Neustart und Wiederverbindung.
- Eine Route mit **121,73 s gespeicherter Basisplanung**. Die protokollierten Abfahrts-/Ankunftswerte ergeben **138,70 s geplante tatsächliche Fahrt**. Diese beiden Werte werden ausdrücklich nicht gleichgesetzt: Die Routengrundlage und die durch das Spielmodell beeinflusste Fahrt sind unterschiedliche Angaben. Der Beleg ist keine Messung einer realen Straßenfahrt.
- Keine `pageerror`-Einträge im überwachten Hauptbrowser dieses erfolgreichen Laufs.

Aufnahmen zur Kontrolle: [Hauptmenü](screenshots/2.19/hauptmenue-1920.png), [Spielansicht 1920](screenshots/2.19/spielansicht-1920.png), [Spielansicht 2560](screenshots/2.19/spielansicht-2560.png), [Spielansicht 1366](screenshots/2.19/spielansicht-1366.png), [Notruf](screenshots/2.19/notruf.png), [Disposition](screenshots/2.19/disposition.png), [Einsatzbericht](screenshots/2.19/einsatzbericht.png), [Gebäudedetails](screenshots/2.19/gebaeudedetails.png), [Fahrzeugicons](screenshots/2.19/fahrzeugicons.png), [Gebäudeicons](screenshots/2.19/gebaeudeicons.png), [Spielerliste](screenshots/2.19/spielerliste.png), [Mitspieler auf der Karte](screenshots/2.19/mitspieler.png) und [Unterstützungsanfrage](screenshots/2.19/unterstuetzung.png).

## Datenabdeckung und Leistungsmessungen

Die [versionierte Geodatenstichprobe](quality-evidence/quality-poi-real.json) nennt den OSM-Paketstand **07.09.2026** und den Fingerprint `155596c0041a76f05d3b5fb03a36f2b9e26540b517fde8b4b9884c62c4fc1a90`. Der Ortsindex enthält **37.622** passende Einträge: 29.041 Feuerwachen, 3.820 Polizeiwachen, 2.162 Krankenhäuser und 2.599 Klinikeinträge. Dies sind Einträge des installierten Datensatzes, keine Behauptung über eine amtliche vollständige Bestandszahl.

Zusätzlich wurden 45 echte Detailkacheln aus Berlin, München, Duisburg, Hamburg und dem Bereich Flughafen Frankfurt gelesen. Vor der Deduplizierung enthielten sie 4.239 passende Merkmale aus elf Kategorien. Rettungswachen und THW/Katastrophenschutz sind in diesem Paket **nicht flächendeckend als eigene Kategorien nachgewiesen**. Die Oberfläche zeigt nur ausdrücklich vorhandene passende Merkmale; sie erfindet keine fehlenden Wachen aus Namen.

Die [aufbewahrten CPU-Messungen](quality-evidence/quality-poi-performance.json) ergeben:

| Messung auf dem lokalen Rechner | Umfang | Median / beobachtetes Maximum |
|---|---:|---:|
| Einmalige Vorbereitung des POI-Speicherindex | Reale Dateien, bereits durch das Betriebssystem gelesener Bestand | 599,64 ms einmalig |
| Indexabfrage Zoom 6 | Drei Abfragen, 2.232 Einträge | 9,47 / 10,70 ms |
| Indexabfrage Zoom 10 | Drei Abfragen, 214 Einträge | 6,11 / 6,43 ms |
| Indexabfrage Zoom 14 | Drei Abfragen, 4 Einträge | 6,00 / 6,26 ms |
| Gruppierung von Spielmarkern | 5.000 Marker, 50 Durchläufe | 0,94 / 2,90 ms |
| Gruppierung von POIs | 8.000 Punkte, 50 Durchläufe | 1,63 / 9,35 ms |
| POI-Deduplizierung | 8.000 Punkte, zehn Durchläufe | 30,17 / 35,43 ms |

Diese Werte messen konkrete CPU-Funktionen und lokale Indexabfragen. Sie sind **keine FPS-Messung**, keine kalte Installationsmessung und keine Zusage für beliebige AMP-Hardware oder Spielerzahlen. Die Deduplizierung erfolgt bei Datenänderungen, nicht bei jedem Simulations-Tick.

Die beiden isolierten Playwright-Lastfälle bestanden ihre vorhandenen Assertions. Da ein späterer gezielter Lauf ein Ausgabeverzeichnis wiederverwendet hatte, wurden die Lastfälle erneut separat ausgeführt und ihre Detailmessungen versioniert. Der Wiederholungslauf bestand **2/2 Fälle in 51,7 s**. Diese Messungen betreffen ausdrücklich den weiterhin geprüften **Bestandsrenderer**, nicht die Deutschland-WebGL-Darstellung:

- [Großer Bestand](quality-evidence/quality-legacy-load.json): 100 Wachen, 500 Fahrzeuge, 100 laufende Fahrten, 40 Einsätze. Anmeldung und Öffnen **9.371 ms**, Übersicht/Suche/Auswahl zusammen **1.245 ms**, 1.408 SVG-Elemente.
- [Kartenbewegung](quality-evidence/quality-legacy-frames.json): Edge **152.0.4191.66**, 1920 × 1080, 100 Wachen, 500 Fahrzeuge und 40 Einsätze auf dem historischen Rivermere-Datensatz. Während 3.726,47 ms Kartenbewegung wurden 247 Frameabstände aufgezeichnet: Median **12,2 ms**, 95. Perzentil **30,4 ms**, neun Abstände über 33 ms. Der SVG-Bestand betrug 4.707 Elemente. Dies ist keine Zusage einer konstanten Bildrate und kein Ersatz für die oben dokumentierte echte Deutschland-Abnahme.

## Fehler, Korrekturen und Plattformgrenzen

Die frühen Browserläufe waren nicht vollständig erfolgreich: zuerst 15/22, danach 22/25 Fälle. Sie deckten echte Überlagerungen an der Kartenlegende, verlorene Auswahl beim Wechsel zu Kartenwerkzeugen, den Deutschland-Wachenprofilabsturz und geänderte Navigationswege auf. Die Korrekturen wurden in den späteren erfolgreichen Läufen geprüft. Der neue Aufbau verwendet andere Bedienwege; die fachlichen Assertions und vorhandenen Leistungsschwellen wurden dabei nicht abgesenkt.

Folgende lokale Betriebsprüfungen hatten unter Windows ausdrücklich keinen Erfolgsnachweis. Die entsprechenden vollständigen Linux-Suites bestanden später im oben verlinkten CI-Lauf:

1. **AMP-Neustart unter Windows:** `tests/amp-autostart.test.ts` meldet „Lock nach Windows-Stopp vorhanden; Linux-CI erforderlich.“ Der Stopp-/Neustartfall ist im vollständigen Vitest-Bericht fehlgeschlagen. Das ist kein Nachweis eines sauberen Linux-SIGTERM-Stopps und wird nicht durch Löschen der Sperre als bestanden ausgegeben.
2. **Dateisymlinks unter Windows:** Zwei Fälle in `tests/hard-reset.node.mjs` scheitern bereits beim Anlegen ihrer Test-Dateisymlinks mit `EPERM`. Damit ist die zugehörige Schutzprüfung in diesem Lauf nicht durchgeführt. Andere Symlink-/Hardlinkfälle haben eigene erfolgreiche Ergebnisse; sie ersetzen diese beiden nicht.
3. **Reset-Prozessablauf:** Der Node-Fall mit echtem Server, zwei Konten, Reset-CLI, Neustart und erneuter Registrierung wurde lokal nach 30 Sekunden abgebrochen. Der anschließende Linux-Lauf bestätigte die Prozess-/SIGTERM-Abwicklung mit 16/16 erfolgreichen Node-Fällen.
4. **DEM-Symlink:** Der vorhandene Fall „folgt keinem DEM-Symlink aus dem freigegebenen Paket“ ist unter Windows übersprungen. Er zählt weder als bestanden noch als fehlgeschlagen.
5. **Firefox:** Der lokale Installer scheiterte nach mehreren Versuchen an Zeitüberschreitungen. Die beiden anschließend tatsächlich ausgeführten Firefox-CI-Projekte bestanden zusammen 60/60 Fälle.

Die weiterhin vorhandene Vite-Warnung zum großen Deutschland-Vendor-Chunk betrifft die Bündelgröße. Zusätzlich warnt Vitest vor einer künftig geänderten Vite-Konfigurationsladeart. Beide Warnungen werden von den oben genannten Fehlern getrennt betrachtet; keine von ihnen wird als bereits behobene Optimierung dargestellt.

## Reproduktion

Lokale Prüfungen aus dem Repository mit Node.js 24 und dem vorhandenen lokalen pnpm 11.19.0:

```powershell
node .tools/pnpm-11.19.0/bin/pnpm.cjs run typecheck
node .tools/pnpm-11.19.0/bin/pnpm.cjs run lint
node .tools/pnpm-11.19.0/bin/pnpm.cjs run build
node .tools/pnpm-11.19.0/bin/pnpm.cjs exec vitest run --maxWorkers=2
node --test tests/hard-reset.node.mjs

$env:PW_EDGE = '1'
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = '.tools/test-runs/quality-reproduction-edge.json'
node scripts/browser-tests.mjs --project=chromium
```

Der Browser-Wrapper trennt die normalen Fälle und die anschließende Lastprüfung mit einem Worker. Für nachfolgende gezielte Läufe ein anderes `--output`-Verzeichnis verwenden, damit die Lastartefakte erhalten bleiben. Die oben dokumentierten Windows-Fehler bleiben bei einer Reproduktion mögliche tatsächliche Fehler; die Befehle enthalten keine Umgehung.

Die reale Deutschland-Abnahme ist als [Skript](../scripts/quality-acceptance.mjs) mit [isoliertem Testserver](../tests/fixtures/quality-real-server.ts) im Repository enthalten. Sie benötigt ein bereits fertiges, zusammengehörendes Deutschlandpaket und einen tatsächlich laufenden passenden Router:

```powershell
$env:GEODATA_DIR = (Resolve-Path '../leitstellen-deutschland-geodata').Path
$env:ROUTER_URL = 'http://127.0.0.1:8989'
$env:PW_EDGE = '1'
node scripts/quality-acceptance.mjs
```

Den Geodatenpfad beziehungsweise die Routeradresse an die lokale Installation anpassen. Der Testserver erzeugt sein `DATA_DIR` selbst unter dem Betriebssystem-Tempverzeichnis, bindet an Loopback mit freiem Port und verwendet eigens erzeugte Konten. Er übernimmt keine produktive Datenbank. Simulationsfortschritte für die Abnahme werden über den privaten IPC-Kanal des Testprozesses ausgelöst; ein Zeitbeschleunigungsregler wird dadurch nicht Teil des Spiels. Standardmäßig entstehen Screenshots unter `.tools/screenshots/quality-2.19` und Messdaten unter `.tools/test-runs/quality-screen-layout.json`.

## Abschlussstand, CI und Veröffentlichung

Die Implementierung wurde direkt auf `main` mit `071434f` (Simulationskorrekturen) und `992659034486c5f6ba2f6962577bce9521865465` (integrierte Oberfläche, Kartenebenen, Präsenz und Tests) committed und regulär gepusht. Der GitHub-API-Abruf bestätigte anschließend denselben `main`-Commit. Es wurden kein Featurebranch, Pull Request oder Force-Push verwendet.

Die gezielte Nachprüfung der zuletzt ergänzten POI-Auswahl ist bestanden. Der zugehörige [GitHub-Linux-Lauf](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34347567149) wurde für den vollständigen Implementierungscommit mit `conclusion=success` nachgelesen. Die Jobprotokolle bestätigen die oben genannten Testzahlen. Der [versionierte CI-Beleg](quality-evidence/quality-ci.json) hält Commit, Lauf, Jobs und Zählwerte fest. Die nachfolgende Dokumentation ergänzt diesen geprüften Code ohne weitere Produktänderung; der jeweilige neueste `main`-Prüfstatus bleibt zusätzlich direkt unter [GitHub Actions](https://github.com/Philipp284868/Leitstellen-Verbund/actions/workflows/ci.yml) sichtbar.

Die sieben Wikiquellen und fünf Issue-Nachträge sind für die Veröffentlichung aus dem bestätigten `main`-Stand vorbereitet. Ihr tatsächlicher Veröffentlichungsstatus wird separat nach dem Schreiben und erneuten Lesen ausgewiesen. Für das GitHub Project ist die [Aktualisierung lokal vorbereitet](PROJECT-QUALITAET-2.19.md). Der GraphQL-Zugriff lieferte `INSUFFICIENT_SCOPES` wegen fehlendem `read:project`; eine HTTP-200-Antwort bedeutete dabei keinen erfolgreichen Projektzugriff. Das Projekt wurde deshalb nicht blind überschrieben. Eine Veröffentlichung ändert weder Produktionsserver noch Datenpakete automatisch.
