# Einsatzstandorte und Wasserwachen in Deutschland

Der Deutschland-Generator nutzt `incidentLocations()` und `queryIncidentSites(center, radius, profile.site)`. Der Server sucht reale motorisierte OSM-Straßenstandorte und prüft die zum Einsatzprofil passende Nutzung in den **lokalen** Detailkacheln von `maps.mbtiles`. Es gibt keine Online-Ortsabfragen und keine Übertragung von Spielständen an Kartendienste.

`server/germany/geography-sites.ts` liest dieselbe OSM-Datenversion wie der Straßenindex; `source_sha256` muss übereinstimmen. `prepareGeography()` übergibt die vorhandene Karte ausdrücklich an den Provider. Das vorhandene Deutschland-Datenpaket muss weder neu importiert noch neu veröffentlicht werden. Die Detailkacheln müssen Zoomstufe 14 enthalten; fehlende oder nicht passende Geometrie wird nicht durch erfundene Standorte ersetzt.

## Eignung je Einsatzprofil

Die Koordinate bezeichnet den **straßenseitigen Zugang** zum Einsatzgebiet. OSM-Flächen belegen beispielsweise Wald oder Industrie, aber keine konkrete Hallennummer, Wohnung oder genehmigte Zufahrt durch ein Tor. Solche Gebäudedetails werden nicht aus einer Kartendarstellung erfunden.

| `profile.site` | Verwendete lokale OSM-Merkmale                                                    | Abstand des Straßenpunkts                                                      |
| -------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `street`       | Motorisierter Straßenindex                                                        | Auf dem indizierten Straßenpunkt                                               |
| `residential`  | Wohnnutzung `landuse: residential`                                                | Innerhalb oder höchstens 25 m daneben                                          |
| `commercial`   | Gewerbe, Einzelhandel, passende Laden-/Gastronomie-/Hotel-POIs                    | Innerhalb oder höchstens 40 m daneben                                          |
| `industrial`   | Industriefläche `landuse: industrial`                                             | Innerhalb oder höchstens 40 m daneben                                          |
| `forest`       | Bewaldete Fläche `landcover: wood`                                                | Innerhalb oder höchstens 80 m daneben                                          |
| `field`        | Landwirtschaft, Wiese, Grasland, Obst- oder Weinbau                               | Innerhalb oder höchstens 60 m daneben                                          |
| `rail`         | Bahnnutzung, oberirdische Eisenbahn, Straßen-/Stadtbahn                           | Innerhalb oder höchstens 60 m daneben                                          |
| `public`       | Schule, Klinik, Hochschule, Spiel-/Sportplatz, Park und passende öffentliche POIs | Innerhalb oder höchstens 40 m daneben                                          |
| `water`        | See, Fluss, Meer, Teich, Hafen-/Speicherbecken; offene Fluss-/Kanallinie          | **An Land**, 2–60 m von der Gewässergeometrie                                  |
| `construction` | Baustellenfläche oder als Baustelle kartierter Verkehrsweg                        | Innerhalb oder höchstens 40 m daneben auf einer vorhandenen befahrbaren Straße |

Brücken, Tunnel sowie Autobahnen/Schnellstraßen werden bei diesen Nutzungsstandorten ausgeschlossen. Straßenereignisse können weiterhin auf den dafür passenden Straßen liegen. Allgemeine Wasserrettungsprofile verwenden keine Schwimmbecken, Entwässerungsgräben oder nur zeitweilig wasserführenden beziehungsweise unterirdischen Kanäle. Polygonlöcher und benachbarte Kacheln werden berücksichtigt: Eine Insel bleibt Land; eine durch einen See verlaufende Kachelgrenze wird nicht zum Ufer.

