# Kartensymbole und geografische Einrichtungen

Stand: 09.09.2026. Die vorhandene Deutschlandkarte, ihre echten Koordinaten und das serverseitige Routing bleiben erhalten. Die Überarbeitung ergänzt ein gemeinsames Vektorsystem, auswählbare Bildschirmgruppen und eine geografische Einrichtungsebene. Sie ändert keine Spielkoordinate, keinen Besitz und keine Fahrstrecke.

## Ein Symbolsystem für Karte, Liste und Detail

`src/map-icons.tsx` ist die zentrale Quelle. Alle Fahrzeug- und Gebäudesymbole sind im Repository gezeichnete SVG-Pfade mit einer 32 × 32 großen Zeichenfläche, einheitlicher Strichstärke und runden Konturen. Die Karte verwendet dieselben Pfade wie Fahrzeugliste, Dispositionsauswahl und Fahrzeugdetails. Es werden keine neuen Rasterbilder, Spriteserver oder externen Schrift-/Icon-Dienste geladen.

`VehicleIcon({type})` verwendet eine ausdrückliche Zuordnung für **alle 50 vorhandenen Fahrzeug-IDs**. Die Zuordnung hängt nicht von Fahrzeugnamen oder zufällig passenden Textteilen ab. Neue unbekannte IDs, leere Werte und Namen von Objektprototypen bekommen ein neutrales Dokument-/Objektsymbol. Varianten derselben Fahrzeugklasse teilen ihre Silhouette; der vollständige Funkrufname und Typ bleiben in der Auswahl zugänglich.

| Fahrzeug-ID    | Vorhandener Typ                                            | Zentrales Symbol                             |
| -------------- | ---------------------------------------------------------- | -------------------------------------------- |
| `tsf`          | TSF-W                                                      | `engine`                                     |
| `lf`           | LF 20                                                      | `engine`                                     |
| `hlf`          | HLF 20                                                     | `engine`                                     |
| `tlf`          | TLF 4000                                                   | `tanker`                                     |
| `dlk`          | DLK 23                                                     | `ladder`                                     |
| `elw`          | ELW 1                                                      | `commandVan`                                 |
| `rw`           | RW                                                         | `rescue`                                     |
| `haz`          | GW-Gefahrgut                                               | `hazmat`                                     |
| `air`          | GW-Atemschutz                                              | `breathing`                                  |
| `rtw`          | RTW                                                        | `ambulance`                                  |
| `ktw`          | KTW                                                        | `patientVan`                                 |
| `nef`          | NEF                                                        | `doctorCar`                                  |
| `rth`          | RTH                                                        | `helicopter`                                 |
| `fustw`        | Funkstreifenwagen                                          | `policeCar`                                  |
| `pmtw`         | Polizei-MTW                                                | `policeVan`                                  |
| `gkw`          | GKW                                                        | `technical`                                  |
| `mzgw`         | MzGW                                                       | `technical`                                  |
| `tmtw`         | THW-MTW                                                    | `commandVan`                                 |
| `gww`          | GW-Wasserrettung                                           | `rescue`                                     |
| `boat`         | Zugfahrzeug mit MZB (Deutschland) / Rettungsboot (Bestand) | `boatTrailer (Deutschland) / boat (Bestand)` |
| `lf10`         | LF 10                                                      | `engine`                                     |
| `hlf10`        | HLF 10                                                     | `engine`                                     |
| `tlf2000`      | TLF 2000                                                   | `tanker`                                     |
| `tlf3000`      | TLF 3000                                                   | `tanker`                                     |
| `elw2`         | ELW 2                                                      | `commandVan`                                 |
| `kdow`         | KdoW                                                       | `commandCar`                                 |
| `vrw`          | VRW                                                        | `rescue`                                     |
| `gwl`          | GW-L                                                       | `equipment`                                  |
| `gwmess`       | GW-Mess                                                    | `measurement`                                |
| `gwt`          | GW-T                                                       | `equipment`                                  |
| `abruest`      | WLF mit AB-Rüst                                            | `carrier`                                    |
| `abwasser`     | WLF mit AB-Wasser                                          | `carrier`                                    |
| `abschaum`     | WLF mit AB-Schaum                                          | `carrier`                                    |
| `abatem`       | WLF mit AB-Atemschutz                                      | `carrier`                                    |
| `abgefahrgut`  | WLF mit AB-Gefahrgut                                       | `carrier`                                    |
| `sw`           | Schlauchwagen SW 2000                                      | `equipment`                                  |
| `dekonp`       | Dekon-P                                                    | `decon`                                      |
| `grtw`         | GRTW                                                       | `medicalBus`                                 |
| `naw`          | NAW                                                        | `ambulance`                                  |
| `itw`          | ITW                                                        | `intensive`                                  |
| `ith`          | ITH                                                        | `helicopter`                                 |
| `rtwxl`        | RTW – erweiterte Versorgung                                | `ambulance`                                  |
| `ktwb`         | KTW-B – zwei Transportplätze                               | `patientVan`                                 |
| `mzf`          | MZF Rettungsdienst                                         | `patientVan`                                 |
| `elrd`         | ELRD                                                       | `medicalCommand`                             |
| `orgl`         | OrgL Rettungsdienst                                        | `medicalCommand`                             |
| `lna`          | LNA                                                        | `medicalCommand`                             |
| `segrtw`       | SEG-RTW                                                    | `ambulance`                                  |
| `gwsan`        | GW-San                                                     | `medicalTruck`                               |
| `segbetreuung` | SEG-Betreuung                                              | `supportBus`                                 |

