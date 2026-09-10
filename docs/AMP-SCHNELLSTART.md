# Leitstellen-Verbund auf AMP

| AMP-Feld | Wert |
|---|---|
| App Download Type | Git Repository |
| App Download Source | `https://github.com/Philipp284868/Leitstellen-Verbund.git` |
| Git Repo Branch | `main` |
| Node.js Release Stream | `24` |
| npm Install Type | `None` |
| Run App Setup Commands | aktiviert |
| App Setup Commands | `node scripts/install-germany.mjs` |
| App Name | `scripts/start-germany.mjs` |
| App Installation Location | vorhandenen funktionierenden Wert behalten; Startdatei muss relativ zur Programmwurzel erreichbar sein |
| Run App Pre-start Commands | deaktiviert |

Die Startdatei und das Setup finden ihre Programmwurzel selbst, auch bei abweichendem Arbeitsverzeichnis. Die konkrete AMP-Installation und ein leeres Feld „App Installation Location“ sind auf dem privaten Server nicht durch Codex geprüft. Bei einer neuen Instanz den tatsächlichen Ordner mit `package.json` und `scripts/` als Programmwurzel verwenden; keine pauschale Pfadänderung einer bestehenden Instanz.

## A – Neu installieren

1. Obige Felder in der NodejsAppRunner-Instanz setzen und deren Setup ausführen. Node.js 24, Linux x64, ausreichend RAM für den Deutschlandrouter und mindestens 25 GB freien persistenten Speicher vorsehen. Das Setup lädt das festgelegte Datenpaket samt Werkzeugen, prüft die Dateien und baut die Anwendung. Unterbrochene Downloads lassen sich mit demselben Setup fortsetzen.
2. Im AMP-Dateimanager die vom Setup erzeugte **`.env` in der Programmwurzel** öffnen. Für den Betreiber dieses Projekts mit Caddy im **gleichen Host-Netzwerkraum** gilt:

```dotenv
HOST=127.0.0.1
PORT=7777
PUBLIC_URL=https://gaminglive.mooo.com
ALLOW_HTTP=false
TRUSTED_PROXIES=127.0.0.1,::ffff:127.0.0.1
# Die vorhandenen, vom Setup eingetragenen DATA_DIR- und GEODATA_DIR-Zeilen behalten.
```

Üblicherweise nur `PUBLIC_URL`, gegebenenfalls `PORT` und die tatsächlichen `TRUSTED_PROXIES` anpassen. **7777 muss der zugewiesene AMP-Spielport sein.** gaminglive.mooo.com ist ein Betreiberbeispiel; fremde Installationen verwenden ihre eigene Domain. Das Setup trägt automatisch zunächst eine sichere lokale Adresse ein.

3. `.env` speichern, dasselbe Setup noch einmal ausführen (damit die geprüfte Konfiguration gesichert wird), anschließend das Spiel in AMP starten.

Spiel- und Geodaten erhalten getrennte absolute Instanzordner außerhalb des Git-Programmordners. Das Setup nennt deren tatsächliche Pfade. Bei Containern muss der gemeinsame äußere Instanzordner dauerhaft als AMP-Volume eingebunden sein. Ein Ordner außerhalb des Git-Checkouts allein garantiert **keinen** Erhalt beim Löschen oder Ersetzen eines Containers. Vorhandene manuell konfigurierte Datenpfade werden beibehalten und geprüft.

## B – Aktualisieren

Spiel regulär stoppen, aktuelle Konfiguration und konsistente Datensicherung aufbewahren, in AMP den geprüften `main`-Stand beziehen und **denselben Setup-Befehl** ausführen. Danach starten. Vorhandene gültige Geodaten werden geprüft und wiederverwendet. Kein erneuter Kartenimport und kein Datenreset. Ein Git-Push löst keine Produktionsbereitstellung aus.

## C – `.env` oder `.env.germany` verloren

