# Technische Betriebsdetails

Der aktive Einstieg für Betreiber ist [AMP-Schnellstart](AMP-SCHNELLSTART.md). Die folgenden Befehle sind für eine vorhandene Betriebssystem-Konsole beziehungsweise betreute Wartung gedacht; die AMP-Node-Konsole ist keine allgemeine Shell.

## Konfiguration und Identität

`scripts/configuration.mjs` ist der gemeinsame schreibfreie Resolver für Setup, Launcher, Server, CLI und Diagnose. Pfade werden gegen die reale Programmwurzel aufgelöst, nicht gegen das aufrufende Arbeitsverzeichnis. Standardport ist 7777; es gibt keinen Ausweichport.

Netzwerte aus der Prozess-/AMP-Umgebung überschreiben Dateieinträge. Setup, Start und Diagnose zeigen die Quelle insbesondere für `PORT` und `PUBLIC_URL`. Abweichende `DATA_DIR`/`GEODATA_DIR`-Umgebungswerte werden bei bekannten Installationen abgelehnt. Die alten Namen `GERMANY_DATA_DIR` und `GERMANY_GEODATA_DIR` werden kontrolliert als Pfadangabe gelesen; widersprüchliche Werte sind Fehler. Pfadänderungen an einer gebundenen Installation benötigen eine gesonderte betreute Datenverschiebung, kein Setup-Flag erzwingt sie.

Die Zuordnung liegt im Geschwisterordner `.leitstellen-instances/<Programmname>-<Hash des absoluten Programmpfads>/installation.json`. Pro neue Instanz werden darin `game/` und `geodata/` gewählt. Absolute Programmwurzel, Instanz-ID, Datenpfade, Welt und bekannte Datenkennung sind gebunden; ein Marker im Spielordner verhindert die Übernahme durch eine andere Instanz. Ein Programmordner-Umzug wird daher nicht still als dieselbe Installation behandelt.

Linux-Verzeichnisse erhalten Modus 700, private Dateien 600. Auf Windows muss zusätzlich die Vererbung der lokalen Benutzerrechte passen. Gültige Konfigurationen und vorherige Migrationsdateien werden mit Inhaltsfingerabdruck gesichert. Veröffentlichung erfolgt über eine temporäre Datei, fsync und atomisches Umbenennen. Fehlerhafte neue Konfigurationen überschreiben keine letzte gültige Sicherung. Nach dem ersten erfolgreichen Datenbankstart verhindert die Zuordnung eine unbemerkte Ersatzwelt bei fehlender `game.sqlite`.

## Schreibfreie Diagnose und Wiederherstellung

```sh
node scripts/diagnose.mjs
```

Benötigt nur Node.js 24 und Repository-Skripte, keinen Build und keine `.env`. Zeigt notwendige Konfigurationsquellen, Pfade, Welt-/Datenstatus und nächsten Schritt. Beliebige Konfigurationswerte, Passwörter, Cookies oder Schlüssel werden nicht ausgegeben. Keine Migration, kein Entsperren, kein Reset. Bei einem WAL-Bestand ohne vorhandene SHM-Datei wird nicht versucht, SQLite-Koordinationsdateien anzulegen; Server sauber stoppen und Bestand prüfen.

Eindeutig gebundene gültige Installation: denselben normalen Setup-Befehl ausführen. Für einen validierten älteren Bestand ohne vertrauenswürdige Zuordnung:

```sh
node scripts/install-germany.mjs --recover-data "/tatsaechlich/gepruefter/spielordner" --recover-geodata "/tatsaechlich/passendes/geodatenpaket" --confirm-recovery
```

Das sind Syntaxbeispiele; ausschließlich zuvor geprüfte echte Pfade einsetzen. Die Wiederherstellung öffnet bestehende Daten nur lesend. Falsche Welt, neueres Schema, defekte Datenbank, leeres Paket, unpassender Datensatz, fremde Installation oder überlappende Pfade werden abgewiesen.

Bei absichtlich unterschiedlichen alten Dateien zunächst beide lesen. Die gemeinsame Fehlermeldung nennt die betroffenen Schlüssel ohne geheime Werte. Werte manuell abgleichen oder nach eigener Prüfung `node scripts/install-germany.mjs --prefer-legacy` ausführen: sichert beide Dateien, übernimmt ausdrücklich die alten Deutschlandwerte, entfernt keine Spieldaten und archiviert die alte aktive Datei. Kein automatischer Vorrang einer widersprüchlichen Datei.

## Caddy und Netzwerk

Die [Vorlage](../Caddyfile.example) verwendet den bestehenden Zertifikatsspeicher. Ihr Admin-Endpunkt ist ausschließlich `127.0.0.1:2019`. Für Prüfung über eine vorhandene Betriebssystem-Konsole:

```sh
caddy validate --config Caddyfile.example --adapter caddyfile
```

Bei getrennten Containern zuerst vom Caddy-Netz aus den veröffentlichten Spielendpunkt prüfen. `X-Real-IP` wird aus der tatsächlich an Caddy ankommenden Verbindung überschrieben. Der Spielserver vertraut diesem Header nur bei exakt konfiguriertem unmittelbarem Proxy. Keine öffentlichen Admin-Ports, keine TLS-Prüfungsabschaltung, kein API-/Session-Caching. Socket.IO verwendet dieselbe Origin mit WebSocket und HTTP-Polling.

Die internen Portoptionen ändern keine öffentlichen Browserports. Sie sind für Weiterleitungen von 80/443 auf andere interne Ports vorgesehen. [Caddy-Portoptionen](https://caddyserver.com/docs/caddyfile/options) · [Reverse Proxy und WebSocket](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) · [Konfigurationsprüfung](https://caddyserver.com/docs/command-line#caddy-validate).

## Datenbanksicherung und Updates

Bei gestopptem Spiel und bereitgestelltem passendem Router: `node dist/server/cli.js backup`. `node dist/server/cli.js migration-preview` prüft eine anstehende Migration. Vor einem Schemawechsel erstellt die bestehende Datenbankmigration eine vollständige Sicherung; die Migration bleibt transaktional. Datenordner, Konfiguration, äußere Installationszuordnung und passendes Geodatenpaket getrennt vom Programm sichern.

Wiederherstellung bei gestopptem Spiel: `node dist/server/cli.js restore --file /ABSOLUTE/SICHERUNG.sqlite --confirm`. Dabei gelten die bestehenden Welt-/Datensatzprüfungen und Sitzungswiderrufe. Eine Rückkehr zu älterem Programmcode ist nicht automatisch ein Datenbank-Downgrade: gegebenenfalls zusammengehörigen Code, Backup und Geodatenstand wiederherstellen. [Kompatibilität](KOMPATIBILITAET.md) · [Datenpaket](DEUTSCHLAND-DATEN.md).

Ein Start lädt weder Werkzeuge noch Geodaten herunter und führt keine Tests aus. Der Launcher besitzt nur seine eigenen Unterprozesse und wartet auf deren kooperativen Stopp; fremde Caddy-/Java-/Spielprozesse werden nicht beendet. Bei Routerausfall endet auch der eigene Spielprozess. Ein separat gesetzter `GRAPHHOPPER_URL` wird vor Spielbereitschaft gegen die erwartete Importkennung geprüft.
