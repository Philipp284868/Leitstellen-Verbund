# Leitstellen-Verbund – eigener AMP-Server

Version **2.1.0** ergänzt den vorhandenen Node.js-24-Spielserver um den **AMP-Einfachstart mit automatischem Administratorkonto und bearbeitbarer `admin-konto.json`**. Keine separate Einrichtungsdatei und kein SSH für die Admin-Ersteinrichtung mehr. Bereits vorhandene Konten, Passwörter und Spielstände bleiben erhalten.

Die lokale Karte, 8 Gebäudetypen, 20 Fahrzeugtypen, 40 Einsätze, Personal, Ausbildung, Patienten, Wirtschaft und Oberfläche bleiben erhalten. Jeder Spieler meldet sich mit einem eigenen eingeladenen Konto an. Der Server simuliert auch bei geschlossenem Browser weiter.

**[Einfach in AMP starten und Admin bearbeiten](docs/AMP-EINFACH.md)** · [AMP-Betriebsanleitung](docs/AMP.md) · [Spielanleitung](docs/SPIELANLEITUNG.md) · [Gemeinsam spielen](docs/MULTIPLAYER.md) · [Tatsächlicher Testbericht](docs/TESTBERICHT.md)

## Installation und Betrieb

Voraussetzung: Node.js 24. Keine globale pnpm- oder Administratorinstallation erforderlich:

    node scripts/amp-setup.mjs

Danach `.env.example` als `.env` konfigurieren, insbesondere HOST, den tatsächlich zugewiesenen PORT, PUBLIC_URL und einen dauerhaften Datenordner außerhalb des Programms. Eine vorhandene `.env` nicht überschreiben. Bei leerem DATA_DIR verwendet die Anwendung standardmäßig `leitstellen-data` neben dem Programmordner; bei Containerbetrieb muss auch dieser Ordner dauerhaft eingebunden sein.

In AMP dauerhaft **App Name = `dist/server/index.js`**, anschließend normal starten:

    node dist/server/index.js

Bei einer leeren Datenbank entsteht automatisch das Konto `philipp` mit einem individuellen Zufallspasswort. Zugangsdaten stehen privat im AMP-Dateimanager in `admin-konto.json` neben `package.json`. Nach der ersten Anmeldung wird das initiale Klartextpasswort aus dieser Datei entfernt; das Passwort bleibt gültig. Für spätere Änderungen die Datei bearbeiten, `aenderungenAnwenden` auf `true` setzen und den Spielserver neu starten. Ein vorhandener Administrator wird ohne Passwortwechsel übernommen. Ausführliche Feldbeschreibung: [AMP-Einfachstart](docs/AMP-EINFACH.md).

Diese eine Anwendung liefert dist/client aus, bedient /api und /socket.io auf demselben Port und verwendet eine lokale SQLite-Datenbank. Es gibt keinen externen Login, keine Cloud-Datenbank, keine externen Karten oder Fonts, kein WebRTC/STUN/TURN und keine Pages-Abhängigkeit. Der Server wird nicht durch Vite ersetzt.

## Entwicklung und Prüfung

Paketmanager ist weiterhin exakt pnpm 11.19.0 mit pnpm-lock.yaml. Das Bootstrap-Skript stellt ihn unter .tools/pnpm-11.19.0/bin/pnpm.cjs bereit; bei vorhandenem pnpm funktionieren die üblichen Befehle:

    pnpm install --frozen-lockfile --prod=false
    pnpm typecheck
    pnpm lint
    pnpm build
    pnpm test
    pnpm exec playwright install --with-deps chromium firefox
    pnpm test:e2e

`test` läuft ohne Watchmodus. `build` erstellt den Produktionsclient und dist/server/index.js sowie dist/server/cli.js. `dev` verwendet Node --watch auf dem gebauten Server; nach Quelländerungen erneut `build` ausführen. `preview` und `start` starten denselben echten Server. Lokal kann PW_EDGE=1 den installierten Edge für das Chromium-Projekt wählen. Die Browserprüfungen starten isolierte Instanzen des gebauten Servers mit temporären Datenbanken. Testkonten sind ausschließlich in tests definiert und werden im normalen Betrieb nicht angelegt.

Neu sind Admin-Dateitests und ein echter Prozess-/HTTP-Test für Ersteinrichtung, Dateischutz, Passwortänderung, Neustart und Sitzungssperre. Ob und wo Prüfungen tatsächlich erfolgreich liefen, steht im jeweiligen CI-Lauf; vorhandene Ergebnisse von Version 2.0 gelten nicht automatisch als Nachweis für neue Änderungen.

## Daten und Sicherheit

Der Browser übermittelt geprüfte Spielaktionen mit eindeutigen IDs. Besitz, Preise, Verfügbarkeit, Fortschritt und Belohnungen werden in SQLite-Transaktionen verarbeitet. Wiederholte IDs können keine zweiten Käufe auslösen. Servergenerierte Kooperationsrunden und persistierte Auszahlungsbelege verhindern doppelte Helferbelohnungen.

Passwörter sind in SQLite gesalzen mit scrypt gehasht. Die private Admin-Datei enthält nur beim erstmaligen Bereitstellen oder bei einer beantragten Passwortänderung kurzzeitig Klartext und darf nicht geteilt werden. Sie wird nicht über HTTP ausgeliefert, nicht in Git eingecheckt und unter Linux mit `0600` geschützt. Sitzungen liegen widerrufbar und als gehashte Token in SQLite. Cookies sind HttpOnly und SameSite=Strict, für HTTPS zusätzlich Secure. Origin-/CSRF-Prüfungen und persistente Anmelderatenbegrenzung schützen die API. Proxy-Header werden nur bei ausdrücklich konfigurierten unmittelbaren Proxy-Adressen berücksichtigt.

Exportdateien und freiwillige lokale Sicherungen bleiben verfügbar. Dateien werden im Browser nur validiert angezeigt; verbindlicher Import erfordert die ausdrückliche Offline-Freigabe eines Administrators. Serverbackups sind konsistent, Migrationen transaktional, Wiederherstellungen geprüft. Siehe [Datenspeicherung](docs/DATEN.md).

## Umstellung von Pages

Der Server-Umbau liegt auf feature/amp-authoritative-server als Pull Request. Er entfernt den automatischen Pages-Workflow, deaktiviert aber nicht eigenmächtig die bisherige öffentliche Seite. Vor Abschaltung alte Browserstände exportieren, den eigenen AMP-Server einrichten und dessen HTTPS-Adresse prüfen. Ein GitHub-Zugriff ist kein Zugriff auf den privaten AMP-Server; eine dortige Installation wird nicht behauptet.

[Architektur](docs/ARCHITEKTUR.md) · [Serverprotokoll](docs/PROTOKOLL.md) · [Abnahme](docs/ABNAHME.md) · [Quellen und Lizenzen](docs/LIZENZEN.md)