Es werden maximal 20.000 örtliche Straßenkandidaten betrachtet. Die Auswahl liefert standardmäßig bis zu 32 mindestens 50 m voneinander entfernte passende Zugänge pro Wache; sie begrenzt **nicht** die Zahl laufender Einsätze. Kandidaten und Cache-Ergebnisse haben eine stabile Reihenfolge, die endgültige Auswahl nutzt den vorhandenen serverseitigen Simulationsseed. Wenn kein passender Wald-/Bahn-/Uferstandort vorhanden ist, entfällt diese Generierung; es folgt kein beliebiger Straßenersatz. Im Generator wird der vollständige ursprüngliche Standorttyp des Profils verwendet.

## Straßenbasierte Wasserrettung

Bei Wasserereignissen bestätigt GraphHopper eine durchgehende Autostraßenroute vom relevanten Wachenzentrum zum Uferpunkt. Der tatsächliche Routenendpunkt muss innerhalb von 2 m am bestätigten Straßenanker liegen und weiterhin als landseitiger Uferzugang geeignet sein. Nicht erreichbare Zugänge werden verworfen; vorübergehende Routingfehler werden nicht dauerhaft als fehlendes Gewässer gespeichert.

Eine Wasserwache kann auf einem solchen Uferstandort gebaut werden. `buildReason()` prüft vor dem Bau serverseitig Guthaben, Freischaltung, vorhandene Belegung, Straßenanbindung und Uferlage. `isWaterSite()` bestätigt zusätzlich eine tatsächlich befahrbare Verbindung von mindestens 100 m zu einem weiteren örtlichen Straßenpunkt. Die bestehende Bauplatz-API und der spätere Kauf verwenden dieselbe Prüfung. Ohne ausgewählten Bauplatz zeigt die Oberfläche keine pauschale Deutschland-Sperre mehr; die konkrete Eignung entscheidet der Server nach dem Kartenklick.

Das deutsche Boot-Fahrzeug ist ein **Zugfahrzeug mit MZB**, das auf Straßen zum Ufer fährt. Die Rettungsarbeit wird dort simuliert. Eine freie Wasserfahrt, Slipanlage, Zufahrtsgenehmigung oder ein durchgehendes Bootsroutennetz wird damit nicht behauptet. Der bestehende Provider lehnt `mode: "water"` weiterhin ausdrücklich ab.

## Laufzeit und Speicherung

Die Kartenverbindungen sind schreibgeschützt. Es entstehen keine Änderungen an `index.sqlite`, `maps.mbtiles` oder bestehenden Spielkoordinaten und keine Spielstandmigration durch dieses Modul.

Der Kachelcache hat höchstens 96 Einträge und ein konservativ geschätztes Geometriebudget von 48 MiB; dies ist kein Versprechen über den gesamten Prozessheap. Komprimierte Kacheln dürfen höchstens 4 MiB, entpackte höchstens 16 MiB umfassen. Ein Protobuf-Vorlauf begrenzt die Geometrie auf 250.000 Punkte pro Kachel, bevor der Decoder Koordinatenarrays anlegt. Polygone verwenden ihre bereits konvertierten Ringe erneut. Fehlende Kacheln werden ebenfalls begrenzt zwischengespeichert.

Einsatzabfragen und Uferprüfungen verwenden begrenzte Provider-Caches. Mehrere Routingversuche teilen sich eine monotone Deadline von höchstens drei Sekunden beziehungsweise der kürzeren konfigurierten Routingfrist. Ein einzelner langsamer Kandidat erhält nur die verbleibende Zeit. Der Server darf bei einer Störung einen erneuten Versuch verlangen; eine Fahrverbindung wird dadurch nicht erfunden.

Bei einer vorübergehenden Routingstörung verschiebt die **automatische** Generierung ihre Auswahl um 60 Sekunden und erhält den vorherigen Seed. Dafür werden die bereits vorhandenen gespeicherten Felder `missionWait` und `nextMission` verwendet. Andere Einsätze und die Simulationszeit laufen weiter; der Health-Endpunkt bleibt verfügbar. Eine endgültig ungeeignete Geometrie wird weiterhin als solche behandelt, während kaputte Karten oder ungültige Routerverträge sichtbar fehlschlagen. Die manuelle Bauplatzprüfung verschweigt Routingfehler ebenfalls nicht. Ein Serverneustart benötigt für diese Wartefrist keine neue Spielstandmigration.

