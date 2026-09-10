# Serverbetrieb und Bestandsschutz

**Deutschland komplett installieren:** In AMP Node.js 24, Git-Branch `main`, npm Install Type `None`, Setup `node scripts/install-germany.mjs` und App Name `scripts/start-germany.mjs` verwenden. Das fertige Deutschlandpaket wird automatisch aus GitHub geladen und vollständig geprüft. `.env.germany` erhält neue getrennte Datenpfade; ein eigener Import oder manueller Geodatentransfer ist nicht mehr erforderlich. [Schrittweise AMP-Anleitung](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/AMP-NEUINSTALLATION.md). Rund 8 GB Download, 15,6 GB entpackt; mindestens 25 GB freien Speicher für die Installation vorsehen.

Node.js 24 liefert Website, API, Socket.IO und Simulation auf einem Port. SQLite benötigt eine dauerhafte DATA_DIR außerhalb des Programmverzeichnisses. Eine Instanz pro Datenverzeichnis. PORT muss zur AMP-Zuweisung passen; HTTPS wird über einen korrekt konfigurierten Reverse Proxy betrieben. Die vollständige Feldliste und .env-Anleitung stehen unter docs/AMP.md im Hauptrepository.

Die neue [[Deutschland]]-Instanz benötigt zusätzlich ein vollständiges `GEODATA_DIR` und einen lokalen GraphHopper-Router. Einstieg `scripts/start-germany.mjs`, CLI `dist/server/cli.js`. Alle normalen Build- und CLI-Pfade gehören ausschließlich zu Deutschland. Ein Weltwechsel benötigt einen getrennten Spielordner und eine bewusste Betreiberentscheidung; kein Git-Update setzt Kartenobjekte um.

Update: Server kontrolliert stoppen → konsistente Sicherung erstellen → konkret geprüften main-Stand installieren → Setup/Build prüfen → starten und Verbindung kontrollieren. Ein Git-Push löst kein Produktionsupdate aus.

Sicherung: `node dist/server/cli.js backup`. Die Konfiguration wird aus der Programmwurzel geladen; `.env.germany` hat Vorrang vor `.env`. Validierende Deutschland-Wartung benötigt passende Geodaten und den lokalen Router; falls dieser sonst vom Launcher verwaltet wird, für die Wartung separat `node scripts/geodata/pipeline.mjs serve` starten und anschließend regulär beenden. Wiederherstellung nur bei gestopptem Spielserver nach der [AMP-Anleitung](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/AMP.md); Sitzungen werden dabei widerrufen. Passendes Geodatenmanifest und Datenpaket getrennt von Kontensicherungen aufbewahren.

Alte Einzelspielerstände bleiben als inaktive `solo_saves` erhalten; ihre Geldwerte werden konsistent nach Eurocent migriert. Eigener Export unter Sicherungen oder offline mit `node dist/server/cli.js archive-export --username NAME --file NEUE-DATEI.json`. Bestehende Ausgabedateien werden nicht überschrieben. Archive sind keine spielbaren Modi und dürfen nicht in die Multiplayer-Wirtschaft übernommen werden. Ein Backup der gesamten Datenbank enthält sie weiterhin.

## Migration 2.21 auf Schema 14

Nach Stopp, Sicherung und erfolgreichem Build **vor dem ersten Start** `node dist/server/cli.js migration-preview` ausführen. Die Vorschau öffnet SQLite nur lesend und zeigt Zielversion, betroffene Bestände, XP, Geldsummen, Kaufkraftausgleich und Personalübernahme. Sie führt keine Migration aus. Bestehender Datenordner und Routervoraussetzung bleiben wie oben.

Beim regulären Start erzeugt SQLite eine konsistente `pre-migration-v2-*.sqlite`. Der historische Dateipräfix sagt nichts über die Zielversion aus. Schema 14 konvertiert Guthaben, Journal, vollständige Archivberichte und Auszahlungsbelege in einer gemeinsamen geprüften Transaktion. 1 alter Credit entspricht als Designentscheidung 10 Spiel-Euro; separat kommen einmalig 60 % des umgerechneten freien Altguthabens als Kaufkraftausgleich hinzu. Beispiel: 250.000 alte Credits werden insgesamt 4.000.000,00 €. Eine zweite Migration oder Wiederverbindung zahlt nichts erneut. [[Wirtschaft]] beschreibt die genaue Rechnung und sechs Finanzierungsszenarien.

Vorhandene Käufe, Orte, Fahrzeugbindungen, Wege und XP bleiben geschützt. Alte laufende Vergütungszusagen werden umgerechnet erhalten, alte bezahlte Qualifikationen ohne weitere Gebühren übernommen. Tutorialfortschritt und persönliche Übungen stehen in den separaten Tabellen `tutorial_progress` und `training_worlds`; deren Eigentümer ist der jeweilige Benutzer, nicht die gemeinsame Leitstelle. Reguläre DB-Sicherungen enthalten diese Tabellen. Eigene Audiodateien und Geräteeinstellungen brauchen dagegen ihre lokale Sicherung; siehe [[Audio-und-Einstellungen]].

Welt-/Deutschland-Datensatzkennung bleiben unverändert. Kein Geodaten-Neuimport oder Datenreset ist nötig. Ein Downgrade benötigt alte Software und passende Vorabsicherung zusammen; alte Software nicht gegen Schema 14 starten. Historische Testberichte bestätigen keine aktuelle Release-Prüfung.

Altwelten vor dem ersten schreibenden Zugriff erkennen und sichern: `node dist/server/cli.js retired-export --source /ALTER/ORDNER --file /NEUE/SICHERUNG.sqlite`. Hierfür werden keine Deutschland-Geodaten benötigt. [Formatgrenzen und Entfernungskriterien](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/KOMPATIBILITAET.md).

Keine privaten Spielstände, Tokens oder personenbezogenen Logs in GitHub veröffentlichen. Secret Scanning ersetzt nicht die Verantwortung für die private Datenablage.

## Schema 15–18

Die neueren Migrationen ergänzen FFW-Bereitschaftskerne und tatsächliche KatS-Anreisen (15), geordneten Funk und Fahrzeugwünsche (16), gemeinsame Weltlagen (17) sowie Ortsprüfung und Zufahrtsreferenzen (18). Der vorhandene Vorabsicherungs- und Vorschauweg bleibt bestehen. Alte Software nicht gegen Schema 18 starten; ein Downgrade benötigt die passende alte Software samt Vorabsicherung. Weltidentität und Geodaten bleiben erhalten. Technische Standortprüfungen können Fälle vorübergehend pausieren, während belegte Zufahrten geprüft werden; laufende Patiententransporte bleiben bestehen.

[Details und Host-CLI](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/WELTLAGEN-UND-EINSATZORTE.md).
