# Tatsächlicher Testbericht – AMP-Architektur

Stand: 6. September 2026. Die folgenden Nachweise betreffen den Node-/SQLite-/Socket.IO-Umbau. Frühere Pages-/P2P-Tests gehören zum vorherigen Stand in der Git-Historie und werden hier nicht als Servernachweis verwendet.

## Tatsächlich lokal ausgeführt

Umgebung: Windows, Node.js 24.19.0, pnpm 11.19.0, Playwright 1.63.0 mit installiertem Microsoft Edge 152.0.4191.66. Alle Datenbanken und Testkonten wurden in isolierten temporären Verzeichnissen angelegt. Kein Test greift auf den privaten AMP-Server zu.

| Prüfung                                                       | Ergebnis                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| AMP-Setup ohne vorhandenes node_modules                       | Erfolgreich                                                           |
| Setup bei NODE_ENV=production einschließlich Build-Werkzeugen | Erfolgreich; Anwendung wird ausdrücklich als Produktionsbuild erzeugt |
| Vorhandene .env und SQLite-Sentineldatei beim Setup           | Nachher bytegleich, keine Löschung                                    |
| Reproduzierbare pnpm-Installation, keine npm-Lockdatei        | Erfolgreich                                                           |
| TypeScript strict und ESLint                                  | Erfolgreich                                                           |
| Produktionsbuild                                              | dist/client, dist/server/index.js und dist/server/cli.js erzeugt      |
| Vitest                                                        | **38 Tests in sechs Dateien erfolgreich**, ungefähr 4,9 Sekunden      |
| Reale Browserabnahme am gebauten Server                       | **Sechs Tests erfolgreich**, etwa 1,8 Minuten                         |
| Direkter Node-Start der gebauten index.js                     | Erfolgreich, HTTP und API am konfigurierten .env-Port                 |

Das saubere AMP-Setup wurde mit einer frischen Programmdateikopie ohne Projektabhängigkeiten gestartet. pnpm wurde durch das Skript lokal bereitgestellt; vorhandene Pakete konnten aus dem normalen pnpm-Store wiederverwendet werden. Es wurde kein unabhängiger Offline-Download aller Pakete behauptet. Der resultierende Produktionsclient umfasste rund 461 kB JavaScript, komprimiert etwa 144 kB, und 17 kB CSS.

## Logik, API und Betrieb

Die vorhandenen Prüfungen für Kataloge, Wirtschaft, Personal, Routen, Patienten, Fortschritt, Importvalidierung und lokale Sicherungen bleiben erhalten. Der überholte P2P-Pakettest wurde durch die Ablehnung freier Kontostände und alter P2P-Pakete an der Servergrenze ersetzt.

Zusätzliche Serverprüfungen bestätigen getrennte Konten, gesalzene Passwort-Hashes, ausschließlich gehashte Sitzungstoken, Einladungsbindung, Loginlimits, Origin-/CSRF-Prüfungen, Eigentumsprüfung, idempotente Aktionen und Ablehnung einer Aktions-ID mit anderem Inhalt. Echte Socket.IO-Clients prüfen Anmeldung, Klartextchat, falsche Origins und Sitzungswiderruf offener Kanäle. Ein gemeinsamer Patienteneinsatz endet ohne offene Browser und zahlt beiden Konten genau die vorgesehene Hälfte aus; Wiederholung und Weiterlaufen erzeugen keine zusätzliche Gutschrift.

Geprüft sind außerdem SQLite-Neuöffnung, konsistente Sicherung, Erhalt von Aktionsbelegen, kontrollierter Kooperationsabbruch, Speicherfehler ohne Teilbuchung, abgebrochene Migration mit unverändertem Altbestand, Ablehnung neuerer Schemata und Erhalt von Ratenlimits nach Neuöffnung. HTTPS-Konfiguration erzeugt Secure-/HttpOnly-/SameSite-Cookies und HSTS; gefälschte Proxy-Header ändern dies nicht. Das ist ein Konfigurationstest hinter einer simulierten TLS-Terminierung, kein Test eines realen öffentlichen TLS-Proxys.

