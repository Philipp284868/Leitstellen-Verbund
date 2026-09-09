# Echtes Höhenmodell für die Deutschlandkarte

Die Karte kann lokale Höhenkacheln aus **Copernicus GLO-90** als zurückhaltende
Reliefschattierung anzeigen. Die Geometrie stammt aus realen Messdaten. Straßen,
Gebäude, Gewässer und Beschriftungen bleiben die separaten OSM-Vektordaten.
Die Schattierung verändert weder die Routingentscheidungen noch die Fahrzeiten.

## Datenquelle und fachliche Grenzen

- Öffentliche Quelle: [Copernicus DEM im AWS Open Data Registry](https://registry.opendata.aws/copernicus-dem/).
  Der Bucket `copernicus-dem-90m` ist ohne Konto, Zugangsschlüssel und signierte
  Anfragen lesbar. Die fertige Spielkarte lädt ausschließlich vom eigenen Server.
- [Offizielle Beschreibung der COG-Dateien](https://copernicus-dem-90m.s3.amazonaws.com/readme.html):
  GLO-90 enthält nominal 90-Meter-Daten. `_30_` in den Dateinamen bezeichnet
  drei Bogensekunden, keine 30-Meter-Auflösung. Zellbreite und Pixelversatz werden
  aus dem tatsächlichen GeoTIFF-Transform gelesen; nördlich 50° sind die Zellen
  beispielsweise 800 × 1200 Pixel groß.
- Es handelt sich um ein **Oberflächenmodell (DSM)** einschließlich Vegetation
  und Bebauung, nicht um ein von Bauwerken bereinigtes Geländemodell.
  Höhenbezug: EGM2008, EPSG:3855. Siehe
  [offizielle Sammlungsbeschreibung](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM).
- Das Quellen-Lock umfasst 94 GeoTIFFs, insgesamt 357.915.645 Bytes, für
  5,5–15,6° Ost und 47,1–55,2° Nord. Fünf Zellen fehlen im offiziellen Index,
  weil sie vollständig im Meer liegen. Nur dort wird die vom Anbieter ausdrücklich
  vorgegebene Meereshöhe null verwendet. Fehlende Höhen innerhalb verfügbarer
  Landzellen im Kartengebiet brechen den Build ab.
- Das Datum `snapshot` bezeichnet die geprüfte Beschaffung des gepinnten
  Datenbestands, keine neue Höhenvermessung. URL, Last-Modified, ETag, Dateigröße
  und SHA-256 jeder einzelnen Datei sind im Quellen-Lock dokumentiert.

## Lizenz und Quellenhinweise

GLO-90 besitzt die eigene **Copernicus WorldDEM-90-Lizenz**; es wird hier nicht
als CC-BY-Datensatz ausgegeben. Maßgeblich ist die GLO-90-Sektion des
[offiziellen Lizenzdokuments](https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf).
Sie erlaubt unter anderem Bearbeitung, Kombination, Weitergabe und öffentliche
Darstellung. Die Quellen-, Haftungs- und Weitergabevorgaben müssen erhalten bleiben.

`prepare` speichert eine mit SHA-256 geprüfte vollständige Kopie als
`dem-license.pdf` sowie `dem-NOTICE.txt` im Geodatenordner. Die vorgeschriebene
Quellenangabe für veränderte Daten wird in den MBTiles-Metadaten, dem Manifest
und der sichtbaren MapLibre-Attribution geführt. Das Spiel behauptet keine
offizielle Unterstützung durch Copernicus, DLR, Airbus, EU oder ESA.
Bei Weitergabe der fertigen Geodaten müssen Lizenz und NOTICE mitgegeben werden.

## Reproduzierbare Vorbereitung

Alle Befehle werden im Repository ausgeführt. Python **3.12** mit `pip` wird
für die Aufbereitung benötigt; der Node.js-Spielserver benötigt Python nicht.
Der Geodatenordner muss außerhalb des Programmverzeichnisses liegen.

```powershell
$env:GEODATA_DIR = 'D:/Leitstellen/Deutschland-Geodaten'
python -m pip install --require-hashes --only-binary=:all: --target "$env:GEODATA_DIR/tools/dem-python" -r scripts/geodata/dem/requirements.lock
python scripts/geodata/dem/pipeline.py prepare
python scripts/geodata/dem/test_dem.py
python scripts/geodata/dem/pipeline.py build
python scripts/geodata/dem/pipeline.py verify
```

Unter Linux werden `GEODATA_DIR` als normale Umgebungsvariable und `python3.12`
als Interpreter verwendet. Das Requirements-Lock enthält die veröffentlichten
Hashes der Python-3.12-Wheels für Windows, Linux und macOS, soweit für die
jeweilige Abhängigkeit verfügbar. Nur die tatsächlich eingesetzte Plattform
wird installiert. Rasterio/GDAL stammen aus den Binary-Wheels; ein systemweiter
GDAL-Umbau ist nicht erforderlich.

`prepare` verwendet ausschließlich das eingecheckte `source-lock.json`,
überprüft bereits vorhandene Dateien vollständig und setzt unterbrochene
Downloads per HTTP Range fort. Zwei Downloads laufen gleichzeitig. Abweichende
vorhandene Dateien werden nicht still überschrieben. `pin` ist ausschließlich
für eine bewusst geprüfte neue Quellenfassung vorgesehen und verweigert ein
vorhandenes Quellen-Lock; der normale Betrieb verwendet `prepare`.

Das fertige DEM und fortsetzbare Zwischenstände sind an den SHA-256 der
**unveränderten Dateibytes** des Quellen-Locks gebunden. Für den eingecheckten
Stand ist dies `06dbe4655c0cd481faec6bb7fa0a61d8149bb044ed9f195b8370005afba722e2`.
Die gezielte `-text`-Regel in `.gitattributes` erhält deshalb dessen ursprüngliche
CRLF-Zeilenenden auch unter Linux und bei abweichendem `core.autocrlf`.
Das JSON darf nicht nur zur Formatierung umgeschrieben werden. Ein Offline-Test
prüft den veröffentlichten Hash sowie neue Git-Checkouts mit `autocrlf=false`,
`true` und `input`. Bereits erzeugte Geodaten und ihre Manifeste bleiben unverändert;
die restlichen Projektdateien verwenden weiterhin die normalen LF-Regeln.

## Build, Speicher und Freigabe

Der Build erzeugt **5.922 Kacheln mit 256 × 256 Pixeln** für Zoom 5–11.
Die Ausgabe ist eine SQLite-MBTiles-Datei mit TMS-Zeilenindizes und verlustloser
Terrarium-RGB-PNG-Kodierung. Der Client kann die maximale Datenzoomstufe weiter
vergrößern; dadurch entstehen keine zusätzlichen Höhendetails.

Die Umprojektion erfolgt aus WGS84 nach Web Mercator, jeweils für nur eine
Kachel. Ein GDAL-Worker, maximal sechs offene COG-Dateien, 64 MiB GDAL-Cache und
32 MiB Warp-Limit vermeiden ein Deutschlandraster im Arbeitsspeicher. Python,
GDAL, Bibliotheken und temporäre Arbeitsdaten benötigen zusätzlichen Speicher;
das ist kein hartes Gesamtspeicherlimit. Bei gleichzeitig laufendem OSM-Import
sollte der Build zeitlich getrennt durchgeführt werden.

Der Zwischenstand heißt `dem.mbtiles.partial`. Nach jeweils 64 Kacheln wird
committed; ein erneuter Build setzt nur einen Zwischenstand desselben
Quellen-Locks fort. Vor der Veröffentlichung werden SQLite-Integrität,
vollständige geografische Kachelabdeckung, jedes PNG, Terrarium-Rundlauf und
reale Höhenstichproben an Brocken, Zugspitze, Feldberg sowie in der Nordsee geprüft.
Erst danach entstehen `dem.mbtiles` und das atomar geschriebene
`dem-manifest.json` mit `status: "ready"`, SHA-256, Größe und Prüfbelegen.
Ein vorhandenes fertiges Artefakt wird geprüft und niemals automatisch ersetzt.

Für die Weitergabe an einen Spielserver gehören diese Dateien zusammen in
dessen persistenten Geodatenordner:

```text
dem.mbtiles
dem-manifest.json
dem-source-manifest.json
dem-license.pdf
dem-NOTICE.txt
```

Quelldownloads und Python-Wheels können im Aufbereitungsordner bleiben.
Die Spielserver-Schnittstelle liefert nur ein vollständig geprüftes Modell im
öffentlichen Kartenmanifest als `dem`. Kacheln werden sichtbarkeitsabhängig unter
`/geo/dem/{z}/{x}/{y}.png?dataset=<sha256>` geladen. Fehlt ein fertig aufbereitetes
Modell, bleibt die echte Vektorkarte verwendbar. Eine erfundene Reliefgrafik
wird nicht als Ersatz eingeblendet.

Die Pipeline installiert, startet oder aktualisiert keine Produktionsinstanz.
