# Leitstellen-Verbund auf CubeCoders AMP

## Einfachstart ab Version 2.1

**Die erste Admin-Einrichtung benötigt kein SSH und keine zusätzliche Startdatei mehr.** Nach Installation normal `dist/server/index.js` starten. Bei leerer Datenbank entstehen das Konto `philipp` und eine private, bearbeitbare `admin-konto.json` automatisch. Vorhandene Administratoren werden unverändert übernommen.

Die kurze Anleitung für Betreiber steht in **[AMP-EINFACH.md](AMP-EINFACH.md)**. Sie beschreibt Anmelden sowie spätere Änderungen an Benutzername, Passwort, Anzeigename und Leitstellenname. Die frühere Datei `amp-admin-einrichten.mjs` wird nicht mehr benötigt. Sie nicht als App Name stehen lassen.

## Exakte App-Runner-Einträge

| AMP-Feld | Eintrag |
| --- | --- |
| Node.js Release Stream | **24** |
| Node.js Version | leer |
| npm Install Type | **None** |
| Run App Setup Commands | **aktiviert** |
| App Setup Commands | **`node scripts/amp-setup.mjs`** |
| App Name | **`dist/server/index.js`** |
| App Installation Location | **leer** |
| Run App Pre-start Commands | **deaktiviert** |

Arbeitsverzeichnis ist die Repository-Wurzel mit `package.json`, `.env` und `scripts/`. Repository: `Philipp284868/Leitstellen-Verbund`. Den freigegebenen Serverbranch verwenden; bis zum Merge des Server-Umbaus ist das nicht `main`. Kein Vite-Dev- oder Previewserver gehört zum Produktionsbetrieb.

Das Setup startet allein mit Node 24, lädt pnpm 11.19.0 versionsgebunden aus der npm-Registry, prüft dessen SHA-512-Paketintegrität und entpackt es unter `.tools/`. Danach folgen `pnpm install --frozen-lockfile --prod=false` und der Build einschließlich Frontend-Werkzeugen, auch bei `NODE_ENV=production`. Fehler führen zu einem Fehlercode. `.env` und vorhandene Spieldaten werden nicht gelöscht. Für Setup/Updates ist Zugriff auf die Paketregistry erforderlich.

Ergebnis: `dist/server/index.js`, `dist/server/cli.js` und `dist/client/`. Runtime-Abhängigkeiten bleiben in `node_modules/`; nicht nur einzelne Serverdateien kopieren.

## Konfiguration und dauerhafte Daten

Bei neuer Installation `.env.example` nach `.env` kopieren. Eine vorhandene `.env` behalten. Die Anwendung lädt die Datei aus der Programmwurzel ausdrücklich; bereits gesetzte Umgebungsvariablen haben Vorrang. Beispiel für einen lokalen Reverse Proxy, keine ermittelten Serverwerte:

```dotenv
HOST=127.0.0.1
PORT=8080
PUBLIC_URL=https://leitstelle.example.org
DATA_DIR=/srv/leitstellen-data
TRUSTED_PROXIES=127.0.0.1,::ffff:127.0.0.1
ALLOW_HTTP=false
```

`PORT` muss dem tatsächlich zugewiesenen internen AMP-Anwendungsport entsprechen, nicht dem AMP-Verwaltungsport. `PUBLIC_URL` ist die Browseradresse ohne Unterpfad, Benutzerinformationen oder Query. Frontend, `/api/` und `/socket.io/` liegen unter dieser Adresse. Nur für einen bewusst privaten HTTP-Test `ALLOW_HTTP=true` setzen; dies ist keine Firewall und schränkt die Erreichbarkeit nicht selbst ein.

Bei leerem `DATA_DIR` verwendet der Server `leitstellen-data` neben dem Programmordner. Alternativ einen absoluten dauerhaften Datenpfad eintragen. Innerhalb des Programmverzeichnisses liegende Datenpfade werden auch nach Symlink-Auflösung abgelehnt. Der tatsächliche App-Benutzer benötigt Schreibrechte; nicht pauschal allen Benutzern Rechte geben.

