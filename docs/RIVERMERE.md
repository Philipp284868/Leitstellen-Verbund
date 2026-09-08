# Rivermere: Weltmodell und geschützter Betrieb

Stand: 08.09.2026. Arbeitsauftrag: [Issue #26](https://github.com/Philipp284868/Leitstellen-Verbund/issues/26).

## Ausschließlich Rivermere

Der normale Build erzeugt ausschließlich Rivermere: `dist/server/index.js`, `dist/server/cli.js` und `dist/client/`. AMP, `npm start`, die Entwicklungsvorschau und das Linux-Paket verwenden dieselbe neue Karte. `LV_WORLD` ist kein Kartenumschalter mehr. Die frühere zusätzliche Ausgabe unter `dist/worlds/` wird beim Build entfernt. Es gibt keinen Einzelspielermodus und keinen clientseitigen Geografieumschalter. Historischer Geografiecode bleibt ausschließlich für Migrationsprüfungen erhalten; entsprechende Testprogramme liegen unter `.tools`, niemals im ausgelieferten Paket.

Rivermere ist eine neue Serverwelt, keine Umplatzierung bestehender Falkenried-Wachen. Die Komposition unterscheidet sich wesentlich: Rivermere liegt zentral, Falkenrieds historische Innenstadt im Nordwesten. Eine Koordinatenumrechnung könnte diese Änderung nicht verlustfrei leisten. Ein bestehendes Datenverzeichnis darf deshalb nicht für die andere Welt verwendet werden. Auch Konten, Besitz und laufende Einsätze werden nicht automatisch zwischen Serverwelten übertragen.

## Sicherung, Vorschau und Migration

1. Bestehende Instanz mit dem Backup-Verfahren aus `AMP.md` sichern. Bei laufender Instanz die vorhandene Online-Sicherung verwenden.
2. Nur lesende Vorschau: `node scripts/world-preview.mjs /absoluter/pfad/game.sqlite`. Sie zeigt Weltkennungen, Schema, Gebäude, Fahrzeuge, aktive Fahrten und Einsätze. Sie schreibt nichts und führt keinen Transfer aus.
3. Die bisherige Anwendung kontrolliert stoppen und das alte Datenverzeichnis als Sicherung aufbewahren. Keine zweite aktive alte Karte ist vorgesehen.
4. AMP-Programmziel auf `dist/server/index.js` setzen. Ein bereits vorhandenes Rivermere-`DATA_DIR` unverändert weiterverwenden. War bisher Falkenried aktiv, ein neues persistentes Rivermere-Datenverzeichnis wählen: Eine verlustfreie geografische Übernahme ist nicht möglich; Konten und Fortschritt werden nicht automatisch übertragen. Der Start gegen Falkenried-Daten wird vor SQLite-Änderungen mit Weltkonflikt abgewiesen. Ohne ausdrücklich gesetztes `DATA_DIR` startet der Server nicht.
5. Port und HTTPS-Adresse können beim kontrollierten Austausch derselben Instanz beibehalten werden. Bei Wechsel vom früheren verschachtelten Rivermere-Programmziel `.env` im Hauptprogrammverzeichnis beziehungsweise AMP-Umgebungsvariablen prüfen. Kein automatischer Produktivstart; Produktionsdaten werden durch den Quellcode-Build nicht verändert.

SQLite-Schema 12 schreibt eine dauerhafte Weltkennung mit Seed und Generierungsversion in `meta`. Die bestehende Vorab-Sicherung bei Schemawechseln bleibt aktiv. Die Migration verändert keine Besitzdaten, Positionen, Einsatzorte, Fahrwege oder Fahrzeiten. Erneutes Öffnen erzeugt keine weitere Migration. Eine inkompatible Weltkennung oder ein fremder gespeicherter Spielstand wird vor SQLite-Schreiboperationen abgewiesen. Alte Falkenried-Migrationen gelten weiterhin ausschließlich für Falkenried.

## Geografie und technische Maße

- Welt: `rivermere-1`, Generierung 1, Seed `57180908`.
- Koordinaten: `0 … 100000/12` auf beiden Achsen; eine Einheit entspricht 12 Metern.
- Breite und Höhe: jeweils exakt 100.000 Meter; Fläche 10.000 km².
- Rivermere mit Old Town, Northgate, Westfield, Eastbrook, Lakeside, Southridge und Harbor District.
- 22 äußere Siedlungen, darunter Westhaven, Brookdale, Kingsley, Southwell und Meadowbrook.
- Silverlake im Nordwesten, Cedar Lake im Osten, Willow Lake im Südwesten; zentraler Fluss mit westlichem Zufluss; Wälder und Höhenzüge in den Randbereichen.

Die Vorlage ist ein gestalterisches Bild, keine vermessene Karte. Ortslagen und großräumige Verteilung wurden daraus interpretiert. Straßen, Anschlüsse, Flusskurven und Grundstücke sind neu konstruierte fiktive Geometrie. Der dekorative Bildmaßstab wird nicht übernommen. Der dynamische Maßstab entsteht aus Weltmetern und der tatsächlichen SVG-Abbildung einschließlich der quadratischen Übersicht.

## Straßen, Wasser und Fahrten

Straßenzeichnung und Routing verwenden dieselben unterteilten Polylinien. Längen ergeben sich aus deren Segmenten in Metern. Anschlusspunkte und tatsächliche Schnittpunkte bilden gemeinsame Knoten. Die Achse Rivermere–Eastgate besitzt getrennte Überführungen; diese optischen Kreuzungen erzeugen keine Abbiegekanten. Andere Kreuzungen werden in beide Straßen eingetragen.

Siedlungsstraßen werden von Seen und Flussflächen ferngehalten. Flussquerungen des überörtlichen Netzes besitzen Brückenabschnitte. Gebäude liegen seitlich an Straßen und außerhalb von Wasserflächen; vereinzelte Höfe begleiten die Landstraßen. Neue Wachen auf Flussknoten werden sowohl in der Bauvorschau als auch auf dem Server abgewiesen. Wasserrettungsbauplätze liegen auf trockenem Uferland. Wasserfahrten besitzen einen ausdrücklich modellierten Zugang vom Hafenbauplatz zur Flusslinie (höchstens 900 Meter); der eigentliche Fahrtverlauf folgt dieser Linie. Diese vereinfachte Hafenanbindung ist keine ausgearbeitete Hafenbeckensimulation. Nicht erreichbare Straßenziele werden abgewiesen.

Abschnittslimits, Fahrzeughöchstgeschwindigkeit, Verkehrseinflüsse, Sperren, Beschleunigung und Bremsung bleiben Bestandteil der bestehenden Fahrzeitberechnung. Einsatzfahrt, Rückfahrt und Transport verwenden dieses gemeinsame Modell. Keine pauschale Minuten-pro-Kilometer-Berechnung. Andere Leitstellen erhalten keine automatische Einsicht oder Freigabe.

## Darstellung und bewusste Grenzen

Die Karte ist eine interaktive Vektordarstellung, keine fotorealistische Satellitenaufnahme. Sie verwendet eigene Beschriftungen, Straßen, Gebäudeflächen, Felder und Wälder. Das Referenzbild wird nicht als Hintergrund mit einem abweichenden alten Straßennetz verwendet. Hausformen, Gelände-Höhen und Architektur sind gestalterische Ergänzungen, keine vollständige Simulation jedes Referenzpixels.

Gebäudedetails werden über einen räumlichen Index nach Bildausschnitt geladen. Die Übersicht verwendet zusammengefasste Gebäudepfade; Straßen und Texte reduzieren sich nach Zoomstufe. Die Geografie wird einmal je Anwendung erzeugt, nicht beim Ziehen. Pointerbewegungen aktualisieren die Ansicht höchstens im Browser-Renderzyklus. Die Simulation läuft unabhängig von der Kamera weiter.

## Bedienung

Linksklick wählt einen Marker. Linkes Ziehen verschiebt die Karte, auch über Markern. Erst ab fünf CSS-Pixeln gilt die Bewegung als Drag. Beim Loslassen wird kein Marker, HUD-Knopf oder Bauplatz bestätigt. Der nächste eigenständige Klick funktioniert normal.

Mausrad über der Karte zoomt zum Zeiger; über einer Liste scrollt die Liste. Strg+Mausrad bleibt Browserzoom. Plus/Minus, Gesamte Region, Meine Wachen und Auswahl zentrieren ergänzen die Steuerung. Auswahlwechsel verschieben die Kamera nicht automatisch. Fahrzeugfolgen wird ausdrücklich aktiviert; manuelles Verschieben beendet es.

Pfeiltasten und +/− wirken nur bei Kartenfokus, bestehende Spielhotkeys nicht in Eingabefeldern oder blockierenden Dialogen. Escape schließt zunächst den Dialog, dann den Baumodus beziehungsweise die Auswahl. Keine WASD-Doppelbelegung. Suchfelder, Nachrichtenfelder und Berichte bleiben auswählbar und kopierbar.

Kamera und Zoomempfindlichkeit werden pro Welt und Konto nur im Browser gespeichert. Fremde Weltkennungen, abweichende Seeds oder ungültige Werte werden verworfen. Live-Updates verändern die manuelle Kamera nicht. Die kompakte Hilfe „Kartensteuerung“ enthält den Empfindlichkeitsregler.

## Verifikation

Aktuelle Nachweise werden in `KARTEN-ABNAHME.md` geführt. Bestehende Spiele- und Sicherheitsprüfungen bleiben verbindlich. Diese Anleitung allein ist keine Behauptung bestandener Browser-, Linux- oder Leistungsprüfungen.
