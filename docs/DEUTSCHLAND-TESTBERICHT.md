# Deutschlandkarte · Prüfprotokoll

Prüfstand vom 09.09.2026, Version 2.16.0. Dieser Bericht trennt automatisierte Integrationsfixtures von tatsächlich ausgeführten Prüfungen des vollständigen Deutschlandpakets. Alle großen Datenimporte und die unten beschriebenen lokalen Karten-, Fahr-, Browser- und Startprüfungen wurden ausgeführt. Es fand keine Produktionsbereitstellung statt.

## Geodaten

| Bestand                          | Tatsächlicher Nachweis                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Geofabrik-Deutschland 07.09.2026 | 4.834.386.028 Bytes; SHA-256 `155596c0041a76f05d3b5fb03a36f2b9e26540b517fde8b4b9884c62c4fc1a90`                                        |
| Vollständiger räumlicher Index   | 20.645.969 Straßenanker und 24.419.563 Orte/Straßen/Adressen; 8.946.647.040 Bytes; SQLite quick_check erfolgreich                      |
| Staatsgrenze                     | Tatsächliche OSM-Relation51477; Außen-/Innenringe und territoriale Beschneidung der Standorte                                          |
| Höhenquellen                     | 94 Copernicus-GLO90-COGs, 357.915.645 Bytes, einzeln mit SHA-256 gepinnt                                                               |
| Fertige Höhenkacheln             | 5.922 Terrarium-PNG-Kacheln in Zoom5–11, 611.127.296 Bytes; SHA-256 `d8b7d65b0729dddb528d1ad64ac5d989d60a2ac0d322f15fccf118eb4220801c` |

DEM: vollständige SQLite-/Kachelabdeckungs-/PNG-Prüfung erfolgreich; Höhenstichproben Brocken1.137,6m, Zugspitze2.924,9m, Feldberg1.484,9m und Nordsee0m. Kontrolliertes Fortsetzen nach Unterbrechung sowie erneuter Build bei vorhandenem fertig geprüftem Bestand erfolgreich. Es handelt sich um ein90-m-Oberflächenmodell einschließlich Bebauung/Vegetation.

Der echte Ortsindex wurde für Berlin, Hamburg, München, Köln, Frankfurt, Fehmarn, Büsingen und Sylt geprüft. Nächste-Anker-Abfragen benötigten beim ersten Aufruf0,33–5,23ms, Regionsabfragen11,42–156,37ms. Wiederholte räumliche Abfragen kamen aus dem begrenzten Cache. Der Betriebssystemcache wurde nicht geleert; dies ist keine Cold-Disk-Messung. In diesen Regionen wurden31 tatsächliche Kliniken mit Straßenankern in0–76,26m Abstand zum OSM-Objektpunkt gefunden. [Einzelwerte und Grenzen](DEUTSCHLAND-ROUTING.md).

## Vollständiger Import und reale Fahrten

Der vollständige Car-Straßengraph enthält 17.513.243 Knoten und 20.753.029 Kanten; 191.095 Abbiegebeschränkungen und 16 vorbereitete Landmarken sind importiert. Der einmalige Graphaufbau dauerte 18 Minuten 26 Sekunden. Die vollständige Vektorkarte umfasst 264.518 Kacheln in Zoom 0–14 und 3.203.960.832 Bytes; Planetiler beendete den Aufbau nach 11 Minuten 35 Sekunden erfolgreich. Das gemeinsame Manifest wurde am 09.09.2026 um 00:57:58 Uhr MESZ nach den vollständigen SQLite-Prüfungen und Artefakt-Prüfsummen atomar auf `ready` gesetzt.

Fünf reale Strecken wurden mit dem Spieladapter und erneut abgefragten Originalantworten verglichen: Berlin–Hamburg 288,49 km, Berlin–München 583,86 km, Köln–Dresden 571,74 km, Fehmarn–Kiel 88,13 km und Konstanz–Büsingen 52,06 km. Alle erhalten die vollständige Geometrie; die Entfernungssumme weicht um weniger als einen Meter vom Router ab. Bei leerem Providercache und warmem Router lagen die ersten Anfragen bei 57–656 ms. Alle 31 zusätzlich geprüften Klinik-Anfahrten waren erreichbar. Die feste Car-Routenwahl und ihre Grenzen sind im [Routingnachweis](DEUTSCHLAND-ROUTING.md) beschrieben.

Ein zusätzlicher tatsächlicher Simulationslauf alarmierte nach einem Notruf ein HLF von Berlin nach Hamburg. Nach Schließen und erneutem Öffnen von SQLite und Provider blieben Fahrweg, Auftrag, ETA und FMS 3 erhalten; anschließend setzte sich die Fahrt auf derselben Geometrie fort. Dies war ein kontrollierter Testspielstand mit gezielt fortgeschalteter Spielzeit, keine in Echtzeit abgewartete Fernfahrt.