Bei AMP-Containern muss der Datenordner in dauerhaftem Hostspeicher liegen. Beispiel: Host `/srv/leitstellen-data` nach Container `/data/leitstellen` einbinden und dort `DATA_DIR=/data/leitstellen` verwenden. Auch beim Standardordner muss dessen übergeordnetes Verzeichnis dauerhaft gemountet sein. Unter Windows ist beispielsweise `D:/Spielserverdaten/Leitstellen` möglich.

Die Daten umfassen `game.sqlite`, im Betrieb gegebenenfalls WAL/SHM-Dateien, `backups/`, Vor-Migrationssicherungen und `server.lock`. Daten, `.env`, `.tools/`, private Admin-Konfiguration und Sicherungen gehören nicht in Git. Backups werden nicht automatisch gelöscht; eine Aufbewahrungsfrist und eine externe Sicherungskopie einplanen. Bei einem Wechsel des Programmverzeichnisses `.env` und die aktuelle private Admin-Konfiguration kontrolliert mitnehmen.

## Netzwerk und HTTPS

Im Container normalerweise `HOST=0.0.0.0`, damit die Portweiterleitung die Anwendung erreicht. Beispiel mit Bridge-Netz: Container `8080/tcp` nach Host `127.0.0.1:18080`; die App behält `PORT=8080`, der Reverse Proxy spricht `127.0.0.1:18080` an. Im Linux-Host-Netzwerkmodus gibt es diese Portübersetzung nicht. Bei Betrieb auf demselben Host wie der Proxy kann Node an `127.0.0.1` gebunden bleiben. Nur den Proxy öffentlich zugänglich machen.

Beispiel für einen vorhandenen Nginx-HTTPS-VHost; TLS-Zertifikat und DNS separat einrichten:

```nginx
location / {
    proxy_pass http://127.0.0.1:18080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 75s;
    proxy_buffering off;
}
```

WebSocket-Upgrades und Socket.IO-Long-Polling weiterleiten, private API-/Socket-Antworten nicht cachen. `TRUSTED_PROXIES` enthält nur die unmittelbaren Proxy-IP-Adressen, wie Node sie sieht; eine leere Liste vertraut niemandem. Der Proxy muss `X-Real-IP` überschreiben. `X-Forwarded-For` und `X-Forwarded-Proto` werden nicht pauschal vertraut. Sichere Cookies richten sich nach der HTTPS-`PUBLIC_URL`.

## Einladungen und optionale CLI

Nach Anmeldung unter **Einstellungen → Serververwaltung → Einladung erstellen** einen einmaligen Code erzeugen. Er gilt drei Tage. Freunde registrieren sich über **Mit Einladung registrieren** mit eigenen Zugangsdaten. Einladungen erzeugen normale Spieler, keine Administratoren. Passwortwechsel und Abmelden aller Sitzungen sind im Spiel möglich.

Die CLI bleibt für besondere Offline-Verwaltung verfügbar. Sie darf nicht gleichzeitig mit dem Server auf dasselbe Datenverzeichnis zugreifen. Für die normale Admin-Ersteinrichtung stattdessen den oben beschriebenen Einfachstart verwenden. Ein Administrator kann auf einer noch leeren Datenbank weiterhin explizit angelegt werden, etwa in Bash im Programmverzeichnis unter demselben Benutzer/Container und mit Node 24:

```bash
(
  read -r -s -p 'Administratorpasswort (12–128 Zeichen): ' LV_ADMIN_PASSWORD || exit 1
  printf '\n'
  printf '%s' "$LV_ADMIN_PASSWORD" | node dist/server/cli.js admin-create --username meinadmin --name 'Administration' --station 'Leitstelle Zentrale' --password-stdin
)
```

Für Windows oder komplexere Betriebsaufgaben die CLI mit Passwort über Standardeingabe statt über Befehlsargumente aufrufen. Keine Passwörter in Logs oder GitHub schreiben. Ein vorhandener CLI-Administrator wird beim nächsten normalen Start in der privaten Datei zugeordnet und nicht überschrieben.

## Sicherung und Wiederherstellung

SQLite verwendet WAL und synchrone Transaktionen. Vor Schemaänderungen entstehen konsistente Sicherungen; fehlgeschlagene Migrationen werden zurückgerollt. Neuere Datenbankschemata nicht mit älterem Code öffnen. Erfolgreiche Spielaktionen und Belohnungen sind transaktional gespeichert.

