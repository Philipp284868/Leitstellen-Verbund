# Leitstellen-Verbund auf CubeCoders AMP

Diese Anleitung beschreibt die vorhandene **Node.js-App-Runner-Instanz**. Der Umbau wird als Pull Request geliefert. Es wurde kein Zugriff auf einen privaten AMP-Server ausgeführt. Die Werte für öffentliche Adresse, Dateisystem und zugewiesenen Anwendungsport muss der Betreiber seiner Instanz entnehmen.

## Exakte App-Runner-Einträge

| AMP-Feld                   | Eintrag                          |
| -------------------------- | -------------------------------- |
| Node.js-Version            | **24**                           |
| npm Install Type           | **None**                         |
| Run App Setup Commands     | **aktiviert**                    |
| App Setup Commands         | **`node scripts/amp-setup.mjs`** |
| App Name                   | **`dist/server/index.js`**       |
| App Installation Location  | **leer**                         |
| Run App Pre-start Commands | **zunächst deaktiviert**         |

Das Arbeitsverzeichnis ist die Repository-Wurzel mit `package.json`, `.env` und `scripts/`. Repository: `Philipp284868/Leitstellen-Verbund`; für die Prüfung dieses Umbaus den Branch `feature/amp-authoritative-server` auswählen. Erst nach Review den gewünschten freigegebenen Stand verwenden. Kein Vite-Dev- oder Previewserver ist am Produktionsbetrieb beteiligt.

Das Setup startet allein mit Node 24, lädt **pnpm 11.19.0** versionsgebunden aus der npm-Registry, prüft dessen SHA-512-Paketintegrität und entpackt es unter `.tools/`. Es ruft weder eine globale Installation noch npm auf. Danach folgt `pnpm install --frozen-lockfile --prod=false` und der Build einschließlich TypeScript und Frontend-Werkzeugen, auch wenn AMP `NODE_ENV=production` setzt. Ein fehlgeschlagener Download, eine inkonsistente Lockdatei oder ein Buildfehler beendet das Skript mit einem Fehlercode. `.env` und Spieldaten werden nicht gelöscht. Für Setup/Updates ist Zugriff auf die Paketregistry erforderlich; Spieler benötigen keine externe Cloud-Verbindung.

Ergebnis: `dist/server/index.js` und `dist/server/cli.js` als direkt ausführbare Node-Dateien sowie getrennt `dist/client/` für die Website. Die Runtime-Abhängigkeiten bleiben im installierten `node_modules/`. Nicht nur eine einzelne Serverdatei hochladen; AMP installiert aus dem vollständigen Repository.

## Konfiguration und dauerhafte Daten

`.env.example` nach `.env` kopieren. Die Anwendung lädt `.env` **aus der Programmwurzel ausdrücklich über Node `loadEnvFile`**; bereits durch AMP gesetzte Umgebungsvariablen haben Vorrang. Beispiel, an die eigene Instanz anpassen:

```dotenv
HOST=127.0.0.1
PORT=8080
PUBLIC_URL=https://leitstelle.example.org
DATA_DIR=/srv/leitstellen-data
TRUSTED_PROXIES=127.0.0.1,::ffff:127.0.0.1
ALLOW_HTTP=false
```

**8080 ist ein Beispiel, kein ermittelter AMP-Port.** `PORT` muss dem tatsächlich an die App zugewiesenen internen Port entsprechen. `PUBLIC_URL` ist die Browseradresse ohne Unterpfad, Benutzerinformationen oder Query; Frontend, `/api/` und `/socket.io/` liegen unter dieser einen Adresse. Öffentliches HTTP wird abgelehnt. Für einen ausdrücklich gewählten privaten HTTP-Test kann `ALLOW_HTTP=true` gesetzt werden. Loopback-HTTP funktioniert ohne diese Ausnahme.

`DATA_DIR` muss außerhalb des austauschbaren Programmverzeichnisses liegen. Die Anwendung verweigert ein Datenverzeichnis innerhalb der Installation, auch bei aufgelösten symbolischen Links. Für AMP-Container einen dauerhaften Hostordner oder ein Volume einbinden, beispielsweise Host `/srv/leitstellen-data` → Container `/data/leitstellen`, dann `DATA_DIR=/data/leitstellen`. Schreibrechte für den tatsächlichen AMP-App-Benutzer vergeben, nicht pauschal für alle Benutzer. Unter Windows funktioniert entsprechend ein absoluter Pfad außerhalb des Repositorys, etwa `D:/Spielserverdaten/Leitstellen`.

Enthalten sind `game.sqlite`, im Betrieb eventuell `game.sqlite-wal` und `game.sqlite-shm`, `backups/`, gegebenenfalls Vor-Migrationssicherungen und das Prozess-Lock `server.lock`. Daten, `.env`, `.tools/`, Sicherungen und SQLite-Dateien werden nicht in Git eingecheckt. Bestehende Umgebungsdateien müssen beim Programmverzeichniswechsel separat erhalten bleiben. Backup-Dateien werden nicht automatisch gelöscht; der Betreiber legt seine Aufbewahrungsfrist fest und kopiert Sicherungen zusätzlich auf einen getrennten Datenträger.

