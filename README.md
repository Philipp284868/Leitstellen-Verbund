# Leitstellen-Verbund

Eine Leitstellen-Simulation für **PC-Multiplayer auf der Deutschlandkarte**. Website, API, Socket.IO und Simulation laufen auf demselben Node.js-Server. Konten, Geld, Besitz, Fahrzeuge, Einsätze und Historie werden verbindlich in SQLite verwaltet. Der Server arbeitet auch bei geschlossenem Browser weiter.

Es gibt ein aktives Produkt: Deutschland. Kein Einzelspielerbetrieb, keine Smartphone-Oberfläche und keine alte Karte als Ausweichlösung. Die obere Hauptleiste öffnet die benötigten Arbeitsbereiche; eine untere Dauernavigation gibt es nicht.

## Spielen

Notruf annehmen → Angaben erfragen → AAO oder Fahrzeuge auswählen → alarmieren → Ausrücken und Anfahrt verfolgen → FMS, Sprechwünsche und Lagemeldungen bearbeiten → Kräfte nachfordern → Einsatz abschließen → Historie ansehen.

Erhalten sind persönliche Tutorials und getrennte Übungsdaten, automatische Wachbesetzung, FF-Anreisen, BF-Ausbau, reale Straßenfahrten mit ETA und Geschwindigkeit, Fahrzeugdefekte und Nachbereitung, Funkdisziplin, gemeinsame Einsatzlagen, Katastrophenschutz, Euro-Wirtschaft, Fortschritt, Audio und eigene lokale Sounds. Unterschiedliche Leitstellen erhalten neue Einsätze nicht automatisch. Zusammenarbeit erfolgt über berechtigte Disponenten derselben Leitstelle und ausdrückliche Nachbarhilfe.

Die geografische Karte verwendet das lokal installierte Deutschland-Datenpaket. Karteneinträge sind keine automatisch verfügbaren Spielgebäude; reale Personalstärken und Klinikkapazitäten werden nicht aus Kartenmarkern behauptet.

## Aus GitHub installieren

Für eine neue AMP-Instanz: Node.js **24**, Branch **main**, Setup **`node scripts/install-germany.mjs`**, App Name **`scripts/start-germany.mjs`**. Die ausdrücklich gewählte Erstinstallation lädt auch das große festgelegte Geodatenpaket und passende Routingwerkzeuge. [Vollständige Neuinstallation](docs/AMP-NEUINSTALLATION.md).

Für einen vorhandenen Deutschlandbestand aktualisiert `node scripts/amp-setup.mjs` nur Programm und Abhängigkeiten. Ein gewöhnlicher Build lädt keine Deutschlanddaten. `PORT` muss dem echten AMP-Port entsprechen; `DATA_DIR` und `GEODATA_DIR` müssen getrennte dauerhafte Ordner außerhalb des Programmverzeichnisses sein. [Betrieb, Konfiguration, Sicherung](docs/AMP.md).

Alle normalen Befehle verwenden denselben Produktpfad:

- `npm run build`: `dist/client/` und `dist/server/`, einschließlich Typprüfung und Bundlebudgets.
- `npm start` / `npm run preview`: Deutschland samt passend konfiguriertem lokalen Router.
- `npm run dev`: Hot Reload und inkrementeller Serverbuild mit getrennten Entwicklungsdaten.
- `node dist/server/cli.js`: Wartung derselben Deutschlandinstallation.

Fehlende Daten, falsche Welt oder unpassender Datensatz führen zu einem Fehler. Alte fiktive Koordinaten werden nicht umgedeutet. Falkenried-/Rivermere-Bestände bleiben vollständig und unverändert [exportierbar](docs/KOMPATIBILITAET.md); das aktuelle Produkt baut keine alten Spielwelten.

## Entwicklung und Abnahme

Direkt auf `main` in geprüften Schritten arbeiten; fremde Änderungen und Schutzregeln respektieren. Kein Force-Push, Datenreset oder Produktionsupdate durch einen Push. [Beitragsregeln](CONTRIBUTING.md) · [Entwicklungsanleitung](docs/ENTWICKLUNG.md).

GitHub wählt anhand klarer Ausgangs-/Zielcommits zwischen Dokumentationsprüfung, schneller Rückmeldung, vollständiger Abnahme und vertiefter Lastprüfung. Gemeinsame Grundlagen und unbekannte Änderungen erhalten die volle Prüfung. Beide Browserengines bleiben unterstützt. Fehlende Pflichtjobs oder Testdateien verhindern den Gesamtstatus.

Ein Release benötigt vollständige Abnahme, Sicherheit und passende Build-/Paketprüfsummen für exakt den aktuellen main-Commit. Eine Schnellprüfung genügt nicht. Der manuelle Releaseworkflow übernimmt das tatsächlich geprüfte Runtime-Paket und erstellt nur einen Entwurf. [Runtime-Vertrag](docs/RUNTIME-PAKET.md) · [Messungen](docs/TESTLAUFZEITEN.md) · [Zuordnung der Testanforderungen](docs/TESTMIGRATION.json).

## Anleitungen

- [Menüs und Bedienwege](docs/MENUES.md) · [Spielanleitung](docs/SPIELANLEITUNG.md)
- [Deutschlandkarte](docs/DEUTSCHLAND.md) · [Geodaten](docs/DEUTSCHLAND-DATEN.md) · [Routing](docs/DEUTSCHLAND-ROUTING.md)
- [Einsatzarbeitsplatz](docs/EINSATZARBEITSPLATZ.md) · [Funk](docs/FUNK.md) · [Weltlagen und Einsatzorte](docs/WELTLAGEN-UND-EINSATZORTE.md)
- [Euro-Wirtschaft](docs/EURO-WIRTSCHAFT.md) · [Wachbesetzung](docs/GEBAEUDEBESETZUNG-2.21.md) · [Tutorial](docs/TUTORIAL-2.21.md) · [Audio](docs/AUDIO.md)
- [Sicherheit](SECURITY.md) · [Lizenzen](docs/LIZENZEN.md) · [Historische Berichte und Bilder](docs/HISTORIE.md)
- [Fehler melden](https://github.com/Philipp284868/Leitstellen-Verbund/issues/new/choose) · [Community](https://github.com/Philipp284868/Leitstellen-Verbund/discussions) · [Releases](https://github.com/Philipp284868/Leitstellen-Verbund/releases)

Die Wiki-Quellen unter `docs/wiki/` werden im Repository gepflegt. Ihre separate Veröffentlichung folgt dem [Wiki-Verfahren](docs/WIKI-VEROEFFENTLICHUNG.md); ein Quellcode-Push behauptet keine bereits erfolgte Aktualisierung der externen Wiki oder eines privaten AMP-Servers.
