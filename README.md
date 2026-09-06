# Leitstellen-Verbund

Ein deutsches Browser-Aufbauspiel für die fiktive Region Falkenried. Jeder Browser besitzt seinen eigenen Spielstand. Freunde verbinden sich freiwillig über echte WebRTC-Datenkanäle. Es gibt kein Spielkonto, keine zentrale Spielstand-Datenbank und keinen dauerhaften Spielserver.

**Version 1.0:** Die implementierten Systeme, tatsächlich ausgeführten Prüfungen und Umgebungsgrenzen sind in [Abnahme](docs/ABNAHME.md) und [Testbericht](docs/TESTBERICHT.md) getrennt dokumentiert. Der Testbericht unterscheidet lokalen Build, GitHub-CI und überprüfte Veröffentlichung.

## Spielen

1. „Neues Spiel“ wählen und Anzeigenamen sowie Leitstellennamen eingeben.
2. Feuerwache bauen, Bauzeit abwarten, zwei TSF-W beschaffen und zwölf Mitarbeiter einstellen.
3. Im Fuhrpark jedes Fahrzeug mit sechs Mitarbeitern besetzen.
4. Einsatz auswählen, Anforderungen prüfen, Fahrzeuge alarmieren und Belohnung erhalten.
5. Ab Stufe 2 Rettungsdienst, Polizei und Ausbildung erschließen. THW und Wasserrettung folgen ab Stufe 3, Luftrettung ab Stufe 4.

Die erste Wache mit zwei TSF-W und zwölf Mitarbeitern kostet 98.200 der 250.000 Startcredits. Es gibt keine laufenden Pflichtkosten. Unter Fortschritt ist jederzeit ein öffentlicher Bereitschaftsdienst als Verdienstmöglichkeit ohne Fahrzeuge erreichbar.

Für gemeinsames Spielen siehe [Zwei-Spieler-Anleitung](docs/MULTIPLAYER.md). Alle wichtigen Hinweise sind auch direkt in der Spielhilfe enthalten.

## Entwicklung

Voraussetzung: Node.js 24 und pnpm 11.19.0. Die Lockdatei ist `pnpm-lock.yaml`.

```sh
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm dev
```

Die npm-Skripte heißen `dev`, `build`, `preview`, `typecheck`, `lint`, `test` und `test:e2e`. Nach Installation der Abhängigkeiten sind auch `npm run build` oder `npm run test` nutzbar. Installation und CI verwenden ausschließlich die committed pnpm-Lockdatei.

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install --with-deps chromium firefox
pnpm test:e2e
```

`test` beendet sich ohne Watchmodus. Browserprüfungen testen den **Produktionsbuild unter `/Leitstellen-Verbund/`**. `scripts/serve.mjs` dient ausschließlich der lokalen Abnahme. Spieler benötigen diesen Server nicht.

Auf Windows kann der vorhandene Microsoft Edge für den Chromium-Test verwendet werden:

```powershell
$env:PW_EDGE = '1'
pnpm test:e2e --project=chromium
```

## Statischer Build und GitHub Pages

`pnpm build` erzeugt ausschließlich statische Dateien in `dist/`, einschließlich Manifest, lokaler Karte und eines aus den tatsächlichen Builddateien erzeugten Service Workers. Ohne `VITE_BASE` sind Assetpfade relativ. Pages setzt `VITE_BASE` auf den tatsächlichen Repository-Unterpfad.

Das Zielrepository ist **Philipp284868/Leitstellen-Verbund**, Standardbranch **main**. Der CI-Workflow prüft Pull Requests mit ausschließlich lesenden Repository-Rechten. Der Pages-Workflow reagiert nur auf einen erfolgreichen Push-Prüflauf von `main`, baut exakt dessen Commit und veröffentlicht über die `github-pages`-Umgebung. Nur der Deployment-Job erhält `pages: write` und `id-token: write`.

Eine konfigurierte Pages-Adresse ist noch kein Nachweis einer erfolgreichen Veröffentlichung. Den tatsächlichen Stand von Push, Pull Request und Deployment dokumentiert der Testbericht.

## Daten und Netzwerk

- Eigene Daten werden in IndexedDB gespeichert; Käufe und Abschlüsse werden erst nach erfolgreicher Transaktion angezeigt.
- Web Locks verhindern zwei schreibende Tabs derselben Installation. Browser ohne Web Locks erhalten nur lesenden Zugriff.
- Fünf lokale Sicherungen bleiben erhalten. Eine exportierte Datei ist die Sicherung außerhalb des Browsers.
- Ein Import überschreibt niemals ungeprüft: Vorschau, Sicherung des bisherigen Stands und neue Spielstandgeneration.
- STUN/TURN-Zugangsdaten befinden sich ausschließlich im Arbeitsspeicher. Sie werden nicht exportiert, geloggt oder gecacht.
- Ohne einen konfigurierten STUN-Dienst ist die Verbindung in der Regel auf direkt erreichbare Netzwerke beschränkt. Ein ausdrücklich aktivierbarer kostenloser Cloudflare-STUN-Dienst ist in der Oberfläche dokumentiert. Für restriktive Anschlüsse ist eigener TURN nötig.
- Das ist ein Vertrauensspiel unter Freunden, keine manipulationssichere Wettbewerbsplattform und keine reale Einsatzplanungssoftware.

Weitere Informationen: [Spielanleitung](docs/SPIELANLEITUNG.md), [Architektur](docs/ARCHITEKTUR.md), [Protokoll](docs/PROTOKOLL.md), [Datenschutz und Sicherungen](docs/DATEN.md), [Quellen und Lizenzen](docs/LIZENZEN.md).
