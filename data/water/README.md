# Löschwasser: OSM-Zusatzpaket

© OpenStreetMap contributors. Die extrahierte Datenbank steht unter der
[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
[Quellen- und Lizenzhinweise von OpenStreetMap](https://www.openstreetmap.org/copyright).

Das lokale, komprimierte NDJSON enthält ausschließlich tatsächlich eingetragene
OSM-Knoten mit `emergency=fire_hydrant` oder `emergency=suction_point`.
Schilder, Einspeisungen und Gewässer ohne kartierte Entnahmestelle werden nicht
zu Hydranten umgedeutet. Wege und Flächen sind nicht Teil dieser Extraktion.

- Gemeinsamer PBF-Datenstand mit der Deutschlandkarte: **7. September 2026**.
- PBF-SHA-256: `155596c0041a76f05d3b5fb03a36f2b9e26540b517fde8b4b9884c62c4fc1a90`.
- Innerhalb der geprüften Deutschlandgrenze: **919.518 Knoten**, davon
  **907.396 Hydranten** und **12.122 Entnahmestellen**.
- Komprimiertes Zusatzpaket: **17.437.255 Byte**; Prüfsumme und Zählung stehen in `manifest.json`.

Eine eingetragene Armatur beweist weder aktuelle Betriebsbereitschaft noch eine
bestimmte Förderleistung. Originalattribute bleiben erhalten. Zugang, örtliche
Geometrie und gemeldete Sperren werden separat geprüft. Fehlende Förderwerte
werden als endliche **Spielwerte** gekennzeichnet. Simulierte Ergänzungen
entstehen erst aus dem versionierten Gebietsmodell und sind nicht in dieser
OSM-Datenbank enthalten.

## Erzeugung und Wiederverwendung

`scripts/geodata/ExtractWater.java` prüft zuerst die vollständige PBF-Prüfsumme
und liest danach die ausgewählten Knoten einmalig mit dem bereits verwendeten
GraphHopper-11-Werkzeug. `FilterWater.java` schneidet die Extraktion mit JTS an
der geprüften Deutschlandgrenze zu; dabei wurden 526 Außenpunkte entfernt.
Beide Hilfsprogramme verweigern das Überschreiben vorhandener Ausgabedateien.
`node scripts/geodata/package-water.mjs` überprüft anschließend Knotentypen,
Zählungen und Prüfsumme und schreibt das Manifest.

Der Spielserver importiert **keinen vollständigen Deutschland-PBF** für diese
Ergänzung. Er erstellt einmalig einen SQLite-Raumindex unter dem bestehenden
Geodatenpfad und verwendet ihn anhand des vollständigen Paketfingerabdrucks
erneut. Ein anderer Kartendatenstand wird abgelehnt. Tests verwenden kleine,
ausdrücklich synthetische Wasserpakete und keine Deutschlandvollimporte.

Quellattribute und Originalkennungen sind für weitere Verarbeitung verfügbar;
bei Weitergabe dieses Datenpakets müssen Herkunft und Datenbanklizenz erhalten
bleiben. Die Daten sind keine örtliche Löschwasserversorgungszusage.