Die fünf AB-IDs stehen weiterhin für die im Spiel angebotene vollständige Trägerkombination. Ein isolierter Abrollbehälter fährt durch das neue Symbolsystem nicht selbst. `boat` zeigt in Deutschland ein Zugfahrzeug mit Bootsanhänger; im bestehenden Rivermere-Betrieb bleibt es ein Wasserfahrzeug. Das Symbolsystem ändert diese Routentypen nicht. Der GW-San hat einen medizinischen Gerätewagenaufbau, keinen normalen RTW-Aufbau.

Die Silhouette bezeichnet die Klasse, die Grundfarbe die Organisation. Eine kleine separate Zahl bezeichnet den tatsächlich gelieferten FMS-Code; eine separate Warnmarke bezeichnet eine Fahrzeugstörung. Freigegebene Verbundobjekte haben einen gestrichelten Rand. Störung und fremder Besitzer ersetzen nicht die Organisationsfarbe. Ein Richtungspfeil eigener fahrender Fahrzeuge folgt der vorhandenen zeitabhängigen Route; stehende Fahrzeuge erhalten keinen erfundenen Richtungspfeil.

Gruppen schneiden keine Fahrzeuge ab. Auch auf Zoom 18 können mehrere Fahrzeuge am identischen Wachpunkt als Gruppe angeklickt und anschließend einzeln mit Typicon, Funkrufname und FMS ausgewählt werden. Eine deckungsgleiche Fahrzeugmarke wird ausschließlich auf dem Bildschirm neben den Wach-/Einsatzanker gesetzt; ein kurzer Strich verbindet sie mit der unveränderten Weltposition. Die Wache bleibt anklickbar. Die frühere versteckte Begrenzung auf 650 Deutschland-Kartenmarker ist entfernt.

## Reale geografische Einrichtungen

Die Daten stammen ausschließlich aus dem installierten, zusammengehörenden `index.sqlite` und `maps.mbtiles`. `/geo/pois/{z}/{x}/{y}.json` liefert passende geografische Ortsdatensätze; im aktuellen sichtbaren Ausschnitt werden zusätzlich echte Merkmale der lokalen Vektorkacheln ausgewertet. Fremde Spielerobjekte werden hierfür weder abgefragt noch freigegeben.