Im laufenden Spiel erstellt **Datenbanksicherung erstellen** eine konsistente Sicherung; zusätzlich sichert der Server stündlich und beim sauberen Stoppen. Eine laufende `game.sqlite` nicht allein kopieren, solange WAL aktiv sein kann. Für Offline-Verwaltung bei gestopptem Server:

```bash
node dist/server/cli.js backup
node dist/server/cli.js restore --file /srv/leitstellen-data/backups/game-ZEIT-ID.sqlite --confirm
```

Restore prüft Integrität, Schema und Kontobesitz, sichert den bisherigen Stand und ersetzt die Datenbank. Sitzungen werden widerrufen. Die gesamte Welt wird auf den Sicherungszeitpunkt zurückgesetzt, nicht zusammengeführt. Danach auch die private Admin-Datei kontrollieren; eine alte ausstehende Dateiänderung darf nicht versehentlich als neuer Passwortauftrag verwendet werden.

AMP soll SIGTERM oder SIGINT zustellen und mindestens 30 Sekunden für den Stopp gewähren. Nach einem harten Abbruch kann ein Lock zurückbleiben. Nur nachdem der vorherige Prozess wirklich beendet ist:

```bash
node dist/server/cli.js unlock --confirm
```

Das Werkzeug entfernt das Lock nur, wenn die gespeicherte PID nachweislich nicht mehr existiert. Bei unklaren Rechten oder PID-Wiederverwendung verweigert es die Freigabe. Nach Containerwechsel den alten Prozesszustand separat prüfen. Datenbank oder WAL dafür nicht löschen.

## Alte Browserstände übernehmen

Dateivorschau im Browser bucht kein Geld und ersetzt keinen Serverstand. Für eine bewusst genehmigte Übernahme zunächst Zielkonto anlegen, alle aktiven Aufträge und fremde Unterstützung dazu beenden und den Server stoppen:

```bash
node dist/server/cli.js legacy-import --username zielkonto --file /privater/pfad/altstand.json --confirm-replace-and-reset-active
```

Die CLI validiert Version, Größenlimit von 8 MB, Referenzen, Fähigkeiten, Besitz und Kapazitäten und sichert vor der Änderung die Datenbank. Kontokennung und Name bleiben erhalten, Objekt-IDs werden neu vergeben. Besitz, Guthaben, Personal und Fortschritt werden ersetzt. Aktive Einsätze, Archiv, Patientenbelegungen und P2P-Belege werden verworfen, Fahrzeuge zurückgesetzt. Der Schalter bestätigt diesen Neustart aktiver Vorgänge. Die Quelle bleibt unverändert; Zielkontositzungen werden widerrufen. Ein solcher Import ist eine ausdrückliche Vertrauensentscheidung, keine Echtheitsprüfung alter Spieldaten.

## Updates und Betriebsgrenzen

Vor Änderungen sichern. In AMP stoppen, den freigegebenen Serverbranch aktualisieren, erfolgreichen Setup-/Buildabschluss abwarten und starten. `.env`, Admin-Datei und dauerhaften Datenordner behalten. Danach `/api/health`, Anmeldung, Besitz und einen gemeinsamen Einsatz prüfen. Keine automatische Aktualisierung mitten im laufenden Spiel erzwingen.

Die bisherige Pages-Seite erst nach erfolgreicher eigener Inbetriebnahme und Export alter Browserstände deaktivieren. Das Entfernen eines Workflows löscht keine Browserdaten. Ein GitHub-Zugriff ist kein Zugriff auf das private AMP-Netzwerk.

Eine Node-Instanz pro Datenverzeichnis, kein Clusterbetrieb. Bei Stillstand werden maximal vier Stunden nachberechnet. Ohne Verbindung zum Server gibt es keine bestätigten Online-Aktionen. Private Guthaben, Personal und Sicherungen werden anderen Spielern nicht übertragen. Für tatsächlich durchgeführte Prüfungen die zum Commit gehörenden CI-Ergebnisse und `TESTBERICHT.md` heranziehen.
