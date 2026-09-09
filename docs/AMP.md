# Leitstellen-Verbund auf CubeCoders AMP · Version 2.21

## Update und Migration auf Schema 14

Version 2.21 ergänzt Eurocent, neue Spielpreise, automatische Gebäudebesetzung und persönliche Tutorial-/Übungsdaten. Dafür sind **keine neuen AMP-Felder, kein Geodaten-Neuimport und kein Weltwechsel** erforderlich. Die [vollständige Wirtschaftsdokumentation](EURO-WIRTSCHAFT.md) erklärt Quellen, Preise und sechs Finanzierungsszenarien; [Wachbesetzung](GEBAEUDEBESETZUNG-2.21.md), [Tutorial](TUTORIAL-2.21.md) und [Audio](AUDIO.md) beschreiben die weiteren Änderungen.

1. Anwendung regulär stoppen. Bestehende Konfiguration und eine konsistente Datenbanksicherung behalten; das aktuelle Programm darf nicht gleichzeitig dieselbe Datenbank öffnen.
2. Den konkret geprüften Programmstand installieren und den bisherigen Setup-Befehl vollständig abschließen. **Vor dem ersten Spielstart** kann die neue CLI die Migration schreibgeschützt planen.
3. Für Deutschland aus der Programmwurzel `node dist/germany/server/cli.js migration-preview` verwenden. Sie lädt die vorhandene `.env.germany` (ohne diese Datei die ausdrücklich gesetzte bisherige Konfiguration). Die passenden Geodaten und der lokale Router müssen für validierende Wartungsbefehle verfügbar sein; beim vom Launcher verwalteten Router separat `node scripts/geodata/pipeline.mjs serve` starten. Für Rivermere gilt `node dist/server/cli.js migration-preview` mit der bestehenden `.env`.
4. Vorschau prüfen: Zielversion 14, betroffene Spielstände, alte/neue XP, Währungs- und Ausgleichssummen sowie Personalübernahme. Die Vorschau schreibt keine Spieldaten und nimmt keine Migration vor. Anschließend einen nur für die Wartung gestarteten Router regulär beenden, bevor der normale Launcher seinen eigenen Router startet.
5. Regulär starten. Vor der Migration entsteht eine konsistente SQLite-Sicherung `pre-migration-v2-*.sqlite`; der historische Dateipräfix bedeutet nicht Zielversion 2. Schema 14 wird in einer gemeinsamen Transaktion mit Summen-/Validierungsprüfung geschrieben. Bei einem Fehler bleibt diese Migration zurückgerollt. Den Fehler prüfen, keine Datenbank-/WAL-Dateien löschen.
6. Nach Anmeldung Guthaben, Journal, laufende Aufträge, Fahrzeuge und Betriebsbereitschaft kontrollieren. Erneuter Start oder Wiederverbindung darf weder Umrechnung noch Kaufkraftausgleich wiederholen.

