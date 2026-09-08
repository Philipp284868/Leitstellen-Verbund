# Rivermere und PC-Kartensteuerung

Rivermere ist eine eigene 100 × 100 Kilometer große Serverwelt. Stadt, Außenorte, Seen und Fluss folgen der freigegebenen Gestaltungsvorlage. Sichtbare Straßen bilden zugleich die Fahrzeugrouten. Gezeichnete Karte, keine vermessene reale Geografie.

- Linksklick: auswählen. Linkes Ziehen: verschieben, auch über Markern.
- Mausrad: Zoom zum Zeiger. Über Listen: Listenscroll. Strg+Mausrad: Browserzoom.
- Plus/Minus, Gesamte Region, Meine Wachen und Auswahl zentrieren ergänzen die Maussteuerung.
- Pfeiltasten wirken nur bei Kartenfokus. Texteingaben behalten Auswahl, Kopieren und Einfügen.
- Fahrzeugfolgen wird bewusst aktiviert und durch manuelles Verschieben beendet.
- Kamera und Zoomempfindlichkeit bleiben lokal. Regler unter Kartensteuerung.

Rivermere ist die einzige ausgelieferte Karte. Das Standardprogrammziel lautet `dist/server/index.js`; eine zusätzliche Karteninstanz oder Kartenauswahl gibt es nicht mehr. Vorhandene Rivermere-Daten können unverändert weiterverwendet werden. Falkenried-Daten bleiben als geschützter Bestand erhalten und werden beim Start abgewiesen; Wachen und laufende Fahrten werden nicht auf die andere Geografie verschoben. War bisher die alte Karte aktiv, benötigt der Betreiber für Rivermere ein eigenes persistentes Datenverzeichnis. Schema 12 und bestehender Fortschritt in Rivermere bleiben unverändert.

[Vollständige Anleitung, Sicherung und Migrationsvorschau](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/RIVERMERE.md).