| Filter             | Datenquelle und akzeptierte Merkmale                                  | Einzelmarker ab Zoom |
| ------------------ | --------------------------------------------------------------------- | -------------------: |
| Feuerwachen        | Ortsindex und `poi: fire_station`                                     |                    9 |
| Rettungswachen     | ausdrücklich als `ambulance_station` kartierte POIs                   |                   11 |
| Polizeiwachen      | Ortsindex und `poi: police`                                           |                    9 |
| Katastrophenschutz | ausdrücklich `disaster_response` / `civil_defense`                    |                   11 |
| Kliniken           | Ortsindex, `hospital` und `clinic`                                    |                    7 |
| Bahnhöfe           | `railway` / `rail` / `transit` mit `station`, `halt`, `train_station` |                   12 |
| Flughäfen          | `aerodrome_label`, `aerodrome`, `airport`                             |                    7 |
| Häfen              | Hafen-/Marina-/Fährterminal-POIs                                      |                   11 |
| Bildung            | Schulen, Kindergärten, Hochschulen                                    |                   13 |
| Pflege & Soziales  | Pflege-/Altenheime, betreutes Wohnen, soziale Einrichtungen           |                   13 |
| Einkaufsorte       | Einkaufszentren, Warenhäuser, Supermärkte, Marktplätze                |                   13 |
| Veranstaltungen    | Stadien, Theater, Kino, Veranstaltungs-/Konferenzorte                 |                   12 |
| Industrie          | belegte Industrie-POIs oder `landuse: industrial`-Flächen             |                   13 |

Bereits unterhalb der Einzelmarkergrenze können vollständige räumliche Gruppen wichtiger indizierter Einrichtungen erscheinen. Die Gruppenzahl zählt geografische Karteneinträge; sie ist keine Behauptung über betriebsbereite Einheiten oder freie Betten.

Industrieflächen erhalten einen innerhalb der vorhandenen Polygonkontur liegenden Anzeigeanker. Polygonlöcher werden berücksichtigt. Der Punkt bezeichnet eine kartierte Fläche, keine behauptete Werkseinfahrt oder exakte Firmenadresse. An Kachelgrenzen geteilte Flächen werden nicht zu erfundenen Einzelunternehmen erklärt.

Die Kategorien Rettungswachen und Katastrophenschutz werden nur bei ausdrücklich vorhandenen passenden Merkmalen gefüllt. Der vorhandene Ortsindex enthält diese beiden Klassen nicht. Auch in den unten genannten Stichproben fanden sich keine entsprechenden Punktmerkmale. Eine vollständige deutschlandweite Abdeckung dieser beiden Klassen wird deshalb **nicht behauptet**; das vorhandene Datenpaket wurde für diese UI-Änderung nicht neu importiert. Allgemeine Namen wie „Rettung“ oder beliebige `emergency_service`-Einträge werden nicht als echte Rettungswache ausgegeben.

Geografische Punkte sind als Kontursymbol erkennbar; tatsächlich gekaufte Spielgebäude tragen die Organisationsfarbe. Die kurze Ortsansicht zeigt Name, Kategorie, gegebenenfalls Koordinate, Datenquelle und die ausdrückliche Trennung von tatsächlicher geografischer Existenz und Spielverfügbarkeit. Reale Besatzungen, Klinikspezialisierungen oder Bettenbestände werden nicht aus dem Namen erfunden.

Index- und Kachelobjekte werden über ID sowie nahe identisch benannte Standorte derselben Kategorie dedupliziert. Verschieden benannte Kliniken auf demselben Campus bleiben getrennt. Ein passendes gekauftes Gebäude ersetzt seine nahe geografische Anzeige; dies ist eine Darstellungsregel und führt keine Spielobjekte oder Besitzrechte zusammen. Für die Entfernungsprüfung wird die bestehende geografische Distanzfunktion verwendet.

