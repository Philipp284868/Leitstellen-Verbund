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

## Tatsächlich erfolgreicher GitHub-Browserlauf

[GitHub Actions, Lauf 34027009569](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34027009569) hat für Commit `31c52b5e6994311851fd6621869cb713a8986fed` sämtliche Prüfungen erfolgreich abgeschlossen: TypeScript, ESLint, 25 Vitest-Tests, Produktionsbuild und **24 Playwright-Tests, jeweils zwölf in echtem Chromium und Firefox**. Die Linux-Browser wurden im Workflow installiert. Die Browserprüfung dauerte etwa 8,8 Minuten. Damit sind auch Vier-Spieler-Verbund, Offline-Neustart, duplizierte Abschlussbelege und Verbindungsabbruch in beiden Browsern geprüft.

Die lokale Sichtprüfung mit Edge 152.0.4191.66 lieferte keine Browserfehler und keinen horizontalen Überlauf bei 390 Pixeln Breite. Screenshots: [Desktop](leitstelle-desktop.png), [hell](leitstelle-hell.png), [mobil](leitstelle-mobil.png).

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

[Pull Request #1](https://github.com/Philipp284868/Leitstellen-Verbund/pull/1) wurde nach erfolgreicher Prüfung des letzten Feature-Commits `b7848b96f20d9ed16b94cb79c4fd13166237f194` tatsächlich in `main` gemergt. Merge-Commit: `284026949e3a44a068fcf795114a75401eca0aa0`.

- [Letzter PR-Prüflauf](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34027699533): erfolgreich, 25 Logiktests und 24 Browserprüfungen, Browserdauer 4,5 Minuten.
- [Prüfung des zusammengeführten main-Commits](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34028016727): erfolgreich, erneut 25 Logiktests und 24 Browserprüfungen in Chromium und Firefox.
- [Tatsächliches Pages-Deployment](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34028258675): Build und Deployment erfolgreich.

## Öffentliche HTTPS-Abnahme

Geprüfte Adresse: **[Leitstellen-Verbund](https://philipp284868.github.io/Leitstellen-Verbund/)**. Am 6. September 2026 um 12:45 Uhr deutscher Ortszeit lieferte der tatsächliche Browseraufruf HTTP 200. JavaScript, CSS und Manifest wurden erfolgreich geladen; keine Browser-Anwendungsfehler. Manifest-Start, Manifest-Scope und Service-Worker-Scope zeigen exakt auf `/Leitstellen-Verbund/`; der Browser bestätigt einen sicheren HTTPS-Kontext.

Anschließend wurden drei vorhandene Playwright-Abnahmeabläufe gegen diese öffentliche Adresse statt den lokalen Server ausgeführt. **Alle drei bestanden in 1,7 Minuten** mit Microsoft Edge 152.0.4191.66:

1. Neues Profil, Wache, Fahrzeug, Besatzung, vollständiger Solo-Einsatz, Belohnung, Rückkehr und Reload.
2. Zwei getrennte Profile mit eigenen Ressourcen, echter WebRTC-Angebot/Antwort-Austausch über die Oberfläche, Textchat und gemeinsamer Einsatz mit verbuchter Helferbelohnung.
3. Schreibgeschützter zweiter Tab und erneutes Öffnen des gecachten Produktionsspiels ohne Netzwerk.

Die HTTPS-Tests verwendeten frische isolierte Browserkontexte. Die Beschränkung bezüglich beliebiger Internetanschlüsse und ungetesteter eigener TURN-Server bleibt bestehen. Dieser Abschlussnachtrag ändert nur Dokumentation; der bereits öffentlich getestete Anwendungscode bleibt identisch.