## Container-Port und Reverse Proxy

Im Container normalerweise `HOST=0.0.0.0` setzen, damit die Portweiterleitung die Anwendung erreicht. Beispiel: Container `8080/tcp` → Host `127.0.0.1:18080`; in der App bleibt `PORT=8080`, der Reverse Proxy spricht `127.0.0.1:18080` an. Bei direktem Betrieb ohne Container kann Node an `127.0.0.1` gebunden bleiben. Nur den Proxy öffentlich zugänglich machen.

Beispiel für einen vorhandenen Nginx-HTTPS-VHost (TLS-Zertifikat und DNS separat einrichten):

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

WebSocket-Upgrades und Socket.IO-Long-Polling müssen beide weitergeleitet werden. Private API-/Socket-Antworten nicht im Proxy cachen. `TRUSTED_PROXIES` enthält ausschließlich die **unmittelbaren Proxy-IP-Adressen, wie Node sie sieht**; Docker kann hier eine Bridge-Adresse ergeben. Leere Liste vertraut niemandem. `X-Real-IP` wird nur von exakt diesen Absendern für Ratenbegrenzungen übernommen. Der Proxy muss diesen Header überschreiben. `X-Forwarded-For` und `X-Forwarded-Proto` werden nicht pauschal vertraut. Ob Cookies `Secure` sind, bestimmt die konfigurierte HTTPS-`PUBLIC_URL`.

## Ersten Administrator einrichten

Es gibt keinen Standardadministrator, kein Standardpasswort und keinen öffentlichen Bootstrap-Endpunkt. Nach Setup, **vor dem Serverstart**, den folgenden Befehl im Programmverzeichnis verwenden. Er funktioniert ausschließlich bei einer Datenbank ohne Konten.

Linux/Bash – eigenes Passwort verdeckt eingeben, nicht in die Befehlszeile schreiben:

```bash
read -r -s -p 'Eigenes Administratorpasswort (mindestens 12 Zeichen): ' LV_ADMIN_PASSWORD
printf '\n'
printf '%s' "$LV_ADMIN_PASSWORD" | node dist/server/cli.js admin-create --username meinadmin --name 'Administration' --station 'Leitstelle Zentrale' --password-stdin
unset LV_ADMIN_PASSWORD
```

PowerShell:

```powershell
$secret = Read-Host 'Eigenes Administratorpasswort (mindestens 12 Zeichen)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | node dist/server/cli.js admin-create --username meinadmin --name Administration --station Zentrale --password-stdin
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable secret,pointer
}
```

Danach AMP starten, die konfigurierte Website öffnen und anmelden. In **Einstellungen → Serververwaltung → Einladung erstellen** einen einmaligen Code erzeugen. Er gilt drei Tage. Freunde registrieren sich über **Mit Einladung registrieren**, wählen eigene Zugangsdaten und erhalten eigenen Besitz. Die Einladung privat weitergeben. Weitere Einladungen können bei gestopptem Server auch mit `node dist/server/cli.js invite` erzeugt werden. Einladungen erzeugen normale Spielerkonten, keine Administratoren.

Passwörter werden gesalzen mit scrypt gespeichert. Sitzungscookies sind HttpOnly, SameSite=Strict, bei HTTPS Secure, und sieben Tage gültig. Abmelden, alle Sitzungen abmelden und Passwortwechsel widerrufen passende Sitzungen einschließlich offener Socket-Verbindungen. Die Simulation benötigt keine angemeldeten Browser.

## Datenbanksicherung und Wiederherstellung

SQLite verwendet WAL und synchrone Transaktionen. Vor einer Schemaänderung entsteht eine konsistente Vor-Migrationskopie; ein fehlgeschlagener Migrationsschritt wird zurückgerollt. Neuere Datenbankschemata werden nicht mit älterem Programmcode geöffnet. Alle erfolgreichen Spielaktionen und kooperativen Belohnungen sind transaktional gespeichert.

Im laufenden Server erstellt die Administrator-Schaltfläche **Datenbanksicherung erstellen** eine konsistente SQLite-Online-Sicherung; zusätzlich erfolgt dies stündlich und beim sauberen Stoppen. Keine laufende `game.sqlite` allein kopieren, während noch ein WAL aktiv sein kann. Bei gestopptem Server:

```bash
node dist/server/cli.js backup
node dist/server/cli.js restore --file /srv/leitstellen-data/backups/game-ZEIT-ID.sqlite --confirm
```

Die Wiederherstellung prüft Integrität, Schema und Kontobesitz, sichert die bisherige Datenbank, widerruft Sitzungen in der Kopie und ersetzt die Datenbank atomar. Der vorherige Stand bleibt in `backups/`. Danach starten und erneut anmelden. Eine Wiederherstellung setzt die gesamte Welt auf den Sicherungszeitpunkt zurück; sie ist keine Zusammenführung mit neueren Fortschritten.