Ein weiterer Prozess-Test kopiert den gebauten Server in eine isolierte Installation, legt eine .env an und startet tatsächlich `node dist/server/index.js`. Er führt Erstadministrator-Einrichtung über stdin, doppelte API-Aktion, CLI-Sperre bei laufendem Server, Backup, explizit freizugebenden Altimport, Wiederherstellung und erneute Anmeldung aus. Alte Sitzungen sind nach Restore ungültig. Windows beendet den Prozess bei SIGTERM hart; der dortige Test prüft deshalb zusätzlich das kontrollierte Freigeben eines nachweislich verwaisten Locks. Der Linux-CI-Test verlangt einen sauberen SIGTERM-Exitcode 0.

## Sechs reale Browserabläufe

1. Einladungsregistrierung, zwei getrennte Konten, eigene Wache und Besatzung, vollständiger Solo-Einsatz, Belohnung, Rückkehr und Reload.
2. Gemeinsamer Einsatz; Helferbrowser schließen, Server trotzdem abschließen lassen, erneut anmelden; Server neu starten und tatsächliche CLI-Datenbankwiederherstellung mit unverändertem Besitz prüfen.
3. Zwei Tabs desselben Kontos sehen denselben Fortschritt. Offline werden Aktionen abgewiesen; Wiederverbindung hebt die Sperre auf.
4. Eigener Export und validierte Dateivorschau. Es existiert kein Button zur eigenmächtigen Besitzübernahme; beschädigte Dateien werden abgelehnt.
5. Chat bleibt Klartext. Abmelden widerruft die Sitzung und entfernt private Kontodaten und Chatansicht.
6. Mobilansicht bei 390 × 844 Pixeln ohne horizontalen Überlauf, keine Browser-Anwendungsfehler und keine notwendigen Requests außerhalb des eigenen Serverursprungs.

## Gefundene und behobene Fehler

- Gleichadressiges Socket.IO-Long-Polling enthielt nicht immer einen Origin-Header. Gleichadressige Browseranfragen werden jetzt zusätzlich anhand von Fetch-Metadaten zugelassen; Cookie und CSRF bleiben zwingend.
- SVG-DOMPoint-Koordinaten waren nicht als normale JSON-Felder serialisierbar. Bauaktionen übertragen jetzt begrenzte numerische x/y-Werte.
- Der Setup-Installationsmodus konnte zu einem React-Entwicklungsbundle führen. Der separate Build-Prozess erzwingt jetzt NODE_ENV=production.
- Das lokal heruntergeladene pnpm wurde zunächst vom Linter durchsucht. Ausschließlich dieses Fremdwerkzeugverzeichnis wird nun wie node_modules vom Projektlint ausgeschlossen.

Fehlgeschlagene Prüfungen wurden behoben und erneut ausgeführt. Die früheren P2P-Browserabläufe wurden aufgrund der ausdrücklich ersetzten Architektur durch Serverabläufe ersetzt, nicht als bestandene neue Tests ausgegeben.

## GitHub und Grenzen

Arbeitsbranch: `feature/amp-authoritative-server` im Repository `Philipp284868/Leitstellen-Verbund`. Der PR-CI-Workflow führt das AMP-Setup auf einer frischen Linux-Installation aus und prüft Chromium und Firefox. Der tatsächliche CI-Lauf wird im Pull Request verlinkt; bis zu dessen Abschluss wird kein zusätzlicher Firefox-Erfolg behauptet.

Keine Installation auf dem privaten AMP-Server und keine Prüfung seiner tatsächlichen Ports, Containerzuordnung, DNS-Adresse oder TLS-Konfiguration. Diese Betreiberabnahme bleibt erforderlich. Der bisherige Pages-Workflow ist im Branch entfernt, die bestehende Pages-Konfiguration und alte Browserstände wurden nicht gelöscht. Der vorhandene Lastfall 100 Wachen/300 Fahrzeuge/1.800 Mitarbeiter/50 Einsätze wird weiter gemessen (PERFORMANCE.json); dies ist keine Lastzusage für beliebig viele gleichzeitige Serverkonten.
