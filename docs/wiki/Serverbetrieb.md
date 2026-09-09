# Serverbetrieb und Bestandsschutz

**Deutschland komplett installieren:** In AMP Node.js 24, Git-Branch `main`, npm Install Type `None`, Setup `node scripts/install-germany.mjs` und App Name `scripts/start-germany.mjs` verwenden. Das fertige Deutschlandpaket wird automatisch aus GitHub geladen und vollständig geprüft. `.env.germany` erhält neue getrennte Datenpfade; ein eigener Import oder manueller Geodatentransfer ist nicht mehr erforderlich. [Schrittweise AMP-Anleitung](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/AMP-NEUINSTALLATION.md). Rund 8 GB Download, 15,6 GB entpackt; mindestens 25 GB freien Speicher für die Installation vorsehen.

Node.js 24 liefert Website, API, Socket.IO und Simulation auf einem Port. SQLite benötigt eine dauerhafte DATA_DIR außerhalb des Programmverzeichnisses. Eine Instanz pro Datenverzeichnis. PORT muss zur AMP-Zuweisung passen; HTTPS wird über einen korrekt konfigurierten Reverse Proxy betrieben. Die vollständige Feldliste und .env-Anleitung stehen unter docs/AMP.md im Hauptrepository.

Die neue [[Deutschland]]-Instanz benötigt zusätzlich ein vollständiges `GEODATA_DIR` und einen lokalen GraphHopper-Router. Einstieg `scripts/start-germany.mjs`, CLI `dist/germany/server/cli.js`. Die bisherigen `dist/server`-Pfade unten gelten für Rivermere. Ein Weltwechsel benötigt einen getrennten Spielordner und eine bewusste Betreiberentscheidung; kein Git-Update setzt Kartenobjekte um.

Update: Server kontrolliert stoppen → konsistente Sicherung erstellen → konkret geprüften main-Stand installieren → Setup/Build prüfen → starten und Verbindung kontrollieren. Ein Git-Push löst kein Produktionsupdate aus.

Sicherung: `node dist/server/cli.js backup` für Rivermere, `node dist/germany/server/cli.js backup` für Deutschland. Wiederherstellung nur bei gestopptem Server nach der dokumentierten CLI-Anleitung; Sitzungen werden dabei widerrufen. Vor notwendigen Schemaänderungen wird automatisch ein Vorabbackup angelegt. Schema12 sowie eine zusätzliche Deutschland-Datensatzkennung schützen die Weltidentität. Passendes Geodatenmanifest und Datenpaket getrennt von Kontensicherungen aufbewahren.

Alte Einzelspielerstände verbleiben unverändert als inaktive solo_saves. Eigener Export im Spiel unter Sicherungen oder offline mit `node dist/server/cli.js archive-export --username NAME --file NEUE-DATEI.json`. Bestehende Ausgabedateien werden nicht überschrieben. Archive sind keine spielbaren Modi und dürfen nicht in die Multiplayer-Wirtschaft übernommen werden. Ein Backup der gesamten Datenbank enthält sie weiterhin.

Keine privaten Spielstände, Tokens oder personenbezogenen Logs in GitHub veröffentlichen. Secret Scanning ersetzt nicht die Verantwortung für die private Datenablage.
