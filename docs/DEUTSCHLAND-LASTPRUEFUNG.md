# Wiederholbare Lastprüfung mit echten Deutschlanddaten

`scripts/geodata/browser-load-check.mjs` startet eine eigene, lokale Testinstanz
und einen Browser mit 1920 × 1080 Pixeln. Die Testinstanz verwendet ausschließlich
eine neu erzeugte SQLite im temporären Verzeichnis. Ein bestehendes `DATA_DIR`
wird nicht als Spielstand geöffnet. Der vollständige Deutschlandindex, die
Vektorkacheln, das Copernicus-Höhenmodell und ein bereits laufender lokaler
GraphHopper werden dagegen tatsächlich verwendet. Es gibt keinen Ersatzrouter
und keine leere Testkarte.

Die Aufbereitung benötigt einen Quellcode-Checkout mit installierten
Entwicklungsabhängigkeiten und gebautem Deutschlandclient. Das Script ist eine
bewusst gestartete Abnahme, kein automatischer CI-Test und kein Lastangriff auf
eine laufende Produktionsinstanz. Es startet keinen Import und keinen
Routingdienst. Währenddessen sollen keine Geodatenimporte oder andere
Lastprüfungen laufen.

```powershell
$env:GEODATA_DIR = 'D:/Leitstellen/Deutschland-Geodaten'
$env:GRAPHHOPPER_URL = 'http://127.0.0.1:8989'
$env:PW_EDGE = '1'
node scripts/geodata/browser-load-check.mjs
```

Ohne `PW_EDGE` wird das installierte Playwright-Chromium verwendet. Ein eigener
Lauf mit `LV_BROWSER=firefox` verwendet den installierten Playwright-Firefox.
Ein fehlender Browser wird nicht als erfolgreicher Lauf gewertet.
`LV_BENCH_SECONDS` verändert die einzelne Messphase zwischen 5 und 15 Sekunden;
Vorgabe sind 8 Sekunden.
`LV_BENCH_PROFILE=1` ergänzt bei Chromium/Edge ein CDP-CPU-Profil der Stadt- und
Schwenkphase unter `city-and-pan.cpuprofile`. Solche Diagnosewerte werden im
Bericht als Profilinglauf gekennzeichnet. Abschließende Zeitmessungen erfolgen
ohne aktiven Profiler.

## Testbestand und Messablauf

Der getrennte Node-Prozess aus `tests/helpers/germany-load-server.ts` erstellt
eine ausdrücklich künstliche, fortgeschrittene Testleitstelle mit regulären
Domänenaktionen:

- 20 auf realen Berliner Straßenstandorten gebaute und auf Stufe 8 erweiterte
  Feuerwachen.
- 500 regulär gekaufte HLF; fertige Wachen stellen qualifizierte Besatzungen automatisch.
- Zwölf vorbereitete, regulär angenommene und abgefragte Einsätze. Die Generatorwahl wird separat geprüft.
- 100 einzeln alarmierte Fahrzeuge mit tatsächlichen GraphHopper-Fahrwegen,
  Fahrprofilen und FMS-Statuswechseln. Jede aktive Route muss mindestens drei
  Punkte und Abschnitte aus dem geprüften deutschen Datensatz enthalten.

Die Vorbereitungsphase kann den Aufbau zeitlich vorspulen. Die anschließende
Browsermessung verwendet ausschließlich den normalen Ein-Sekunden-Takt des
Servers. Zu Beginn und nach jeder Messphase müssen weiterhin alle 100 Fahrzeuge
aktiv fahren. Geschlossene oder zu kurze Routen brechen die Prüfung ab, statt
eine andere Route oder längere Fahrtdauer zu erfinden.

Der Browser misst Deutschlandübersicht, Berliner Stadtansicht mit ausgewählten
Fahrtrouten, Schwenken, Straßendetail und kombinierte Zoom-/Tastatureingaben.
Jede Phase erzeugt einen Screenshot der tatsächlich angezeigten Karte. Es werden
erfolgreiche Vektor- **und** Höhenkachelanfragen vorausgesetzt.