## Ausgeführte Ortsprüfung

Am 09.09.2026 wurden der vorhandene lokale OSM-Bestand `155596c0041a76f05d3b5fb03a36f2b9e26540b517fde8b4b9884c62c4fc1a90` und GraphHopper 11.0 gemeinsam geprüft. Verwendet wurden dessen Import vom 08.09.2026 und OSM-Daten vom 07.09.2026. Es gab keinen Neuimport und keinen Zugriff auf den privaten AMP-Server.

14 örtliche Abfragen lieferten jeweils vier belegte Standorte und nach erneuter Abfrage dieselben Ergebnisse: Straßen-, Wohn-, Gewerbe-, Industrie-, öffentliche, Bahn-, Baustellen- und Uferstandorte in Berlin; Ufer/Wald am Wannsee; Feld/Wald im Raum 12,85° O / 52,15° N; Industrie/Ufer in Duisburg. Beispiele aus der tatsächlich gelesenen Karte:

| Nutzung               | OSM-Straßenpunkt                            | Koordinate (Länge, Breite) |
| --------------------- | ------------------------------------------- | -------------------------- |
| Spreeufer             | Karl-Liebknecht-Straße, OSM-Knoten 25665988 | 13.4031176, 52.5190545     |
| Wannseeufer           | Koblanckstraße, OSM-Knoten 30355470         | 13.1614284, 52.4261447     |
| Duisburger Uferzugang | Werftstraße, OSM-Knoten 80294163            | 6.7536319, 51.4326187      |
| Industrie             | Vulkanstraße, OSM-Knoten 33597941           | 6.7514734, 51.4306675      |
| Feld/Waldrand         | Weg zum Reiterhof, OSM-Knoten 283332126     | 12.8553181, 52.1506288     |

Die drei aufgeführten Spree-, Wannsee- und Duisburger Uferpunkte bestanden zusätzlich die tatsächliche `isWaterSite()`-Bauplatzprüfung gegen GraphHopper; ein Berliner Binnenstraßenpunkt wurde abgelehnt. Der lokale Nachweis liegt in `.tools/test-runs/geography-water-stations.json`.

Beim abschließenden Lauf betrugen die Abfragen 4–352 ms und Wiederholungen unter 0,04 ms. Dies sind lokale Stichproben bei bereits vom Betriebssystem gelesenen Dateien, kein landesweiter Leistungsnachweis; die erste völlig kalte bestehende Straßenabfrage benötigte zuvor 2,4 s. Der zugehörige lokale JSON-Beleg enthält Koordinaten, OSM-Knoten, Geometrieklassen und Einzelzeiten in `.tools/test-runs/geography-acceptance.json`.

Automatisierte Tests liegen in `tests/germany-geography-sites.test.ts` (echte synthetische MVT-Kacheln, alle Standorttypen, Flächenlöcher/Kachelgrenzen, Speicher-/Zeitbudgets, reale Produktions-Standortfunktion und Provider-Vertrag) sowie den bestehenden Deutschland-Provider-, HTTP-, Wiederherstellungs- und Simulationssuiten. Die HTTP-Suite prüft zusätzlich Uferbauplatz, abgewiesenen Binnenstandort, tatsächlichen Kauf, wiederholte Aktion und Erhalt nach Serverneustart. Historische feste Lebenszyklus- und Snapshot-Szenarien erzeugen ihre ausdrücklich gewünschten Testeinsätze selbst; sie umgehen keine Geometrieprüfung im Produkt.

Die Dekodierung folgt der [MVT-Bibliothek von Mapbox](https://github.com/mapbox/vector-tile-js); die Klassen entsprechen dem [OpenMapTiles-Schema](https://openmaptiles.org/schema/) des vorhandenen Kartenpakets.
