# Rivermere und PC-Kartensteuerung

Rivermere ist eine eigene 100 × 100 Kilometer große Serverwelt. Stadt, Außenorte, Seen und Fluss folgen der freigegebenen Gestaltungsvorlage. Sichtbare Straßen bilden zugleich die Fahrzeugrouten. Gezeichnete Karte, keine vermessene reale Geografie.

- Linksklick: auswählen. Linkes Ziehen: verschieben, auch über Markern.
- Mausrad: Zoom zum Zeiger. Über Listen: Listenscroll. Strg+Mausrad: Browserzoom.
- Plus/Minus, Gesamte Region, Meine Wachen und Auswahl zentrieren ergänzen die Maussteuerung.
- Pfeiltasten wirken nur bei Kartenfokus. Texteingaben behalten Auswahl, Kopieren und Einfügen.
- Fahrzeugfolgen wird bewusst aktiviert und durch manuelles Verschieben beendet.
- Kamera und Zoomempfindlichkeit bleiben lokal. Regler unter Kartensteuerung.

Rivermere bleibt unter dem Standardprogrammziel `dist/server/index.js` verfügbar. Vorhandene Rivermere-Daten können unverändert weiterverwendet werden. Ab Version 2.16 enthält der reguläre Build zusätzlich die getrennten Programme für [[Deutschland]]. Diese Welt wird bewusst über `scripts/start-germany.mjs` mit einem eigenen persistenten `DATA_DIR` und vorbereitetem externem `GEODATA_DIR` eingerichtet. Ein Programmupdate wechselt die bestehende Welt nicht automatisch; im Spiel gibt es keinen Geografieumschalter.

Falkenried-Daten bleiben als geschützter Bestand erhalten und werden beim Rivermere-Start abgewiesen; Wachen und laufende Fahrten werden nicht auf die andere Geografie verschoben. War bisher Falkenried aktiv, benötigt der Betreiber für Rivermere ein eigenes persistentes Datenverzeichnis. Schema 12 und bestehender Fortschritt in Rivermere bleiben unverändert. Konten, Besitz und laufende Vorgänge werden auch beim Wechsel nach Deutschland nicht automatisch übertragen.

[Vollständige Anleitung, Sicherung und Migrationsvorschau](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/RIVERMERE.md).