## Tatsächlich erhobene Messwerte

- Dauer der realen `Game.step`, `Game.view` und `RouteSnapshotEncoder.encode`
  Aufrufe im getrennten Serverprozess; keine künstliche Schleife als Ersatz für
  den laufenden Server.
- Server-RAM, Event-Loop-Auslastung und Event-Loop-Verzögerung.
- Abstände realer `requestAnimationFrame`-Callbacks mit Mittelwert, Median,
  p95, p99 und Maximum je Phase; zusätzlich verfügbare Long-Task-Ereignisse und
  Anzahl/Summe der Framepausen über 50 beziehungsweise 100 ms. Ein kleiner
  p95-Wert darf einzelne regelmäßige Ruckler nicht verdecken.
- Zeit zwischen einer vertrauenswürdigen Karteneingabe und der nächsten rAF mit
  tatsächlich veränderter Kameraposition. Das ist ein reproduzierbarer
  Eingabe-/Kamerawert, keine Messung der physischen Monitorlatenz.
- Tatsächlich empfangene Socket.IO-Snapshotframes und deren Routendeltas.
  Gemessen werden UTF-8-Anwendungsbytes nach WebSocket-Dekomprimierung. Diese
  Werte sind keine komprimierten TCP-/TLS-Leitungsbytes.
- Tatsächliche DOM-Marker, davon sichtbar im Browserfenster, Fahrzeugmarker,
  Kamera und Anzahl der serverseitig fahrenden Fahrzeuge. Die Karte darf
  überlappende Objekte bei kleinen Zoomstufen weiterhin gruppieren.
- Browser-/GPU-Informationen, CPU und RAM der verwendeten Maschine, geprüfte
  Fingerprints der Vektor- und Höhendaten sowie der ausdrücklich temporäre
  Testdatenpfad.

Ergebnisse liegen je Lauf unter
`.tools/screenshots/deutschland-last-<Zeitstempel>/`: `browser-load.json`,
`server-load.json`, `server.log` und fünf Screenshots. Die temporäre SQLite wird
als nachvollziehbarer Testbestand behalten. Das Script beendet nur seinen
eigenen Node-Prozess und Browser; der bereitgestellte GraphHopper bleibt laufen.

Die Berichtsschwellen einzelne Framepausen > 100 ms, p95 > 34 ms für Frameabstände, p95 > 100 ms für
Eingabe/Kamera und p95 > 1000 ms für einen Simulationsschritt markieren konkrete
Auffälligkeiten. Sie ersetzen keine Bewertung der Messmaschine und sind kein
pauschales Leistungsversprechen. Der Status `measured-with-findings` bedeutet,
dass die funktionale Lastprüfung ausgeführt wurde und Auffälligkeiten gemessen
wurden; `failed` bedeutet eine unvollständige oder fehlgeschlagene Prüfung.

## Historischer Vergleichslauf vom 9. September 2026