Server und CLI verwenden dasselbe exklusive Prozess-Lock. Eine zweite App-Instanz oder parallele Offline-Administration auf denselben Daten wird abgelehnt. AMP sollte SIGTERM oder SIGINT zustellen und dem Prozess mindestens 30 Sekunden für Schließen und Sicherung lassen. Bereits bestätigte Transaktionen sind auch bei hartem Abbruch dauerhaft. Nach einem erzwungenen Abbruch kann ein Lock verbleiben. Erst sicherstellen, dass die alte Instanz gestoppt ist, dann:

```bash
node dist/server/cli.js unlock --confirm
```

Das Werkzeug entfernt das Lock nur, wenn die gespeicherte PID nachweislich nicht mehr existiert; bei unklaren Berechtigungen oder wiederverwendeter PID verweigert es die Freigabe. Bei Containerwechsel und PID-Wiederverwendung muss der Betreiber den alten Prozesszustand separat prüfen, bevor er ausschließlich die verwaiste Lock-Datei entfernt. Datenbank oder WAL dafür nicht löschen.

## Alte Browserdateien ausdrücklich übernehmen

Im Browser bleiben Dateiexport, lokale Kopien und validierte Dateivorschau verfügbar. Eine Dateivorschau bucht kein Geld und ersetzt keinen Serverstand. Es existiert kein öffentlicher Import-Endpunkt für frei vorgegebene Besitzdaten.

Für eine vom Administrator genehmigte einmalige Übernahme das Zielkonto zuerst regulär anlegen, alle aktiven Aufträge des Zielkontos und anderer Helfer dazu beenden, Server stoppen und ausführen:

```bash
node dist/server/cli.js legacy-import --username zielkonto --file /privater/pfad/altstand.json --confirm-replace-and-reset-active
```

Der Import prüft Format, Version, Größenlimit von 8 MB, Referenzen, Fähigkeiten, Besitzer und Kapazitäten. Vor der Änderung wird die ganze Serverdatenbank gesichert. Kontoname und Kontokennung bleiben dem Zielkonto zugeordnet; Objekt-IDs werden neu vergeben. Besitz, Guthaben, Personal und Fortschritt werden ersetzt. **Alte aktive Einsätze, Archiv, Patientenbelegungen und P2P-Belege werden verworfen, Fahrzeuge an ihre Wachen zurückgesetzt.** Der ausdrückliche Schalter bestätigt genau diesen Neustart aktiver Vorgänge. Das verhindert kollidierende oder verwaiste alte Kooperationsaufträge. Alte Dateien bleiben außerhalb der Datenbank unverändert. Der Vorgang wird auditiert und Sitzungen des Zielkontos widerrufen. Ein Adminimport ist eine bewusste Vertrauensentscheidung über den Dateiinhalt, keine historische Echtheitsprüfung.

## Updates und bisheriges Pages-Deployment

1. Im alten Browser-Spiel zuerst eine Datei exportieren. Ein neuer Server kann die Daten der GitHub-Pages-Origin nicht automatisch lesen.
2. Server stoppen und konsistente Sicherung erstellen. `.env` und dauerhaftes `DATA_DIR` erhalten.
3. Geprüften Commit im Programmverzeichnis bereitstellen, AMP-Setup erneut ausführen und auf den erfolgreichen Exitcode achten.
4. Server starten, `/api/health`, Anmeldung, eigene Ressourcen und einen gemeinsamen Einsatz über die tatsächliche HTTPS-Adresse prüfen.
5. Erst nach erfolgreicher privater Inbetriebnahme und Sicherung alter Browserstände die bisherige Pages-Seite in GitHub deaktivieren. Dieser Branch entfernt den automatischen Pages-Workflow; die derzeitige öffentliche Seite und ihre Browserdaten werden durch das Erstellen des PRs nicht gelöscht.

Bei Rollback nicht einfach älteren Code gegen eine neuere Datenbank starten. Passendes Programm und passende konsistente Sicherung gemeinsam wiederherstellen. Nach einem Serverstillstand werden maximal vier Stunden reale Stillstandszeit je Kontogeschwindigkeit nachberechnet; längere Ausfälle erzeugen keinen unbegrenzten Nachholaufwand.

## Betriebsgrenzen

Eine einzelne Node-Instanz ist für ein Datenverzeichnis zuständig. Das ist kein Clusterbetrieb und keine globale Mehrserverdatenbank. Alle Konten auf diesem eingeladenen Server können Namen sehen und ausdrücklich freigegebene Einsätze unterstützen. Private Guthaben, Personal und Sicherungen werden nicht an andere Konten übertragen. Externe Spielressourcen, Cloud-Anmeldung, STUN, TURN und WebRTC werden nicht benötigt. Ohne Serververbindung gibt es keine bestätigten Online-Spielaktionen. Testumgebungen und tatsächlich ausgeführte Prüfungen stehen in `TESTBERICHT.md`.