## Automatisierte Logik und Betrieb

- Deutschland-Tests verwenden echte SQLite-Dateien sowie lokale HTTP-/Socket.IO-Prozesse. Kleine Routing-/Kachelfixtures prüfen Datenidentität, Koordinaten, exakte Abschnittsverträge, Wiederverbindung, Besitzrechte, doppelte Aktionen, FMS/Alarmierung/Nachforderung/Historie und Weltbestandsschutz. Sie ersetzen keine reale Deutschlandkarte.
- Der providerlose Clienttest prüft bekannte Einsatzsuche und den Import gemeinsam verwendeter Kartenmodule ohne serverseitigen SQLiteprovider.
- Sechs tatsächliche Deutschland-CLI-Prozesstests prüfen Wiederherstellung und Migrationsvorschau: falsche oder fehlende Geodatenkennungen werden vor Änderungen zurückgewiesen; die Ziel-Datenbank bleibt bytegleich. Eine passende Sicherung stellt den gesicherten Stand wieder her und widerruft Sitzungen. Eine passende Vorschau erhält Daten und Sitzungen unverändert.
- Kartenstore- und Starttests prüfen DEM-/Manifestbindung, begrenzte BLOB-Ladung, fehlerhafte Pfade, separate Datenordner, fremdes Startverzeichnis, vorzeitigen Kindprozessabbruch, IPC-Stopp und Schutz umgeleiteter Buildordner.
- Der Python-DEM-Satz enthält sieben erfolgreiche Tests. Der XML-/OSM-Indeximport wurde zusätzlich mit einer kleinen bekannten Topologie geprüft.
- Der abschließende lokale Vitest-Lauf bestand **263 Tests**, bei einem ausdrücklich Linux vorbehaltenen Symlink-Skip, in 38 Dateien und 46,62 Sekunden. `tests/amp-autostart.test.ts` wurde in diesem Windows-Lauf explizit ausgenommen: Sein Linux-SIGTERM-Fall war im vorherigen Gesamtlauf unter Windows fehlgeschlagen. Der vorherige Node-Wartungssatz ergab 13 bestandene Fälle, zwei fehlgeschlagene Datei-Symlink-Voraussetzungen (`EPERM`) und einen abgebrochenen Windows-Prozessfall. Die unveränderte vollständige Linux-CI führt beide Sätze einschließlich dieser Fälle aus; lokale Ausnahmen werden nicht als erfolgreiche Linux-Prüfungen ausgegeben.
- Die neuen Ausfallregressionen prüfen automatische Rückfahrt, Klinikübergabe, Reparatur, entfernte Helfer, persistiertes Warten und erneuten Serverstart. 100 Routingversuche während eines nachgewiesenen Dienstausfalls erzeugen nur eine tatsächliche HTTP-Anfrage. Manuelle Aktionen rollen bei fehlendem Fahrweg atomar zurück. Ungültige Routerdaten werden weiterhin als Fehler behandelt.
- Die Browser-Bereitschaftsoptimierung wurde gegen die unveränderten fachlichen Regeln geprüft: fünf Vergleichstests einschließlich 500 Fahrzeugen und 4.500 Personen. Derselbe Client-Snapshot wird einmal indexiert. Zusätzlich ist der korrekte globale Empfänger für natives Browser-fetch durch einen Regressionstest geschützt; ein echter Browserlauf bestätigt sichtbare Anfahrtsangaben.

## Wiederholbare reale Abnahme

Der reguläre Browser-Regressionslauf mit Edge hat 46 Prüfungen bestanden (44 Funktionsabläufe und zwei getrennte Lastprüfungen, 643.379 ms, keine übersprungenen oder wiederholt benötigten Fälle). Die zwei neuen Deutschland-Steuerungsfälle verwenden dabei ausdrücklich leere Testkacheln; der übrige Satz schützt den bestehenden Rivermere-Betrieb. Die vollständige CI wiederholt die Browserprüfungen mit Chromium und Firefox am veröffentlichten Commit.

Die zusätzliche **echte Deutschland-Abnahme mit Edge** lief erfolgreich gegen den vollständigen lokalen Datenbestand und den Produktionsclient. Sie lud tatsächlich Vektor- und DEM-Kacheln, fand Berlin und Schierke und prüfte Übersicht, Region, Dorf und Straßendetail. Der Spielablauf umfasste Notrufannahme und Fragen, freie Disposition, Alarmierung, sichtbare Fahrstrecke/ETA, FMS 3, Server-/Providerneustart mit identischer Route, Lagemeldung, Nachforderung, Abschluss und persistente Historie. Zwei Browseransichten derselben Leitstelle sahen denselben Einsatz und FMS-Stand, während ihre Kameras unabhängig blieben. Ein weiterer Wachbau wurde per authentifizierter Standortprüfung und tatsächlichem Kartenklick durchgeführt. Es gab keine JavaScript- oder Geodaten-HTTP-Fehler.

