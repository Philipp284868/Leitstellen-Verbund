# Deutschland: reale, lokal betriebene Geodaten

Die Deutschlandwelt verwendet einen fest versionierten OpenStreetMap-Auszug. Darstellung, Straßensuche, Standorte und Routing werden aus **derselben PBF-Datei** aufgebaut. Kartenkacheln und Routingantworten kommen im Spielbetrieb vom eigenen Server. Ein Konto bei einem Kartenanbieter, ein öffentlicher Routingdienst oder ein kostenpflichtiger API-Schlüssel werden dafür nicht benötigt.

## Quellen und Lizenzen

| Quelle                                                                                          | Verwendung                                                                                         | Lizenz und Genauigkeit                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Geofabrik Deutschland, Snapshot 07.09.2026](https://download.geofabrik.de/europe/germany.html) | OSM-Straßen, Orte, Gebäude, Wasser, Landnutzung, Grenzen; gemeinsame Quelle für Karten und Routing | [ODbL 1.0 / © OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Von Freiwilligen gepflegt; keine Garantie vollständiger Adressen oder aktueller Verkehrsbeschränkungen. |
| [OpenMapTiles](https://openmaptiles.org/)                                                       | Schema und kartografische Aufbereitung der Vektorkacheln                                           | Sichtbar **© OpenMapTiles** angeben. Quell- und Profilhinweise des [Planetiler-Projekts](https://github.com/onthegomap/planetiler#license-and-attribution) beachten.                        |
| [OSM Water Polygons](https://osmdata.openstreetmap.de/data/water-polygons.html)                 | Zusammengefügte Küsten-/Ozeanflächen des Kachelprofils                                             | ODbL, OSM-Attribution; zusätzlicher vorgenerierter Datensatz mit eigenem Cache.                                                                                                              |
| [OSM Lake Labels, Version 12](https://github.com/acalcutt/osm-lakelines)                        | Mittellinien für lesbare Beschriftung realer Seen                                                  | Aus OSM-Seeflächen abgeleitet; OSM-Attribution. Das Aufbereitungswerkzeug steht unter MIT.                                                                                                   |
| [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/)                           | Vereinfachte Flächen und Orientierung bei kleinen Zoomstufen                                       | Public Domain. Diese Übersichtsdaten ersetzen keine detaillierten OSM-Straßen.                                                                                                               |

Die sichtbare Karte zeigt jederzeit die Attribution. Bei Weitergabe der abgeleiteten Geodaten gelten die Bedingungen der jeweiligen Datenlizenz. Personenbezogene Konten, Besitz und Spielstände bleiben in der separaten Spieldatenbank. Die Geofabrik-Auszüge enthalten keine OSM-Benutzernamen und Changeset-Metadaten.

Werkzeuge: Temurin JDK **21.0.12.1+1**, GraphHopper **11.0** (Apache 2.0), Planetiler **0.10.2** (Apache 2.0). Die ausführbaren Downloads werden gegen fest eingetragene SHA-256-Werte geprüft. Die PBF-Datei hat **4.834.386.028 Bytes** und den veröffentlichten MD5-Wert `682200b08861c25d97ebcd7765509830`; zusätzlich wird nach dem Download SHA-256 berechnet, im Quellenmanifest gespeichert und als Datensatzkennung verwendet.

## Speicher und Aufbau

Für eine normale Neuinstallation ist kein eigener Import mehr nötig: `node scripts/install-germany.mjs` lädt den geprüften Laufzeitbestand aus dem [festen GitHub-Datenrelease](https://github.com/Philipp284868/Leitstellen-Verbund/releases/tag/germany-data-2026-09-07-v1). Der im Repository gespeicherte `scripts/geodata/download-manifest.json` bindet 77 gzip-Teile mit 7.978.019.052 Byte an 22 fertige Dateien mit 15.610.887.178 Byte. Jede Teil- und Dateiprüfsumme wird kontrolliert; ein unvollständiger Download wird nicht als Karte veröffentlicht. Der Installer kopiert weder Rohimporte noch Spielstände. [AMP-Neuinstallation](https://github.com/Philipp284868/Leitstellen-Verbund/blob/8940407e97361c978cd95125922849c97dda9b19/docs/AMP-NEUINSTALLATION.md). Die folgenden Importbefehle dienen dem nachvollziehbaren eigenen Wiederaufbau des Datensatzes.

`GEODATA_DIR` muss außerhalb des Programmordners liegen. Standard für die lokale Entwicklung:

```text
outputs/
  leitstellen-verbund/                 Programm und Quellcode
  leitstellen-deutschland-geodata/     Große, wiederverwendbare Geodaten
    sources/germany-260907.osm.pbf
    tools/                            Portable JVM und gepinnte JARs
    graph-cache/                      Vorberechneter Routinggraph
    graphhopper.yml                   Bindet ausschließlich Loopback
    maps.mbtiles                      OpenMapTiles-Vektorkacheln
    index.sqlite                      Räumlicher Orts-/Straßen-/Adressindex
    source-manifest.json              Quellen und Werkzeugprüfsummen
    manifest.json                     Nur nach vollständiger Fertigstellung
    logs/                             Import-, Kachel- und Routingprotokolle
```

Die Werkzeuge laufen unter Windows und Linux x64. Ein global installiertes Java, WSL oder Docker ist nicht erforderlich. Planetiler benötigt Java 21; die gepinnte GraphHopper-Version 11.0 unterstützt Java ab 17. Die abweichende Java-Anforderung des GraphHopper-Entwicklungszweigs darf nicht auf Version 11.0 übertragen werden.

Für den vollständigen Build ausreichend SSD-Platz einplanen: Die PBF allein benötigt etwa 4,8 GB, dazu kommen Kacheln, Routinggraph, Suchindex, rund 1,5 GB Kartenzusatzquellen und temporäre Daten. Planetiler nennt als Orientierung mindestens 1 GB plus das Fünf- bis Zehnfache der PBF-Größe für seinen Buildbereich. Mehrere große JVM-Importe nacheinander starten; die Skripte verwenden 12 GB Heap für GraphHopper und je 8 GB für Index/Kacheln. Neben dem Java-Heap benötigen Betriebssystem, SQLite und Speicherabbildungen zusätzlichen RAM. Auf einem 32-GB-PC mit laufenden Desktopanwendungen dürfen diese Importe nicht parallel laufen. Ein fertiges Paket und dessen Backups benötigen zusätzliche Kapazität. Die tatsächliche Größe und Dauer werden beim vollständigen Lauf gemessen.

## Daten vorbereiten

Im Programmverzeichnis mit Node.js 24 ausführen. Bei abweichendem Speicherort `GEODATA_DIR` vorher als Umgebungsvariable setzen.

```sh
node scripts/geodata/pipeline.mjs prepare
node scripts/geodata/pipeline.mjs graph
node scripts/geodata/pipeline.mjs index
node scripts/geodata/pipeline.mjs tiles
```

Nach diesen drei Importen den vorbereiteten Router in einem zweiten Terminal mit `node scripts/geodata/pipeline.mjs serve` starten. Im ersten Terminal anschließend `node scripts/geodata/pipeline.mjs finalize` ausführen. Die Freigabe prüft damit auch den tatsächlich laufenden lokalen Graphen.

`prepare` lädt ausschließlich die festgelegten Quellen/Werkzeuge. Unterbrochene Downloads bleiben als `.partial` erhalten und werden, sofern der Anbieter Range-Anfragen unterstützt, fortgesetzt. Fertige Dateien werden anhand ihrer Prüfsummen wiederverwendet. Veränderte fertige Quelldateien werden nicht stillschweigend überschrieben. Auch die Karten-Zusatzquellen besitzen feste SHA-256-Werte; `tiles` prüft sie vor dem Offline-Build. Ändert ein Anbieter eine Quelle unter derselben Downloadadresse, bricht die Prüfung ab. Ein geprüftes Quellenarchiv bleibt deshalb Bestandteil des wiederverwendbaren Datenpakets.

`graph` importiert die vollständige PBF. `index` liest sie in drei gezielten Streams (Relationsgrenze, Wege, Knoten), damit nicht alle OSM-Knoten im JavaScript-Speicher liegen. Die Deutschlandrelation **51477** wird aus ihren wirklichen Außen- und Innenringen zu `boundary.geojson` zusammengesetzt. Außerhalb dieser Staatsgrenze liegende Straßenanker und Suchorte werden entfernt; ein möglicherweise vorhandener Geofabrik-Randpuffer wird damit nicht zum Baugebiet. Fehlende Grenzreferenzen führen zum Abbruch. `tiles` erstellt die Vektorkarte in Zoomstufen 0–14; höhere Darstellungszooms vergrößern die echten Detaildaten. Deutsch und Englisch werden als Kartenlabels übernommen. Für die Orientierung gelten die Anzeigegrenzen `[5.5, 47.1, 15.6, 55.2]` in der Reihenfolge West/Süd/Ost/Nord; die tatsächliche Staatsform und Inseln kommen aus den Geometrien, nicht aus diesem Rechteck.

`finalize` prüft das Vektorkachelformat und die übereinstimmenden `source_sha256`-Kennungen in Karten-/Suchdaten sowie `graph-source.json`, hasht die fertigen Artefakte und veröffentlicht erst dann `manifest.json` mit `status: "ready"`. Die `dataset`-Kennung entspricht dem SHA-256 des PBF-Snapshots: `155596c0041a76f05d3b5fb03a36f2b9e26540b517fde8b4b9884c62c4fc1a90`. Auch die heruntergeladenen Kartenzusatzquellen werden im Quellenmanifest mit SHA-256 dokumentiert. Ein fehlendes fertiges Manifest darf nicht durch eine Fantasiekarte oder öffentliche Ersatzdienste überspielt werden.

Zusätzlich enthält das Manifest `graphRuntimeIdentity` aus dem eigenen `/info`-Endpunkt: Version, Import-/Quelldatum, Graphgrenzen, Profile, Höhenflag und verfügbare Routendetails. Import- und Quelldatum müssen zu `graph-cache/properties.txt` passen. Der Spielstart vergleicht diese Identität mit dem erreichbaren Routingdienst. Vollständige OSM-Fährrelationen können Graphgrenzen bis in Nachbarländer erweitern; diese Grenzen dürfen nicht fälschlich mit dem deutschen Baugebiet gleichgesetzt werden.

Bestehende `maps.mbtiles` und `index.sqlite` werden nicht überschrieben. Ein neuer OSM-Snapshot wird in einem neuen Geodatenordner erzeugt und separat geprüft. Große Quellen und fertige Geodaten gehören weder in Git noch in das normale Anwendungspaket.

## Routing im Betrieb

```sh
node scripts/geodata/pipeline.mjs serve
```

Der lokale GraphHopper-Prozess bindet `127.0.0.1:8989`; sein Verwaltungsport bindet `127.0.0.1:8990`. Beide Ports bleiben intern. Im Spielserver gelten:

```dotenv
GEODATA_DIR=/dauerhafter/pfad/leitstellen-deutschland-geodata
GRAPHHOPPER_URL=http://127.0.0.1:8989
```

Die Groß-/Kleinschreibung von `GRAPHHOPPER_URL` beachten. Das geographische Datenverzeichnis ist **nicht** `DATA_DIR` für Konten und Spielstände. Beide Verzeichnisse benötigen in Containern dauerhafte Einbindungen. Der Routingprozess benötigt die JVM auch zur Laufzeit und wird durch den Dienstmanager/AMP als eigener interner Prozess gestartet; es wird keine öffentliche Routing-API aufgerufen. `serve` erwartet einen bereits importierten Graphen und startet keinen absichtlichen Neuimport bei jedem Spielstart.

Das Profil verarbeitet Einbahnstraßen, Fahrzeugzugang und Abbiegebeschränkungen. `turn_costs.vehicle_types` ist ausdrücklich auf `motorcar, motor_vehicle` gesetzt. `distance_influence: 0` wird bereits vor der Landmark-Vorbereitung gesetzt, damit die Basis-Car-Route Fahrzeit minimiert; die abweichende Distanzgewichtung des Standardprofils wird nicht übernommen. Die unvereinfachte Straßengeometrie bleibt im Graphen erhalten. Anfragen verwenden die16 vorbereiteten Landmarken. Die Simulation berechnet individuelle Fahrzeiten anschließend abschnittsweise aus Straßen-/Fahrzeuglimits und gespeicherten Abbiegewartezeiten. Die gewählte Straßenfolge ist die allgemeine Car-Route, keine zusätzlich global optimierte Route für jede einzelne Fahrzeughöchstgeschwindigkeit. Dynamische Geschwindigkeitsmodelle während der Suche erwiesen sich auf langen Deutschlandstrecken als zu langsam für den laufenden Simulationsserver. Der Import entfernt kleine Inselnetze nicht anhand der üblichen Mindestgröße; unverbundene Inseln bleiben unverbunden. Inseln ohne verfügbare Straßenverbindung dürfen kein Luftlinien-Routing erhalten.

Routinganfragen der Simulation verwenden echte Straßengeometrie und Detailintervalle, insbesondere `edge_id`, `average_speed`, `time`, `max_speed`, `road_class`, `street_name`. Beispiel einer Anfrage an den **lokalen** Dienst:

```json
{
  "points": [
    [13.405, 52.52],
    [13.39, 52.51]
  ],
  "profile": "car",
  "points_encoded": false,
  "instructions": false,
  "way_point_max_distance": 0,
  "details": [
    "edge_id",
    "average_speed",
    "car_average_speed",
    "time",
    "max_speed",
    "road_class",
    "street_name"
  ],
  "ch.disable": true,
  "lm.active_landmarks": 16
}
```

Koordinaten in JSON sind `[Längengrad, Breitengrad]`; GraphHoppers GET-Parameter können eine andere Reihenfolge haben. Rückgabezeiten sind Millisekunden, Distanzen Meter. Segmentzeiten und Wegpunkte müssen gemeinsam in der Fahrt gespeichert werden. `/nearest` allein bestätigt keinen für das Fahrzeug befahrbaren Straßenanschluss; die Route und ihre tatsächlichen `snapped_waypoints` müssen den Anschluss bestätigen. Karte, Suche und Simulation dürfen bei unbekannten/unverbundenen Standorten nicht auf Luftlinien ausweichen.

Der Deutschlandauszug enthält keinen vollständigen Straßenbestand aller Nachbarländer. Grenzüberschreitende Umwege außerhalb seines Randbereichs sowie Verbindungen zu Inseln ohne befahrbare Straßen-/Fährverbindung können deshalb nicht berechnet werden. Das ist als fehlende Route zu behandeln. Das Car-Profil berücksichtigt keine fahrzeugspezifischen Lkw-Abmessungen oder Achslasten; Geschwindigkeitslimits der Simulation ersetzen keine solche zusätzliche Profilierung.

## Schnittstellen des Suchindex

`index.sqlite` wird nach Fertigstellung schreibgeschützt geöffnet:

```sql
anchors(id INTEGER PRIMARY KEY, lon REAL, lat REAL, name TEXT,
        road_class TEXT, bridge INTEGER, tunnel INTEGER, access TEXT)
anchors_rtree(id, min_lon, max_lon, min_lat, max_lat)
places(id INTEGER PRIMARY KEY, osm_type TEXT, osm_id TEXT, kind TEXT,
       name TEXT, display_name TEXT, lon REAL, lat REAL, region TEXT)
places_rtree(id, min_lon, max_lon, min_lat, max_lat)
places_fts(name, display_name) -- external content: places; rowid = places.id
metadata(key TEXT PRIMARY KEY, value TEXT)
```

Anker-IDs sind echte OSM-Knoten-IDs. Erster, mittlerer und letzter Knoten motorisch grundsätzlich nutzbarer Straßen werden übernommen; `footway` und explizit private/verbotene Wege werden nicht zu Bauankern. Brücken- und Tunnelattribute bleiben erhalten, um Bauten auf solchen Abschnitten abzulehnen. Treffen normale Straßen und Brücken an einem OSM-Knoten zusammen, wird für den Anker die normale Straße bevorzugt. Die eigentliche Fahrberechtigung wird zusätzlich im Routingprofil geprüft.

Die Ortsarten sind OSM-Tagwerte: `city`, `town`, `village`, `hamlet`, `suburb`, `quarter`, `neighbourhood`, `locality`, `island`, `state`, `county`; zusätzlich `street`, `address`, `hospital`, `clinic`, `fire_station`, `police` und `peak`. Adressen werden nur übernommen, wenn die betreffenden OSM-Tags existieren. Adress-/POI-Flächen erhalten die Koordinate ihres ersten tatsächlichen Randknotens, keinen erfundenen Eingang. `region` stammt aus vorhandenen `addr:city`-/`addr:state`-Tags und kann leer sein; eine vollständige Verwaltungszuordnung darf daraus nicht behauptet werden.

Straßen können aus mehreren OSM-Wegen bestehen; die Suche darf nahe, gleichnamige Treffer zusammenfassen. Krankenhäuser bleiben auch dann `kind: hospital`, wenn sie Adresstags besitzen. Der geographische Suchindex enthält öffentliche OSM-Daten, keine fremden Spielerobjekte. Autorisierte Einsätze, Wachen und Fahrzeuge werden separat durch den Spielserver gefiltert.

MBTiles enthält gzip-komprimierte PBF-Kacheln mit TMS-Zeilennummerierung. Für eine XYZ-Anfrage muss der Server `tile_row = 2^z - 1 - y` verwenden und die korrekte Komprimierung ausliefern. `metadata.format` ist `pbf`; das OpenMapTiles-Layerschema gilt für den Kartenstil.

## Übergang und unveränderte Spielstände

Deutschland hat die Welt-ID `germany-1` und eine zusätzliche unveränderliche Datensatzkennung. Rivermere-Koordinaten sind keine Deutschlandkoordinaten. Das Geodatenwerkzeug fasst vorhandene Spielstände, Konten oder Sicherungen nicht an. Ein kontrollierter Weltwechsel benötigt eine separat geprüfte Spielmigration beziehungsweise einen eigenen Spielstand; Fahrzeuge und Gebäude dürfen nicht allein anhand ihrer bisherigen x/y-Zahlen versetzt werden. Bei späteren OSM-Aktualisierungen müssen laufende Fahrten ihre gespeicherte Geometrie behalten, bis die Version sicher gewechselt werden kann.

## Prüfungen und bekannte Grenzen

Der gezielte Importtest wird mit `node scripts/geodata/test-index.mjs` ausgeführt. Er prüft Straßenanker, Zugangsfilter, Brücken, Krankenhäuser mit Adresse, Node-/Way-Adressen, Unicode-Volltextsuche, RTree, territoriale Grenzen und Überschreibschutz. Er ersetzt nicht den vollständigen Deutschland-Build oder reale Routen-/Browsertests. Nach dem kompletten Build und Start des lokalen Routings prüft `node scripts/geodata/verify.mjs` neun reale Städte an ihren tatsächlichen Positionen, Kartenausschnitte in drei Zoomstufen, ländliche Orte, Krankenhäuser und drei lange Straßenrouten mit Geschwindigkeitslimit; das Ergebnis wird in `validation.json` gespeichert. Laufprotokolle liegen im Datenordner unter `logs`.

Für diese kleine Parserfixture genügt `node scripts/geodata/pipeline.mjs tools`: Der Befehl lädt und prüft ausschließlich JDK, GraphHopper und Planetiler. Er lädt weder den Deutschland-PBF noch Kartenzusatzquellen und erzeugt kein fertiges Geodatenmanifest. Das erlaubt einen gecachten CI-Lauf mit `GEODATA_DIR` außerhalb des Repositorys und anschließend `node scripts/geodata/test-index.mjs`.

`node scripts/geodata/test-service.mjs` prüft mit einem bereits importierten Routinggraphen den echten Start, das Car-Profil und das Ende des eigenen Java-Prozesses nach IPC-Stopp. Der Test benötigt einen freien Port 8989 und beendet keinen bereits vorhandenen Dienst. Die Pipeline leitet SIGTERM/SIGINT sowie die plattformübergreifende IPC-Nachricht `{type: "shutdown"}` an ihr eigenes Kind weiter und wartet auf dessen Ende.

`node scripts/geodata/test-start.mjs` prüft den tatsächlichen AMP-Einstieg `scripts/start-germany.mjs` mit dem fertigen Deutschland-Build und Datenpaket. Die Routingports 8989/8990 müssen frei sein; vorhandene Dienste werden nicht beendet. Der Test legt ein neues, isoliertes `DATA_DIR` neben dem Repository an, wählt einen freien Spielport und startet den Launcher ohne ausdrücklich gesetzte Routing-URL. Geprüft werden der eigene Java-Router, `/api/health`, das öffentliche `/geo/manifest`, Welt- und Datensatzkennung in SQLite sowie IPC-Shutdown einschließlich freigegebener Ports, gelöster Serversperre und beendeter eigener Prozesse. Protokoll und Ergebnis liegen in `.tools/germany-launcher.log` und `.tools/germany-launcher-metrics.json`; die isolierten Testdaten bleiben erhalten. `GEODATA_DIR` kann auf ein anderes fertiges Paket außerhalb des Repositorys zeigen.

OSM und das OpenMapTiles-Profil liefern Landschaftsflächen und Gipfelpunkte. Das zusätzliche, inzwischen ebenfalls vollständig erzeugte Copernicus-GLO-90-Paket stellt die Höhenschummerung bereit. Seine 90-Meter-Quelle, Verarbeitung, eigenen Lizenzhinweise und Prüfung sind in [DEUTSCHLAND-HOEHEN.md](DEUTSCHLAND-HOEHEN.md) beschrieben; `dem-manifest.json` bleibt ein separates Manifest. Die Downloadverfügbarkeit und Qualität fremder offener Quellen kann sich ändern; fest gepinnte und geprüfte lokale Dateien bleiben für den Spielbetrieb verwendbar.

## Tatsächlich erzeugtes Deutschlandpaket am 09.09.2026

Der vollständige lokale Build des festgelegten PBF-Snapshots ist beendet. `manifest.json` wurde nach den abschließenden SQLite-Integritätsprüfungen, SHA-256-Berechnungen und dem Vergleich mit dem laufenden GraphHopper atomar veröffentlicht. Die folgenden Größen beziehen sich auf die fertigen Artefakte, ohne Werkzeuge, Quelldownloads oder temporäre Importdateien:

| Artefakt           | Tatsächlicher Inhalt                                                               |         Bytes |
| ------------------ | ---------------------------------------------------------------------------------- | ------------: |
| `maps.mbtiles`     | 264.518 Vektorkacheln, Zoom 0–14                                                   | 3.203.960.832 |
| `index.sqlite`     | 20.645.969 Straßenanker; 24.419.563 Orte, Adressen und Straßenobjekte              | 8.946.647.040 |
| `graph-cache/`     | 17.513.243 Knoten; 20.753.029 Kanten; 191.095 Abbiegekosteneinträge; 16 Landmarken | 2.843.784.967 |
| `boundary.geojson` | Tatsächliche deutsche Staatsgrenze aus OSM-Relation 51477                          |     4.856.067 |
| `dem.mbtiles`      | Separates GLO-90-Paket mit 5.922 Rasterkacheln, Zoom 5–11                          |   611.127.296 |

Indexaufbau: etwa 19 min 55 s. GraphHopper-Import einschließlich Landmark-Vorbereitung: 18 min 26 s. Vektorkachelbuild: 11 min 35 s. Diese lokalen Messwerte sind keine Laufzeitgarantie für andere Hardware; die großen Importe wurden nach gemessenem Speicherdruck seriell abgeschlossen. Angehaltene unvollständige Zwischenstände blieben getrennt erhalten, vollständige Quellen mussten nicht erneut heruntergeladen werden.

Tatsächlich ausgeführt wurden der Java-Importtest, die Cache-/Werkzeugprüfung, ESLint der Geodatenskripte, die vollständigen SQLite-Prüfungen und beide echten Sidecar-Stoppfälle (IPC-Nachricht und unerwartetes IPC-Disconnect). Bei beiden Stoppfällen endeten Listener und eigener Java-Prozess ohne verwaistes Kind. Die nationale Abnahme in `validation.json` weist neun Städte an ihren realen Positionen und je drei vorhandene Zoomstufen nach. Die Fahrtests verwenden separat ausgewiesene, zuvor über den echten GermanyProvider geprüfte OSM-Straßenanker; Ortsmittelpunkte auf Fußgängerplätzen werden nicht als befahrbare Standorte vorausgesetzt.

| Geprüfte Straßenroute | Entfernung | Fahrzeug-ETA bei höchstens 90 km/h | Unvereinfachte Wegpunkte |
| --------------------- | ---------: | ---------------------------------: | -----------------------: |
| Berlin–Hamburg        | 288,490 km |                           12.148 s |                    2.120 |
| Berlin–München        | 583,860 km |                           24.221 s |                    4.881 |
| Köln–Dresden          | 571,743 km |                           23.563 s |                    6.559 |

Die drei Anfragen einschließlich des echten Spieladapters benötigten im dokumentierten Abnahmelauf 124/188/462 ms. Die Fahrzeugzeiten wurden aus denselben gespeicherten Straßenabschnitten berechnet; sie sind von der allgemeinen Car-Zeit im Routingdienst getrennt ausgewiesen. [DEUTSCHLAND-ROUTING.md](DEUTSCHLAND-ROUTING.md) enthält die ergänzende Provider-Abnahme. Browserdarstellung und 500-Fahrzeug-/100-Einsatz-Lastprüfung werden gesondert dokumentiert.

Der vollständige Launcher-Test lief am 09.09.2026 ebenfalls erfolgreich auf Windows mit Node.js 24: eigener GraphHopper und Spielserver nach 2.745 ms bereit, Health und öffentliches Manifest gültig, neue SQLite-Datenbank auf Version 12 mit `germany-1` und identischem PBF-Fingerprint. Der IPC-Stopp endete nach 116 ms mit Exit 0. Spielport sowie beide Routingports waren danach frei, `server.lock` entfernt und alle drei geprüften eigenen Prozesse beendet. Die abschließende SQLite-Integritätsprüfung war erfolgreich. Die Testdaten lagen ausschließlich in einem neu angelegten Verzeichnis; es erfolgte keine Produktionsbereitstellung.
