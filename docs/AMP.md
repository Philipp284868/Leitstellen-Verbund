# Leitstellen-Verbund auf CubeCoders AMP – Version 2.6

Version 2.6 vergrößert die Region und stellt beide Modi auf Echtzeit. [Updatehinweise zu Schema 5](VERSION-2.6.md). Das normale Update genügt; die bestehende Stadt bleibt an ihrem Platz.

Version 2.5 ergänzt [Musik und Soundeffekte](AUDIO.md). Das normale Update genügt; Audio benötigt keine zusätzlichen Dateien, Ports oder Einstellungen in AMP.

Version 2.4 ersetzt das Straßenraster durch eine neue Region. [Updatehinweise zur Kartenmigration auf Schema 4](VERSION-2.4.md). Beide Spielstände bleiben erhalten; Standorte werden auf die neuen Straßen übertragen.

## Normale Spielerkonten für alle

Ab Version 2.2 ist die Registrierung offen. Auf der Spielwebsite **Neues Konto erstellen** wählen. Kein Einladungscode, keine Admin-Ersteinrichtung und keine zusätzliche Startdatei. Auch das erste Konto ist nur Spieler. Bestehende Administratoren werden in normale Spieler umgewandelt, ohne Kontokennung, Passwort-Hash oder Spielstand zu verändern. Ihre bisherigen Sitzungen werden einmalig widerrufen. `admin-konto.json` wird nicht mehr verarbeitet oder neu erzeugt. Normale Spieler erhalten keinen Zugriff auf Serverwartung oder fremde Daten.

## AMP-Einträge

| Feld | Wert |
| --- | --- |
| App Download Type | Git repo |
| App Download Source | `https://github.com/Philipp284868/Leitstellen-Verbund.git` |
| Git Repo Branch | `main` |
| Node.js Release Stream | 24 |
| Node.js Version | leer |
| npm Install Type | None |
| Run App Setup Commands | aktiviert |
| App Setup Commands | `node scripts/amp-setup.mjs` |
| App Name | `dist/server/index.js` |
| App Installation Location | leer |
| Run App Pre-start Commands | deaktiviert |

`main` enthält den freigegebenen Stand; `dev` dient der Entwicklung. Ein neuer Commit wird nicht automatisch auf einer laufenden AMP-Instanz installiert. Stoppen → Aktualisieren → erfolgreichen Setup-/Buildabschluss abwarten → Start. Arbeitsverzeichnis ist die Repository-Wurzel mit `package.json`, `.env` und `scripts/`.

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

Bei leerem `DATA_DIR` verwendet der Server `leitstellen-data` neben dem Programmordner. Alternativ einen absoluten dauerhaften Datenpfad eintragen. Daten innerhalb des Programmordners werden auch nach Symlink-Auflösung abgelehnt. Nur dem tatsächlichen App-Benutzer Schreibrechte geben. Bei Containern muss der Datenordner dauerhaft vom Host eingebunden sein, beispielsweise Host `/srv/leitstellen-data` nach Container `/data/leitstellen`. Auch der Standardordner muss dauerhaft gemountet sein. Ein Wechsel des Datenpfads ist kein Update und würde eine andere Datenbank verwenden.

## Migration auf Schema 2

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

Restore prüft Integrität, Schema und Kontobesitz, sichert den bisherigen Stand, widerruft Sitzungen und ersetzt die Datenbank. Sicherungen der Schemata 1, 2, 3, 4 und 5 werden unterstützt; ältere Adminrollen aus Schema 1 werden wieder zu Spielern migriert. Eine Wiederherstellung setzt die gesamte Welt zurück, sie führt keine Spielstände zusammen. Die optionale `player-create`-CLI legt ausschließlich einen normalen Spieler an und benötigt das Passwort über `--password-stdin`; für reguläre Nutzer ist sie nicht nötig. `admin-create` und `invite` werden ausdrücklich abgelehnt.

Für genehmigte alte Browserstände: Zielkonto zuerst im Spiel erstellen, sämtliche aktiven Aufträge des Kontos und fremde Unterstützung beenden, dann Server stoppen:

```bash
node dist/server/cli.js legacy-import --username zielkonto --file /privater/pfad/altstand.json --confirm-replace-and-reset-active
```

Vorher erfolgt eine Datenbanksicherung. Format, Version, maximal 8 MB, Referenzen und Besitz werden geprüft. Kontokennung und Kontoname bleiben erhalten. Besitz und Fortschritt werden ersetzt; aktive Einsätze, Archiv, Patientenbelegungen und alte P2P-Belege werden verworfen, Fahrzeuge zurückgesetzt. Das ist eine ausdrückliche Betreiberentscheidung, kein öffentlicher Importendpunkt.

AMP soll SIGTERM oder SIGINT zustellen und mindestens 30 Sekunden für den Stopp lassen. Nach einem harten Abbruch kann ein Lock zurückbleiben. Erst nach Prüfung, dass der alte Prozess wirklich beendet ist, `node dist/server/cli.js unlock --confirm` ausführen. Das Werkzeug verweigert Freigabe bei unklarem Prozessstatus. Datenbank oder WAL nicht zur Fehlerbehebung löschen.

## Betrieb und Grenzen

Eine Node-Instanz pro Datenverzeichnis, kein Cluster. Bei Stillstand werden höchstens vier Stunden nachberechnet. Ohne Serververbindung werden keine Online-Aktionen bestätigt. Offene Registrierung ist durch Eingabevalidierung, persistente Anmelde- und Registrierungsratenlimits sowie begrenzte gleichzeitige Passwortberechnung abgesichert, nicht gegen jeden verteilten Missbrauch. Passwort-Hashes, Sitzungen, CSRF-/Origin-Prüfungen und Eigentumsprüfungen bleiben bestehen.

Ein GitHub-Update installiert nichts selbstständig auf dem privaten AMP-Server und konfiguriert keinen Router, DNS oder TLS. Maßgeblich für ausgeführte Tests sind die CI-Ergebnisse des jeweiligen Commits. Frühere Testberichte beschreiben frühere Versionen.

## Update auf 2.7 / Phase 1

Das reguläre Setup installiert weiterhin dieselbe Node-24-Anwendung; es kommen keine Umgebungsvariablen oder Dienste hinzu. Schema 6 ergänzt Notrufe, Disposition, FMS, Historien und angenommene Leitstellenmitgliedschaften. Vorhandene Bestände und aktive Fahrten werden migriert; vor der Änderung wird eine konsistente Sicherung im bisherigen Dateinamensschema angelegt. Alte automatische Freigaben ohne zugeordnete fremde Fahrzeuge werden geschlossen; laufende alte Unterstützungen und Transporte bleiben erhalten. [Vollständige Migrations- und Betriebsgrenzen](PHASE-1.md).

Spielerregistrierung bleibt frei. Die neuen Einladungen unter **Freunde** betreffen ausschließlich die gemeinsame Disposition eines Leitstellenbestands, keine Administratorrolle oder Serververwaltung.