**Keinen Spielordner löschen und keinen leeren Ersatzordner wählen.** Das reguläre Setup stellt eine eindeutig geschützte Zuordnung mit gültigen Daten wieder her. Es meldet den wiederverwendeten Spiel- und Geodatenpfad.

Bei älteren Installationen ohne Zuordnung werden bekannte Standardordner nur gelesen. Ist eine Zuordnung nicht beweisbar, endet das Setup mit Kandidaten und einem konkreten Wiederherstellungsbefehl. Datenbankname allein reicht nicht: Schema, Deutschlandkennung und passendes Geodatenpaket müssen stimmen. Bei mehreren Kandidaten muss der Betreiber die richtigen Pfade ausdrücklich auswählen. [Diagnose und bestätigte Wiederherstellung](AMP-TECHNIK.md).

Vorhandene `.env.germany` wird gesichert und in `.env` überführt. Gleiche Werte werden zusammengeführt; widersprüchliche Werte führen zu einer verständlichen Meldung. Erst nach erfolgreicher Übernahme bleibt die alte Datei als `.env.germany.migrated-….bak` erhalten. Es gibt danach nur eine aktive Datei.

## D – Caddy-Testantwort durch das Spiel ersetzen

Die vorhandene **separate Caddy-Instanz** behalten. Ihre aktuelle Konfigurationsdatei sichern und den Inhalt der [fertigen Caddyfile.example](../Caddyfile.example) übernehmen, dann Caddy über seine bestehende AMP-Instanz neu laden/starten. Vorhandene Zertifikats- und Caddy-Datenordner beibehalten. Die `.env` des Spiels kann die Konfiguration der anderen AMP-Instanz nicht automatisch ändern.

Die Vorlage nimmt den erreichbaren Spielserver `127.0.0.1:7777` an. Caddy hört intern auf HTTP 18080 und HTTPS 18443; die beschriebene FRITZ!Box-Zuordnung bleibt öffentlich 80/443. Die HTTP-Weiterleitung zeigt auf die öffentliche HTTPS-Adresse ohne internen Port. Die gesamte Website, API, Geodaten und Socket.IO werden weitergereicht.

**Getrennte Container:** `127.0.0.1` erreicht nur den eigenen Container. Dann das Spiel gegebenenfalls an `HOST=0.0.0.0` binden, einen tatsächlich erreichbaren veröffentlichten Spielport oder ein gemeinsames internes Netz verwenden und `reverse_proxy` auf diesen Endpunkt setzen. In `.env` ausschließlich die exakten unmittelbaren Caddy-Quelladressen vertrauen, die der Spielserver sieht. Keine pauschale Freigabe ganzer privater Netze. AMP-Verwaltungsport 8080 ist kein Spielport. Details: [Netz und Caddy](AMP-TECHNIK.md).

## Bereitschaft und kurzer Funktionstest

Nach Start muss die Konsole **„Spiel bereit: …; Browseradresse: …“** melden. Diese Meldung folgt erst nach Routingprüfung, Datenbanköffnung und erfolgreichem Binden des Spielports.

Danach im Browser `https://gaminglive.mooo.com` öffnen: gültiges Zertifikat, Spielanmeldung statt Testantwort, anmelden und Karte öffnen. Die Verbindung muss online bleiben; nach Neuladen müssen Wachen und Guthaben erhalten sein. Zusätzlich `https://gaminglive.mooo.com/api/health` prüfen. HTTP muss auf dieselbe öffentliche HTTPS-Adresse weiterleiten, ohne `:18443`. Eine funktionierende HTTPS-Testantwort beweist noch keinen betriebsbereiten Spielserver.

Diese Anleitung beschreibt die vorgesehenen Felder und geprüften Anwendungseinstiege. Private AMP-Portzuordnung, Container-Netz, Volume-Mounts, Routerweiterleitungen und Caddy-Konfiguration sind vor Ort zu prüfen.
