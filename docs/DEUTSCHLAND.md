# Deutschland: einziges aktives Produkt

Deutschland ist die einzige aktive Spielwelt. Der Build erzeugt `dist/client/` und `dist/server/`. `dev`, `build`, `start`, `preview`, AMP und Runtime-Paket verwenden denselben Vertrag. Die früheren `build:germany`-/`start:germany`-Aliase leiten nur noch darauf weiter und starten kein zweites Produkt.

## Einrichten und starten

Neue Git-/AMP-Installation: `node scripts/install-germany.mjs`. Dieser ausdrückliche Einrichtungsschritt installiert das Spiel, das festgelegte vollständige Geodatenpaket und die dazu passenden lokalen Werkzeuge. [AMP-Neuinstallation](AMP-NEUINSTALLATION.md).

Bereits vorhandene Deutschlanddaten: `node scripts/amp-setup.mjs` für Programmupdates, anschließend `npm start` oder `node scripts/start-germany.mjs`. Der gewöhnliche Build verarbeitet keine neuen Geodaten. Die laufende Website, Suche und Simulation benötigen das konfigurierte lokale Datenpaket und dessen Router.

`.env.germany` hat Vorrang vor `.env`. `DATA_DIR` und `GEODATA_DIR` müssen getrennte externe dauerhafte Pfade sein. Tatsächlichen AMP-Port und öffentliche Adresse eintragen. [Konfiguration, Sicherung und Fehlerdiagnose](AMP.md).

## Karte und Spiel

Die Karte lädt Vektorkacheln nach sichtbarem Ausschnitt und Zoom. Orte, Straßen, Einrichtungen und Gebietsnamen stammen aus dem installierten Paket. In der oberen Hauptleiste öffnet **Karte** die Werkzeuge. Suche findet Orte sowie eigene Spielobjekte. **Ganz Deutschland**, Zentrieren, Mausrad, Pfeiltasten bei Kartenfokus, Ebenenfilter und Fahrzeugfolgen ergänzen das freie Verschieben.

Routen, verbleibende Strecke, Fahrzeit und aktuelle Geschwindigkeit verwenden dasselbe serverseitige Fahrmodell. Gefahren, Straßensperren, Wetter und Fahrzeugzustand wirken auf reale Anfahrten. Fehlende Geodaten erzeugen keine erfundenen Ersatzorte. Bei Verbindungsverlust bleibt der zuletzt bestätigte Stand sichtbar; neue Spielaktionen benötigen den Server.

Konturmarkierungen für geografische Einrichtungen sind von gekauften Spielgebäuden getrennt. Sie behaupten keine reale Besatzung oder verfügbare Klinikbetten. Spielprofile und Aufnahmekapazitäten bleiben ausdrücklich Simulationswerte.

## Daten und Altbestand

Weltkennung `germany-1`, Datensatz und Schema werden vor schreibenden Änderungen geprüft. Vorhandene Deutschlandstände bleiben über die versionierten Migrationen kompatibel. Fiktive Falkenried-/Rivermere-Koordinaten haben keine verlässliche deutsche Entsprechung. Die alte SQLite-Datenbank lässt sich unverändert exportieren; sie wird nicht als Deutschlandstand gestartet. [Formate und Entfernungskriterien der Datenbrücken](KOMPATIBILITAET.md).

## Technische Nachweise

- [Lokaler Geodatenvertrag, Bezug und Herkunft](DEUTSCHLAND-DATEN.md)
- [Straßenrouting und installierte Werkzeuge](DEUTSCHLAND-ROUTING.md)
- [Höhenmodell](DEUTSCHLAND-HOEHEN.md)
- [Umfangreiche Datensatz-/Lastprüfungen](DEUTSCHLAND-LASTPRUEFUNG.md)
- [Aktuelle Entwicklungs- und Abnahmeprofile](ENTWICKLUNG.md)
- [Historische Messungen und frühere Produktstände](HISTORIE.md)

Die kleinen automatisierten Deutschland-Fixtures sind technische Daten für wiederholbare Regressionen. Sie ersetzen weder den echten Deutschlanddatensatz noch die gesonderten Parser-/Routing-/DEM-Prüfungen und werden nicht als Spielwelt ausgeliefert.
