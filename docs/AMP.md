# Leitstellen-Verbund: Deutschland auf AMP

Das einzige aktive Produkt ist das Deutschlandspiel für PC-Multiplayer. Alle normalen Builds erzeugen `dist/client/` und `dist/server/`. Start: `scripts/start-germany.mjs` oder `npm start`. Es gibt keinen alten Weltstart als Ausweichlösung.

## Neue Instanz aus GitHub

Die vollständigen Felder und Datenpaketvoraussetzungen stehen in [AMP-Neuinstallation](AMP-NEUINSTALLATION.md).

| AMP-Feld | Wert |
|---|---|
| Git-Repository | `https://github.com/Philipp284868/Leitstellen-Verbund.git` |
| Branch | `main` |
| Node.js | `24` |
| npm Install Type | `None` |
| Run App Setup Commands | aktiviert |
| App Setup Commands | `node scripts/install-germany.mjs` |
| App Name | `scripts/start-germany.mjs` |
| App Installation Location | leer |
| Pre-start Commands | deaktiviert |

Die ausdrückliche Neuinstallation lädt das festgelegte Deutschland-Datenpaket und die Routingwerkzeuge. Unterbrechungen werden fortgesetzt, Dateien anhand ihrer Prüfsummen kontrolliert. Der gewöhnliche Update-/Buildbefehl `node scripts/amp-setup.mjs` baut dagegen nur das Programm und installiert keine neuen Geodaten. Wiederholtes Setup überschreibt keine bestehende Konfiguration oder Datenbank.

## Konfiguration und Netz

`.env.germany` hat Vorrang; sonst wird `.env` verwendet. `DATA_DIR` und `GEODATA_DIR` müssen getrennte absolute dauerhafte Ordner **außerhalb des Programmverzeichnisses** bezeichnen. Die Pfade müssen aus Sicht der AMP-Anwendung beziehungsweise ihres Containers stimmen. Keine Datenbank im Git-Checkout ablegen.

```dotenv
HOST=0.0.0.0
PORT=7777
PUBLIC_URL=https://leitstelle.example.org
DATA_DIR=/AMP/persistent/leitstellen-deutschland
GEODATA_DIR=/AMP/persistent/deutschland-geodaten
TRUSTED_PROXIES=
ALLOW_HTTP=false
```

Der Port ist nur ein Beispiel: `PORT` muss dem tatsächlich zugewiesenen AMP-Port entsprechen. Container-Portfreigabe, Firewall und Reverse Proxy müssen dorthin zeigen. `PUBLIC_URL` ist die tatsächliche Adresse einschließlich Schema und gegebenenfalls Port. Website, API und Socket.IO verwenden denselben Ursprung. Der Reverse Proxy muss WebSocket-Upgrades weiterleiten. In `TRUSTED_PROXIES` ausschließlich die unmittelbaren bekannten Proxy-Adressen eintragen.

Für öffentliche Nutzung HTTPS konfigurieren. Eine ausdrückliche HTTP-Ausnahme für ein privates Testnetz verwendet `ALLOW_HTTP=true`. Es gibt weder ein Standardpasswort noch einen Standardadministrator. Neue Konten sind normale Spieler; unabhängige Leitstellen erhalten keine automatische Einsatzfreigabe.

`scripts/start-germany.mjs` prüft Welt-/Datensatzkennung und startet den passenden lokalen Router, sofern er nicht ausdrücklich über `GRAPHHOPPER_URL` separat verwaltet wird. Ein belegter fremder Router oder ein unpassender Datensatz wird nicht still übernommen. [Routingvertrag](DEUTSCHLAND-ROUTING.md).

## Update, Sicherung und Wiederherstellung

1. Anwendung regulär stoppen. Konfiguration und konsistente Sicherung behalten.
2. Den geprüften main-Commit installieren. Für vorhandene Deutschlanddaten `node scripts/amp-setup.mjs` ausführen.
3. Schreibgeschützte Vorschau: `node dist/server/cli.js migration-preview`. Dafür dieselbe Konfiguration und passende Deutschlanddaten wie beim normalen Start verwenden.
4. Anwendung starten und Anmeldung, Wachenbestand, Guthaben und Verbindung prüfen.

Die Datenbank prüft Kopf, Schema, Welt und Datensatz vor schreibender Öffnung. Vorhandene Deutschland-Schemata werden mit den bestehenden transaktionalen Sicherungs- und Migrationsregeln fortgeführt. Ein alter fiktiver Weltstand wird abgewiesen. Ihn zuerst über die [begrenzte Datenbrücke](KOMPATIBILITAET.md) unverändert exportieren; Gebäude und Fahrten werden nicht nach Deutschland verschoben.

Offline-Sicherung: `node dist/server/cli.js backup`. Wiederherstellung bei gestoppter Anwendung: `node dist/server/cli.js restore --file /ABSOLUTE/SICHERUNG.sqlite --confirm`. Quelle und Ziel müssen zum gleichen Deutschland-Datensatz gehören. Die Wartungssperre niemals bei laufendem Server entfernen; `unlock` ist ausschließlich für nachweislich verwaiste Sperren vorgesehen.

Eigener früherer Einzelspielerbestand bleibt ein inaktives Archiv. `archive-export --username NAME --file NEUE-DATEI.json` exportiert ihn, ohne ein bestehendes Ziel zu überschreiben oder Geld in den Multiplayer zu übernehmen. [Wirtschaftsmigration](EURO-WIRTSCHAFT.md) · [Automatische Besetzung](GEBAEUDEBESETZUNG-2.21.md).

## Fehlersuche

- Fehlende Datenpfade: vorhandene Konfiguration im tatsächlichen AMP-Programmordner und aus Sicht des Containers prüfen.
- Fehlendes oder unvollständiges Geodatenmanifest: ausdrückliche Datenpaketinstallation abschließen; kein UI-Build erzeugt Ersatzdaten.
- Falsche Welt oder Datenkennung: alten Stand sichern, die passende Konfiguration beziehungsweise das passende Paket verwenden.
- Verbindungsfehler: tatsächliche öffentliche Adresse, Portzuordnung, Proxy-/WebSocket-Weiterleitung prüfen.
- Kein Ton: Audio nach einer bewussten Bedienaktion aktivieren und Geräteeinstellungen prüfen; Audiofehler dürfen die Simulation nicht blockieren.

Git-Pushes führen keine Produktionsinstallation, Migration, Löschung oder automatische stabile Veröffentlichung aus. [Runtime-Paket](RUNTIME-PAKET.md) · [Entwicklung](ENTWICKLUNG.md) · [Historische Betriebsberichte](HISTORIE.md).