**Konkrete Geldumstellung:** 1 alter Credit = 10 Spiel-Euro = 1.000 Cent ist eine festgelegte Designentscheidung. Preisversion 1 ist davon getrennt und ergänzt einmalig 60 % des umgerechneten freien Altguthabens als eigene Buchung. Beispiel: 250.000 alte Credits → 2.500.000,00 € Umrechnung + 1.500.000,00 € Bestandsschutz = 4.000.000,00 €. XP werden nicht in Geld umgerechnet. Vorhandene Käufe werden nicht nachberechnet; laufende Einsätze behalten die alte zugesagte Nominalvergütung in der neuen Einheit. [Exakter Migrationsvertrag](EURO-WIRTSCHAFT.md#centmodell-und-getrennte-migration).

Auch inaktive `solo_saves`, vollständige Archivberichte und Auszahlungsbelege werden in der neuen Geldeinheit konsistent erhalten. Alte bezahlte Qualifikationen werden ohne erneute Rechnung übernommen; Personen, Verletzungen, Fahrzeugbindungen, Orte und Wege bleiben geschützt. Neue Tabellen `tutorial_progress` und `training_worlds` speichern private Lernstände außerhalb gemeinsam genutzter Leitstellen. Ein Übungsreset ist kein Serverreset. Audioregler und eigene Audiodateien bleiben lokale Browserdaten und gehören nicht zum SQLite-Backup.

Ein Downgrade benötigt die zusammengehörige alte Software und Vorabsicherung; alte Software niemals gegen Schema 14 starten. Historische Testberichte sind keine Freigabe des neuen Builds. Die finalen Prüfungen müssen zum tatsächlich installierten Commit gehören.

## Deutschland-Neuinstallation

**Für eine neue Deutschland-Instanz die [Einrichtung mit einem Setup-Befehl](AMP-NEUINSTALLATION.md) verwenden:** App Setup Commands `node scripts/install-germany.mjs`, App Name `scripts/start-germany.mjs`. Das lädt auch die vollständigen Geodaten aus GitHub herunter und erstellt `.env.germany` mit getrennten Datenpfaden. Die folgende ältere Feldliste gilt für bestehende Rivermere-Installationen.

Für eine neue Deutschland-Instanz gilt die [Deutschland-Anleitung](DEUTSCHLAND.md): fertig vorbereitete echte Geodaten, getrenntes `DATA_DIR`, eigenes `GEODATA_DIR` und App Name `scripts/start-germany.mjs`. Das reguläre Setup baut beide Programme. Die folgenden bisherigen `dist/server/…`-Pfade bleiben für vorhandene Rivermere-Installationen bestehen. Ein Update wechselt die Welt nicht automatisch.

## Aktueller Spielmodus

Einzelspielerarchive bleiben erhalten und werden nicht weiter simuliert. Export unter Sicherungen oder CLI `archive-export`; kein Import in die Multiplayer-Wirtschaft. Historische Migrationsabschnitte unten beschreiben ältere Versionen.

## Historische Updatehinweise 2.4–2.10

Die folgenden vier Absätze beschreiben die damaligen Änderungen. Aktuell gelten PC-Multiplayer, automatische Wachbesetzung und Schema 14 wie oben beschrieben.

**Update 2.10.0 / Phase 4:** Großlagenführung, MANV und Flächenlagen verwenden Schema 9. Die Migration sichert den vorherigen Stand und erhält beide Spielmodi samt laufenden Alarmierungen. Keine neuen AMP-Felder oder Umgebungsvariablen; regulär stoppen, sichern, `main` aktualisieren, Setup abschließen und starten. [Phase-4-Betrieb und Grenzen](PHASE-4.md).

Version 2.6 vergrößert die Region und stellt beide Modi auf Echtzeit. [Updatehinweise zu Schema 5](VERSION-2.6.md). Das normale Update genügt; die bestehende Stadt bleibt an ihrem Platz.

Version 2.5 ergänzt [Musik und Soundeffekte](AUDIO.md). Das normale Update genügt; Audio benötigt keine zusätzlichen Dateien, Ports oder Einstellungen in AMP.

Version 2.4 ersetzt das Straßenraster durch eine neue Region. [Updatehinweise zur Kartenmigration auf Schema 4](VERSION-2.4.md). Beide Spielstände bleiben erhalten; Standorte werden auf die neuen Straßen übertragen.

## Normale Spielerkonten für alle

Ab Version 2.2 ist die Registrierung offen. Auf der Spielwebsite **Neues Konto erstellen** wählen. Kein Einladungscode, keine Admin-Ersteinrichtung und keine zusätzliche Startdatei. Auch das erste Konto ist nur Spieler. Bestehende Administratoren werden in normale Spieler umgewandelt, ohne Kontokennung, Passwort-Hash oder Spielstand zu verändern. Ihre bisherigen Sitzungen werden einmalig widerrufen. `admin-konto.json` wird nicht mehr verarbeitet oder neu erzeugt. Normale Spieler erhalten keinen Zugriff auf Serverwartung oder fremde Daten.

## AMP-Einträge für bestehendes Rivermere

| Feld                       | Wert                                                       |
| -------------------------- | ---------------------------------------------------------- |
| App Download Type          | Git repo                                                   |
| App Download Source        | `https://github.com/Philipp284868/Leitstellen-Verbund.git` |
| Git Repo Branch            | `main`                                                     |
| Node.js Release Stream     | 24                                                         |
| Node.js Version            | leer                                                       |
| npm Install Type           | None                                                       |
| Run App Setup Commands     | aktiviert                                                  |
| App Setup Commands         | `node scripts/amp-setup.mjs`                               |
| App Name                   | `dist/server/index.js`                                     |
| App Installation Location  | leer                                                       |
| Run App Pre-start Commands | deaktiviert                                                |

`main` ist der einzige reguläre Entwicklungsbranch. Nur konkret geprüfte Commits installieren; ein Entwicklungscommit ist keine automatische stabile Freigabe. Ein neuer Commit wird nicht automatisch auf einer laufenden AMP-Instanz installiert. Stoppen → Aktualisieren → erfolgreichen Setup-/Buildabschluss abwarten → Start. Arbeitsverzeichnis ist die Repository-Wurzel mit `package.json`, `.env` und `scripts/`.

Das Setup benötigt Node 24, lädt die festgelegte pnpm-Version unter `.tools/`, installiert mit der Lockdatei einschließlich Build-Werkzeugen und baut `dist/server/index.js`, `dist/server/cli.js` sowie `dist/client/`. Es überschreibt keine vorhandene `.env` und löscht keine Spieldaten. Runtime-Abhängigkeiten bleiben in `node_modules`; nicht nur einzelne Serverdateien hochladen. Kein Vite-Dev- oder Previewserver wird für den Produktivbetrieb eingesetzt.

## Konfiguration und dauerhafte Daten

Bei neuer Installation `.env.example` nach `.env` kopieren. Vorhandene `.env` behalten. Die Anwendung lädt sie aus der Programmwurzel; bereits gesetzte Umgebungsvariablen haben Vorrang. Beispiel hinter einem lokalen Reverse Proxy, keine ermittelten Serverwerte:

```dotenv
HOST=127.0.0.1
PORT=7777
PUBLIC_URL=https://leitstelle.example.org
DATA_DIR=/srv/leitstellen-data
TRUSTED_PROXIES=127.0.0.1,::ffff:127.0.0.1
ALLOW_HTTP=false
```

`PORT` muss zum tatsächlich zugewiesenen internen AMP-Anwendungsport passen, nicht zum AMP-Verwaltungsport. `PUBLIC_URL` ist die genaue Browseradresse ohne Unterpfad, Benutzerinformationen oder Query. Website, `/api/` und `/socket.io/` liegen unter dieser Adresse. Die vorhandene ausdrückliche HTTP-Testausnahme ändert weder Erreichbarkeit noch Verschlüsselung. Für öffentliche Anmeldung HTTPS verwenden; dieses Update fügt keinen HTTPS-Webserver hinzu und behebt keine davon unabhängigen HTTP-Browserprobleme.

`DATA_DIR` muss für Rivermere ausdrücklich gesetzt sein. Einen absoluten dauerhaften Datenpfad außerhalb des Programmordners eintragen; bei fehlendem Wert startet der Server mit einer konkreten Fehlermeldung nicht. Daten innerhalb des Programmordners werden auch nach Symlink-Auflösung abgelehnt. Nur dem tatsächlichen App-Benutzer Schreibrechte geben. Bei Containern muss der Datenordner dauerhaft vom Host eingebunden sein, beispielsweise Host `/srv/leitstellen-data` nach Container `/data/leitstellen`. Auch ein Ordner neben dem Programmordner muss dauerhaft gemountet sein. Ein Wechsel des Datenpfads ist kein Update und würde eine andere Datenbank verwenden.

## Historischer Hintergrund: Migration auf Schema 2

Vor der Änderung einer vorhandenen Datenbank entsteht eine konsistente Datei `pre-migration-v2-*.sqlite` im Datenordner. Rollenänderung, Widerruf früherer Admin-Sitzungen, Entfernung alter Einladungen und Admin-Auftragsmetadaten sowie Schemawechsel erfolgen transaktional. Wachen, Fahrzeuge, Geld, Personal, Fortschritt, Kontokennung, Benutzername und Passwort-Hash werden dabei nicht umgeschrieben. Datenbankregeln verhindern nachträgliches Einfügen oder Hochstufen von Adminrollen. Ein fehlgeschlagener Migrationsschritt wird zurückgerollt; die Anwendung öffnet dann keinen Spielport.

Keine alte Programmversion gegen Schema 2 starten. Ein Rollback benötigt die passende alte Software und deren konsistente Sicherung zusammen. Frühere Adminrechte können in historischen Sicherungen vorhanden sein, werden aber beim Restore mit Version 2.2 vor dem Spielbetrieb wieder entfernt.

Die Datei `admin-konto.json` sowie `ADMIN-ZUGANG.txt` und die frühere Hilfsdatei werden nicht mehr benötigt oder ausgewertet. Sie werden nicht automatisch gelöscht, damit keine privaten Nutzerdaten ungefragt verschwinden. Eventuell enthaltene alte Klartextpasswörter privat sichern beziehungsweise entfernen; niemals veröffentlichen. `.gitignore` und die HTTP-Auslieferungsbeschränkungen bleiben auch für diese Dateinamen bestehen.

## Netzwerk und HTTPS

Im Container mit Bridge-Netz normalerweise `HOST=0.0.0.0`, damit die Portweiterleitung ankommt. Im Linux-Host-Netzwerkmodus ist keine Portübersetzung nötig. Ein Reverse Proxy leitet Website, API, WebSocket-Upgrades und Socket.IO-Long-Polling an den tatsächlichen Spielport weiter. Bei Betrieb auf demselben Host kann Node an Loopback gebunden werden; öffentlich nur den Proxy erreichbar machen. AMP-Verwaltungszugang bleibt getrennt.

`TRUSTED_PROXIES` enthält ausschließlich unmittelbare Proxy-IP-Adressen, wie Node sie sieht. Eine leere Liste vertraut niemandem. Nur von diesen Adressen wird `X-Real-IP` berücksichtigt; der Proxy muss den Header überschreiben. `X-Forwarded-For` und `X-Forwarded-Proto` werden nicht pauschal vertraut. Cookie-Sicherheit richtet sich nach HTTPS in `PUBLIC_URL`. Private API- und Socketantworten nicht cachen.

## Sicherungen und Offline-Werkzeuge

Die stündlichen konsistenten SQLite-Sicherungen und die Sicherung beim sauberen Stopp bleiben erhalten. Die ehemalige Admin-Schaltfläche ist entfernt und wird nicht für normale Spieler freigeschaltet. Backups werden nicht automatisch gelöscht; Speicherbedarf und Aufbewahrungsfrist überwachen und Kopien auf getrenntem Speicher anlegen. Eine laufende `game.sqlite` nicht allein kopieren, solange WAL aktiv sein kann.

Nur mit Serverzugriff, bei gestoppter Anwendung, unter demselben Benutzer beziehungsweise Container und im selben Programmordner:

```bash
node dist/server/cli.js backup
node dist/server/cli.js restore --file /srv/leitstellen-data/backups/game-ZEIT-ID.sqlite --confirm
```

Für Deutschland beide Befehle mit `dist/germany/server/cli.js` und der unveränderten Deutschlandkonfiguration verwenden; Routervoraussetzung wie oben beachten. Restore prüft Integrität, Schema, Welt-/Datensatzidentität und Kontobesitz, sichert den bisherigen Stand, widerruft Sitzungen und ersetzt die Datenbank. Bekannte Schemata von 1 bis 14 sind grundsätzlich lesbar, **nur wenn Welt und Datenbestand zum Zielprogramm passen**. Das ist keine Freigabe zum Import einer alten fiktiven Welt nach Deutschland. Ältere Rollen werden durch die bekannten Migrationen wieder zu Spielern. Eine Wiederherstellung ersetzt die gesamte gesicherte Welt; sie führt keine Spielstände zusammen. Die optionale `player-create`-CLI legt einen normalen Spieler an und benötigt das Passwort über `--password-stdin`. `admin-create` und `invite` werden ausdrücklich abgelehnt.

Für genehmigte alte Browserstände: Zielkonto zuerst im Spiel erstellen, sämtliche aktiven Aufträge des Kontos und fremde Unterstützung beenden, dann Server stoppen:

```bash
node dist/server/cli.js legacy-import --username zielkonto --file /privater/pfad/altstand.json --confirm-replace-and-reset-active
```

Vorher erfolgt eine Datenbanksicherung. Format, Version, maximal 8 MB, Referenzen, Welt und Besitz werden geprüft. Kontokennung und Kontoname bleiben erhalten. Besitz und Fortschritt werden ersetzt; aktive Einsätze, Archiv, Patientenbelegungen und alte P2P-Belege werden verworfen, Fahrzeuge zurückgesetzt. Zulässige Altbeträge durchlaufen die gekennzeichnete Euro-/Preisumstellung, alte bezahlte Qualifikationen die Personalübernahme. Dies ist eine ausdrückliche Betreiberentscheidung für einen kompatiblen Bestand, kein öffentlicher Importendpunkt und kein Weg zum Zusammenführen von Einzelspielerarchiven oder Geografien.

AMP soll SIGTERM oder SIGINT zustellen und mindestens 30 Sekunden für den Stopp lassen. Nach einem harten Abbruch kann ein Lock zurückbleiben. Erst nach Prüfung, dass der alte Prozess wirklich beendet ist, `node dist/server/cli.js unlock --confirm` ausführen. Das Werkzeug verweigert Freigabe bei unklarem Prozessstatus. Datenbank oder WAL nicht zur Fehlerbehebung löschen.

## Betrieb und Grenzen

Eine Node-Instanz pro Datenverzeichnis, kein Cluster. Bei Stillstand werden höchstens vier Stunden nachberechnet. Ohne Serververbindung werden keine Online-Aktionen bestätigt. Offene Registrierung ist durch Eingabevalidierung, persistente Anmelde- und Registrierungsratenlimits sowie begrenzte gleichzeitige Passwortberechnung abgesichert, nicht gegen jeden verteilten Missbrauch. Passwort-Hashes, Sitzungen, CSRF-/Origin-Prüfungen und Eigentumsprüfungen bleiben bestehen.

Ein GitHub-Update installiert nichts selbstständig auf dem privaten AMP-Server und konfiguriert keinen Router, DNS oder TLS. Maßgeblich für ausgeführte Tests sind die CI-Ergebnisse des jeweiligen Commits. Frühere Testberichte beschreiben frühere Versionen.

## Historischer Hintergrund: Update auf 2.7 / Phase 1

Das reguläre Setup installiert weiterhin dieselbe Node-24-Anwendung; es kommen keine Umgebungsvariablen oder Dienste hinzu. Schema 6 ergänzt Notrufe, Disposition, FMS, Historien und angenommene Leitstellenmitgliedschaften. Vorhandene Bestände und aktive Fahrten werden migriert; vor der Änderung wird eine konsistente Sicherung im bisherigen Dateinamensschema angelegt. Alte automatische Freigaben ohne zugeordnete fremde Fahrzeuge werden geschlossen; laufende alte Unterstützungen und Transporte bleiben erhalten. [Vollständige Migrations- und Betriebsgrenzen](PHASE-1.md).

Spielerregistrierung bleibt frei. Die Einladungen unter **Funk → Verbund & Leitstellenfunk** (früher **Freunde**) betreffen ausschließlich die gemeinsame Disposition eines Leitstellenbestands, keine Administratorrolle oder Serververwaltung. **Spieler** zeigt öffentliche Anwesenheit ohne zusätzliche Einsatzrechte.

## Historischer Hintergrund: Update 2.8 / Phase 2

Schema 7 ergänzt das simulierte Wetter sowie persistente Gefahren, Patienten, Verkehr und Fahrzeugdefekte. Bestehende Einsätze und Fahrtermine bleiben ohne nachträgliche Eskalation erhalten; neue Einsätze verwenden die Dynamik. Vor der Migration wird eine vollständige SQLite-Sicherung angelegt. Keine neue Umgebungsvariable oder zusätzlicher Dienst. Stoppen, sichern, `main` aktualisieren, erfolgreiches Setup abwarten und starten. [Bedienung, Migration und Grenzen](PHASE-2.md).

## Historischer Hintergrund: Update auf 2.9.0 / Phase 3

Schema 8 ergänzt Organisationsprofile, Personalverfügbarkeit, Aufnahmeprofile und ausdrücklich angenommene Nachbarhilfe in den bestehenden Spielständen. Vor der Migration wird die vollständige SQLite-Sicherung angelegt. Beide Modi, Bestände, aktive Termine und alte Einsätze bleiben erhalten; neue Organisationspflichten werden nicht nachträglich eingebaut. Keine neue `.env`, keine Zusatzdienste. Wie bisher stoppen, sichern, `main` aktualisieren, erfolgreiches Setup abwarten und starten. [Bedienung und Grenzen](PHASE-3.md).

## Historischer Hintergrund: Umstellung auf Rivermere

Rivermere bleibt am Standardprogrammziel `dist/server/index.js` erhalten. Eine bisherige Rivermere-Instanz verwendet ihr vorhandenes `DATA_DIR` weiter; das frühere verschachtelte Programmziel entfällt. Falkenried-Daten werden vor SQLite-Änderungen abgewiesen und nicht automatisch verschoben oder zurückgesetzt. Beim Wechsel von Falkenried muss der Betreiber ein eigenes Rivermere-Datenverzeichnis einrichten. Schema 12 bleibt unverändert. Anleitung, Sicherung und nur lesende Vorschau: [RIVERMERE.md](RIVERMERE.md).

## Historischer Hintergrund: Update auf 2.12

Server stoppen, vorhandene Daten sichern, neuen Build erstellen. Die optionale Offline-Vorschau `node dist/server/cli.js migration-preview` verwendet dieselbe Konfiguration und liest beide Spielstände ohne Datenänderung. Beim nächsten regulären Start erstellt Schema 11 zuerst eine konsistente Sicherung und übernimmt Progression sowie aktive Fahrten. XP, Besitz und Standorte der organischen Welt bleiben erhalten; ein nötiger Stufenausgleich wird separat protokolliert. Details und vollständige Freischaltungen: [Progression und Karte](PROGRESSION-KARTE.md).