Überlappende Einrichtungen öffnen eine vollständige Auswahlliste. Auch drei oder mehr verschiedene Einrichtungen an exakt derselben Koordinate bleiben auf Zoom 18 einzeln erreichbar. Eine bereits ausgewählte Einrichtung wird beim nächsten Klick gemeinsam mit den übrigen überdeckten Markern angeboten; die Auswahl kann daher keinen Eintrag hinter sich verbergen. Geografische Übersichtsaggregate bleiben als solche gekennzeichnet.

## Öffentliche Spielerstandorte

Die Deutschlandkarte erhält ausschließlich das öffentliche `PublicPlayer`-DTO. Mehrere Disponenten derselben Leitstelle werden am tatsächlichen gespeicherten Wachstandort gruppiert; benachbarte Leitstellen bleiben innerhalb ihres Kartenpopups vollständig auflösbar. Spieler ohne Spielstandort erhalten keinen erfundenen Marker. Die Liste bleibt der Zugang für diese Spieler.

Der Rahmen hebt die eigene Leitstelle hervor. Der Status „Verbindet erneut“ wird aus dem öffentlichen Präsenzzustand übernommen. Es werden keine private Wachenliste, verdeckten Einsätze, Kontostände oder Gerätepositionen aus Präsenzdaten erschlossen. Der lokale Vorgang `lv:map-focus` bewegt ausschließlich die eigene Kamera zum gewählten Spielpunkt und sendet keine Kamerasynchronisierung.

Beide bestehenden Renderer führen sämtliche Kartenwerkzeuge, Filter, Zoom, Legende und Kartensteuerung in einem `map-tool-panel`. Maßstab und Quellenangabe bleiben an der Karte. Escape schließt eine offene geografische, Spieler- oder Objektgruppenansicht und fokussiert die Karte. Fahrzeugdetails haben einen eigenen Schließenknopf; während einer geöffneten Arbeitsansicht bleiben Karteninspektionen ausgeblendet. Die übergeordnete Hauptleiste steuert das Öffnen des Werkzeugbereichs.

## Laufzeit, Ressourcen und Migration

Beim Serverstart entsteht **vor dem HTTP-Listen** ein kleiner schreibgeschützter SQLite-Speicherindex nur der geeigneten geografischen Einrichtungen. Er wird beim Schließen freigegeben. Die vorhandenen Spiel- und Geodatendateien bleiben unverändert; es gibt keine neue Spielstandmigration und keine laufende Synchronisierung mit Fremdanbietern.

Diese Vorbereitung ist nötig, weil eine grobe Abfrage des allgemeinen Orts-/Adress-RTree Millionen irrelevanter Einträge besuchen konnte. Der vorbereitete Index enthält nur die tatsächlich passenden geografischen Zeilen. Der Servercache umfasst höchstens 96 POI-Kacheln. Detailantworten enthalten höchstens 1.000 Einzelpunkte; bei noch dichterer Belegung gibt es eine vollständige räumliche Aggregation statt einer abgeschnittenen Ergebnisliste. Übersichten gruppieren in 8 × 8 Zellen je indizierter Kategorie, also höchstens 256 Ergebniszeilen pro Kachel.

Der Browser lädt nur sichtbare Kacheln, höchstens vier gleichzeitig, und hält höchstens 96 Antworten. POIs verwenden eine Canvas-Ebene und keine DOM-Komponente pro geografischem Ort. SVG-Pfade werden pro Symbol wiederverwendet. Deduplizierung findet bei neuen Daten oder geänderten Spielgebäuden statt; reine Simulations-Ticks und Markerbewegungen lösen keine erneute POI-Aufbereitung aus. Renderer, Requests, Timer und Listener werden beim Kartenabbau abgeräumt.

## Tatsächlich geprüfte Daten und Tests