Geprüfte Auflösungen: **1920 × 1080, 1366 × 768, 2560 × 1440 und 3440 × 1440**. Die wirklichen MapLibre-Ansichtsgrenzen mussten die gesamte Deutschlandregion enthalten; ein vorab gefundener Zuschnitt durch zu enge Kameragrenzen ist damit durch die Abnahme geschützt. Lokaler Nachweis: `.tools/screenshots/deutschland/acceptance.json` und elf tatsächlich erzeugte Bildschirmaufnahmen.

Nach der vollständigen Datenaufbereitung mit laufendem lokalem Router:

```sh
node scripts/geodata/verify.mjs
node scripts/geodata/browser-check.mjs
```

Die Browserprüfung benötigt die Entwicklungsabhängigkeiten und einen installierten Playwright-Browser. Unter Windows wählt `PW_EDGE=1` das vorhandene Edge. `LV_BROWSER=firefox` wählt Firefox. Das Skript erstellt ausschließlich einen isolierten temporären Testspielstand und protokolliert dessen Pfad. Es prüft Hauptmenü, Deutschlandübersicht, reale Suche, Regions-/Dorf-/Straßenzoom, Notruf, Disposition, Fahrt/FMS, Serverneustart, Lagemeldung, Nachforderung, Abschluss, Historie und tatsächlichen Wachbau. Aufnahmen und Ergebnisdatei werden unter `.tools/screenshots/deutschland` gespeichert. Die Testuhr wird ausschließlich durch den Testtreiber vorangestellt; im Produkt gibt es keine Tempoänderung.

## Große Leitstelle und tatsächlicher Programmeinstieg

Die gesonderte Lastprüfung lief ohne Profiler mit **20 Wachen, 500 HLF, 4.500 Personen und 100 tatsächlich fahrenden Fahrzeugen**. Alle fünf Phasen wurden abgeschlossen. In Übersicht und Stadtansicht lagen die längsten rAF-Abstände bei 66,7 beziehungsweise 84,7 ms; in Schwenk-, Straßen- und Zoomphase blieben drei einzelne Ausreißer über 100 ms (103,0/121,2/115,2 ms). Das Ergebnis ist deshalb ausdrücklich `measured-with-findings`. Der Server benötigte rund 740 MiB RSS zusätzlich zum getrennten Router; Simulationsschritte lagen bei p95 463–629 ms. Folge-Snapshots enthielten bei diesem künstlich großen Personalbestand im Median weiterhin 2,756 MB unkomprimierte Anwendungsdaten. [Vollständige Messmethode, Hardware, Vorher/Nachher und Grenzen](DEUTSCHLAND-LASTPRUEFUNG.md).

`node scripts/geodata/test-start.mjs` startete den tatsächlichen Deutschland-Einstieg mit eigenem GraphHopper und Spielserver in **2.745 ms**. HTTP-Health, öffentliches Manifest und die neu erstellte SQLite bestätigten Welt `germany-1`, Schemaversion 12 und den passenden Datensatz. IPC-Shutdown dauerte **116 ms**, endete mit Exit 0, entfernte die Serversperre und gab alle drei Ports frei. Launcher, Java und Spielserver waren anschließend beendet; die SQLite-Integritätsprüfung war erfolgreich. Dieser Lauf verwendete neue isolierte Daten. Er ersetzt keine Prüfung der privaten AMP-Portzuordnung oder des dortigen Reverse Proxy.

## Bildschirmaufnahmen und CI-Provenienz

- [Hauptmenü auf echter Berlin-Karte](screenshots/deutschland/hauptmenue.png)
- [Vollständige Deutschlandübersicht](screenshots/deutschland/deutschland.png)
- [Schierke und Harz](screenshots/deutschland/harz.png)
- [Straßendetail](screenshots/deutschland/strassendetail.png)
- [Einsatz, reale Anfahrt und HUD](screenshots/deutschland/einsatz.png)
- [HUD bei 3440 × 1440](screenshots/deutschland/ultrawide.png)

Der tatsächliche Commit und seine vollständigen Linux- und Browserergebnisse sind über [GitHub Actions](https://github.com/Philipp284868/Leitstellen-Verbund/actions/workflows/ci.yml) prüfbar. Die CI erzeugt zusätzlich ein zweimal bytegleich gepacktes Linux-Runtime-Artefakt und führt dessen Startprüfung aus. Nur ein erfolgreicher Lauf des jeweiligen Commits gilt als CI-Nachweis; ein lokaler Build oder dieses Dokument allein ersetzt ihn nicht. Große Deutschland-Geodaten bleiben außerhalb des Git-Repositorys und des Programmarchivs. Quellen, Fingerprints und die reproduzierbare Datenpipeline sind separat dokumentiert.
