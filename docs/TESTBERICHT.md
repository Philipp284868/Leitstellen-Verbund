# Tatsächlicher Testbericht

## Lokale Umgebung

- Datum: 6. September 2026
- Betriebssystem: Windows, lokaler Codex-Arbeitsbereich
- Node.js: 24.19.0
- pnpm: 11.19.0; Installation und Lockdateiprüfung tatsächlich ausgeführt
- Browser: installierter Microsoft Edge mit Chromium-Engine, Playwright 1.63.0
- Testadresse: `http://127.0.0.1:4173/Leitstellen-Verbund/`
- Getestet wird der Produktionsbuild, nicht ein Entwicklungs-Mockup.

## Bereits ausgeführte Prüfungen

| Prüfung                                                  | Ergebnis                               |
| -------------------------------------------------------- | -------------------------------------- |
| Installation / reproduzierbare Lockdatei                 | Erfolgreich                            |
| TypeScript strict / `pnpm typecheck`                     | Erfolgreich                            |
| ESLint / `pnpm lint`                                     | Erfolgreich                            |
| Vitest / `pnpm test`                                     | 25 Tests erfolgreich                   |
| Vite-Produktionsbuild einschließlich Service Worker      | Erfolgreich                            |
| Vollständiger Chromium-Browserlauf                       | 11 Tests erfolgreich, etwa 3,9 Minuten |
| Zusätzlicher Vier-Spieler-Lauf                           | Erfolgreich                            |
| Wiederverbindung nach Reload mit erneutem Abschlussbeleg | Erfolgreich, keine zweite Auszahlung   |

Die Testquellen decken den ersten Solo-Einsatz, Ausbildung und weitere Organisation, Reload, Dateiimport, beschädigte und veraltete Dateien, verweigerte Speicherung, echte WebRTC-Verbindungen, gemeinsame Patientenbeförderung, feste geteilte Belohnungen, duplizierte Nachrichten, falsche Absender, Abbruch mit Rückruf, Weiterbetrieb ohne Einladenden, Web Lock, Offline-Cache und GitHub-Pages-Unterpfad ab. Erweiterte Spielstände werden über die echte Importoberfläche in den Browser eingebracht; Testhilfen sind ausschließlich unter `tests/` vorhanden und nicht im Produktionsbundle.

Im gemeinsamen Patiententest erhalten beide Spieler je 4.250 Credits. Wiederholte Nachrichten, Reload und erneute Zustellung eines zuvor nicht quittierten Belegs ändern diesen Betrag nicht erneut.

Gefundene Fehler wurden behoben, darunter ein zu früh bedienbarer Ausbildungsstart, Kartenüberlauf, Rückruf nach Verbindungsverlust und ein ungeeigneter Textvergleich im Reload-Test. Fehlschlagende Prüfungen wurden nicht übersprungen oder auf „skip“ gesetzt.

## Lastmessung

Testfall: 100 eigene Gebäude, 300 Fahrzeuge, 1.800 Mitarbeiter und 50 aktive Einsätze. Die JSON-Daten umfassen etwa 439 kB in kompakter Form. Zuletzt gemessen: rund 20 ms für Schema-/Referenzvalidierung und 2 ms für 32 Sekunden Simulation. Der Browserablauf mit Import, Darstellung und Öffnen des Fuhrparks dauerte im vollständigen Lauf rund 1,5 Sekunden. Einzelmessungen schwanken; dies ist kein plattformübergreifendes Leistungsversprechen. Exakte letzte Logikmessung: [PERFORMANCE.json](PERFORMANCE.json).

## Nicht lokal ausgeführte Browser

`playwright install chromium firefox` sowie der separate Firefox-Installationsversuch wurden tatsächlich gestartet. Die offiziellen CDN-Downloads brachen wiederholt mit 30-Sekunden-Zeitüberschreitungen ab. Deshalb sind die lokalen Chromium-Prüfungen mit dem bereits installierten Edge ausgeführt worden. Ein lokaler Firefox-Erfolg oder ein Test auf zwei verschiedenen Internetanschlüssen wird nicht behauptet.

## GitHub und Pages

- Zugewiesenes Repository: `Philipp284868/Leitstellen-Verbund`
- Vorhandener Startstand: `1ee100a3bb8343420243344012bc67229f153dcf`, ausschließlich README
- Standardbranch: `main`; bei Prüfung nicht geschützt
- Arbeitsbranch: `feature/leitstellen-verbund`
- Connector: Lesen, Schreiben und Administration bestätigt
- Terminal: Read und Push-Dry-Run erfolgreich; authentifizierter API-Zugriff vorhanden
- Workflow-Scope: `workflow` vorhanden, Standard-Workflow-Rechte auf `read`
- Pages: tatsächlich mit `build_type: workflow` eingerichtet, HTTPS erzwungen
- `github-pages`-Umgebung: vorhanden, von GitHub mit Branch-Policy eingerichtet

Ein konfiguriertes Pages-Ziel ist kein erfolgreicher Deploymentnachweis. Commit, Pull Request, tatsächlicher CI- und Deploymentstatus werden nach den betreffenden Aktionen ergänzt. Bis dahin ist keine öffentliche Spieladresse als geprüft freigegeben.