Der vorhandene lokale OSM-Datenstand vom **07.09.2026** mit Fingerprint `155596c0041a76f05d3b5fb03a36f2b9e26540b517fde8b4b9884c62c4fc1a90` enthält im Ortsindex:

| Geografische Klasse | Tatsächliche Datensätze |
| ------------------- | ----------------------: |
| `fire_station`      |                  29.041 |
| `police`            |                   3.820 |
| `hospital`          |                   2.162 |
| `clinic`            |                   2.599 |
| Zusammen            |              **37.622** |

Zusätzlich wurden insgesamt **45 echte Detailkacheln** in Berlin, München, Duisburg, Hamburg und am Frankfurter Flughafen gelesen. Vor der Anzeigen-Deduplizierung enthielten diese 4.239 passende Merkmale aus elf Kategorien, darunter 93 Industrieflächen/-fragmente. Das ist eine tatsächliche Stichprobe des lokalen Bestands und keine Behauptung über die Gesamtzahl realer Einrichtungen.

Konkrete gelesene Beispiele sind Feuerwache Mitte (13,4152219 / 52,5170835), Wache am Alexanderplatz (13,4132183 / 52,5214976), Campus Charité Mitte, Bundespolizeiinspektion München, Marina Duisburg, Feuer- und Rettungswache Innenstadt Hamburg und Flughafen Frankfurt mit seinen Bahnhöfen. Der lokale Einzelbeleg liegt in `.tools/test-runs/quality-poi-real.json`; er enthält die Quellenmerkmale und Koordinaten.

Eine lokale Messung gegen die echten Dateien ergab nach Vorbereitung des Speicherindex 6–11 ms je ungecachter grober beziehungsweise detaillierter POI-Abfrage. Die einmalige Vorbereitung dauerte zuletzt etwa 600 ms bei bereits vom Betriebssystem gelesenen Dateien; kalte Datei-I/O kann länger dauern. Reine Bildschirmgruppierung von 5.000 Fahrzeugen dauerte im Median 0,94 ms, von 8.000 POIs 1,63 ms; Deduplizierung der 8.000 Testpunkte etwa 30 ms pro Datenwechsel. Diese Messungen sind CPU-Funktionstests auf dem lokalen Rechner, keine garantierten GPU-Bildraten oder AMP-Serverwerte. Beleg: `.tools/test-runs/quality-poi-performance.json`.

Ausgeführt wurden die vier gezielten Vitest-Dateien `map-symbols.test.ts`, `germany-pois.test.ts`, `germany-map-storage.test.ts` und `germany-map.test.ts`: **20 Tests bestanden**, ein bereits vorhandener Symlinktest wird unter Windows übersprungen. Sie prüfen das vollständige 50-ID-Mapping und Fallbacks, Klassifikation ohne Namensraten, Polygonlöcher, Deduplizierung, vollständige 1.300-Punkte-Aggregation, Tile-Grenzen, Datasetbindung, Speicherindex/Schreibschutz, 2.400 öffentliche Spieler und 700 identisch platzierte Fahrzeuge.

Die vier gezielten Playwright-Kartenfälle bestanden lokal mit **Microsoft Edge**: bestehende PC-Steuerung, Bauvorschau ohne Kauf nach Drag, öffentliche Präsenz/POI-Auswahl/Filter/lokaler Kamerasprung und vollständige Fahrzeuggruppenauswahl bei Zoom 18 einschließlich Escape, Inspektions-Callback, Unterdrückung bei Arbeitsansichten und Fahrzeugdetail-Schließen. Diese Tests verwenden ausdrücklich bezeichnete leere Kartenkacheln und Vertragsdaten; sie ersetzen nicht die echte Geodatenprüfung oder die übergeordnete visuelle Abnahme. Browserbericht: `.tools/test-runs/quality-map-browser.json`. Den vollständigen Build, gesamte Regression und reale Anwendungsscreenshots dokumentiert der übergeordnete Qualitätsbericht.