Der neue Deutschland-only-Lauf vom 10.09.2026 ist in der [aktuellen Abnahme einschließlich gemessener Leistungsgrenzen](ABNAHME-DEUTSCHLAND-ONLY.md#grenzen-des-zusätzlichen-extremtests) dokumentiert. Er verwendet zwölf vorbereitete Einsätze, automatische Besetzung und vorab bestätigte reale Verbindungen auf einem größeren Berliner Wachenring. Die folgenden Werte bleiben der ausdrücklich ältere Vergleichsstand.

Die reale Messung `deutschland-last-1788909022429` wurde ohne CPU-Profiler auf
Windows mit Node 24.19.0, Edge 152.0.4191.66, Intel Core i7-13700K,
32 GiB RAM und NVIDIA GeForce RTX 4060 Ti (Direct3D11) ausgeführt. Der Viewport
betrug 1920 × 1080 bei Gerätefaktor 1. Alle fünf Phasen enthielten weiterhin
500 eigene Fahrzeuge, davon 100 tatsächlich auf realen Straßen fahrend. Der
Router war lokal; daraus folgt keine Aussage über eine langsame Internetverbindung
oder eine kleinere AMP-Maschine.

| Messphase                     | rAF p95 / p99 | Größte Framepause | Pausen über 100 ms | Eingabe/Kamera p95          | Sichtbare Marker / Fahrzeugmarker |
| ----------------------------- | ------------- | ----------------- | ------------------ | --------------------------- | --------------------------------- |
| Deutschlandübersicht          | 6,2 / 12,0 ms | 66,7 ms           | 0                  | keine direkte Karteneingabe | 5 / 2                             |
| Berlin und ausgewählte Routen | 6,2 / 12,2 ms | 84,7 ms           | 0                  | keine direkte Karteneingabe | 52 / 30                           |
| Schwenken                     | 6,2 / 12,4 ms | 103,0 ms          | 1                  | 24,6 ms                     | 39 / 24                           |
| Straßendetail                 | 6,2 / 24,2 ms | 121,2 ms          | 1                  | 11,5 ms                     | 25 / 24                           |
| Zoom und Tastatureingaben     | 6,2 / 12,1 ms | 115,2 ms          | 1                  | 16,9 ms                     | 6 / 2                             |

Fahrzeugmarker sind je nach Zoom Gruppen; die niedrigere Markerzahl bedeutet
keinen Verlust der übrigen Fahrzeuge. Die tatsächlichen MapLibre-Grenzen der
Übersicht umfassten die gesamte Datenregion `[5.5, 47.1, 15.6, 55.2]`. Die
Berliner Stadtphase prüfte zusätzlich die geografische Lage und Zoomstufe 11;
die Straßendetailphase prüfte Zoomstufe 16. Es gab keine JavaScriptfehler und
keine fehlgeschlagenen Geodatenantworten.

Die p95-Kosten des separaten Node-Spielservers lagen je Phase bei
463–629 ms für `Game.step`, 287–340 ms für `Game.view` und 68–82 ms für die
Routencodierung. Sein am Ende gemessener RSS betrug 776.458.240 Bytes
(rund 740 MiB); der getrennte GraphHopper-Prozess ist darin nicht enthalten.
Pro Phase wurden neun tatsächliche Serveraufrufe erfasst. Das ist eine kurze
Lastprobe und kein mehrstündiger Stabilitätstest.

Das erste empfangene Snapshot umfasste 18.919.113 unkomprimierte Anwendungsbytes,
davon 16.163.404 Routendaten. Bei 46 Folgeframes lag der Median bei
2.755.744 Bytes. In 27 dieser Frames wurde keine unveränderte Routengeometrie
erneut übertragen; der Median des Routenobjekts war daher 2 Bytes (`{}`).
Die vorhandene Routensynchronisation funktioniert, während der übrige
Personal-/Spielstandsanteil bei diesem großen Testbestand weiterhin erheblich
ist. Es wurden keine niedrigeren komprimierten Leitungsbytes behauptet.

Das Ergebnis lautet ausdrücklich **`measured-with-findings`**: Der vollständige
Lastablauf wurde ausgeführt, jedoch bleiben drei einzelne Framepausen über
100 ms und regelmäßige kürzere Pausen über 50 ms messbar. Der kleine p95-Wert
allein rechtfertigt keine Behauptung einer stets ruckelfreien Darstellung.

Ein vorgeschalteter CPU-Profillauf
`deutschland-last-1788908675569/city-and-pan.cpuprofile` zeigte den wiederholten
Scan aller 4500 Personen für die Bereitschaft der 500 Dispositionsfahrzeuge
als wesentliche Ursache der damaligen regelmäßigen Pausen um 200 ms. Der
Client verwendet jetzt einen Index je unverändertem Server-Snapshot und
wendet darauf dieselben Bereitschaftsregeln an. Fünf fachliche Vergleichstests
prüfen Besatzung, Ausbildung, FMS, Reserven, Abwesenheiten, Schichten und
Snapshotwechsel. Der 500/4500-Test weist weniger als 20.000 Personalzugriffe
für den ersten vollständigen Aufruf und keine weiteren beim Wiederverwenden
desselben Index nach. Simulationsentscheidungen und Freigaben bleiben auf dem
Server.

| Phase                | Größte Pause im vorgeschalteten Diagnoselauf | Größte Pause nach Clientkorrektur | Anzahl >100 ms vorher → nachher |
| -------------------- | -------------------------------------------- | --------------------------------- | ------------------------------- |
| Deutschlandübersicht | 533,3 ms                                     | 66,7 ms                           | 1 → 0                           |
| Berlin und Routen    | 266,7 ms                                     | 84,7 ms                           | 10 → 0                          |
| Schwenken            | 212,1 ms                                     | 103,0 ms                          | 8 → 1                           |
| Straßendetail        | 254,5 ms                                     | 121,2 ms                          | 8 → 1                           |
| Zoom/Tastatur        | 200,0 ms                                     | 115,2 ms                          | 9 → 1                           |

Dieser Vergleich zeigt die tatsächlich beobachteten Läufe. Er ist kein
kontrollierter Prozent-Beschleunigungsbenchmark: Im vorgeschalteten Lauf war
während Berlin/Schwenken der CPU-Profiler aktiv; außerdem wurde vor dem
abschließenden Lauf ein Browser-Fetch-Aufruffehler behoben. Die abschließende
Messung nutzte die funktionierenden echten Anfahrtsabfragen und keinen Profiler.

Die lokalen, nicht in Git eingecheckten Nachweisdateien liegen im Checkout:

- `.tools/screenshots/deutschland-last-1788909022429/browser-load.json`
- `.tools/screenshots/deutschland-last-1788909022429/server-load.json`
- `.tools/screenshots/deutschland-last-1788909022429/01-deutschland.png`
- `.tools/screenshots/deutschland-last-1788909022429/02-stadt-und-routen.png`
- `.tools/screenshots/deutschland-last-1788909022429/03-schwenken.png`
- `.tools/screenshots/deutschland-last-1788909022429/04-strassendetail.png`
- `.tools/screenshots/deutschland-last-1788909022429/05-zoom-und-eingaben.png`
- `.tools/screenshots/deutschland-last-1788908675569/city-and-pan.cpuprofile`
- `.tools/screenshots/deutschland-last-1788908675569/cpu-summary.json`

## Überprüfter Anker-Cache des Servers

Ein zusätzlicher schreibgeschützter Vergleich am tatsächlichen 500/4500-
Testspielstand prüfte, ob ein größerer Standortcache die verbleibenden
`Game.view`-Kosten senkt. Für die 9000 Wohn-/Arbeitsortreferenzen lagen
1280 unterschiedliche Personalanker vor. Beide Cachevarianten lieferten
hashgleiche View-Inhalte; die SQLite-Datei war vor und nach der Prüfung
SHA256-gleich.

| Messung                                   | Grenze 4096    | Grenze 16384   |
| ----------------------------------------- | -------------- | -------------- |
| Anker-SQL-Abfragen im ersten View         | 1280           | 1280           |
| Anker-SQL-Abfragen in vier weiteren Views | jeweils 0      | jeweils 0      |
| Tatsächlich belegte Cacheeinträge         | 1978           | 1978           |
| Erster View                               | 342,4 ms       | 343,3 ms       |
| Weitere Views                             | 239,0–261,3 ms | 238,4–287,5 ms |

Die größere Grenze brachte in diesem Bestand keinen gemessenen Nutzen. Der
Produktionscache bleibt daher bei 4096 Einträgen. Der Nachweis liegt unter
`.tools/germany-anchor-cache-audit.json`; die vorhandenen View-Kosten dürfen
nicht pauschal als Cachemisses oder zusätzliche SQL-Zugriffe erklärt werden.
