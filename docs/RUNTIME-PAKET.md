# Fertiges Linux-Serverpaket

Der Release-Entwurf enthält die gebaute Website, den Node.js-Server und seine exakt gesperrten Produktionsabhängigkeiten. Auf dem Spiel-PC ist nur ein aktueller Desktopbrowser nötig. Dies ist kein Windows-Programm und kein Quellcode-ZIP.

## Installation ohne Build

Node.js 24 bereitstellen. SHA256SUMS mit `sha256sum -c SHA256SUMS` prüfen. Das tar.gz in ein neues leeres Programmverzeichnis entpacken. `.env.example` nach `.env` kopieren und öffentliche HTTPS-Adresse, tatsächlichen Port und dauerhaftes DATA_DIR außerhalb des Programmverzeichnisses eintragen. `node dist/server/index.js` startet die Anwendung. Kein npm-Install und kein Build beim Start erforderlich. Hinter einem Reverse Proxy die tatsächlichen Proxy-Adressen konfigurieren; Details in docs/AMP.md. Die mitgelieferte Kommandozeile `node dist/server/cli.js` verwendet dieselbe Konfiguration.

Keinen bestehenden Datenordner überschreiben. Updates in ein neues Programmverzeichnis entpacken, den alten Server sauber stoppen und die vorhandene Konfiguration mit demselben DATA_DIR verwenden. Vorher eine geprüfte Sicherung erstellen. Keine Datenbank oder Zugangsdaten sind im Paket enthalten.

## Kontrollierte Herstellung

Nur ein sauberer main-Checkout, Node.js 24 und ein frischer Build desselben Commits sind zugelassen. `LV_OFFLINE_NEWS=1 node scripts/amp-setup.mjs` baut mit den versionierten freigegebenen Projektmeldungen. `node scripts/package-runtime.mjs` erstellt unter Linux das Archiv, SHA256SUMS und ein Datei-/Commitmanifest in .tools/releases. Zwei Verpackungsläufe derselben Eingaben müssen bytegleiche Prüfsummen liefern. Abhängigkeiten werden mit frozen lockfile und ohne Installationsskripte installiert.

`node scripts/runtime-smoke.mjs ARCHIV.tar.gz` entpackt in ein isoliertes temporäres Verzeichnis und prüft echten Serverstart, Website, Registrierung, autorisierten Spielstand sowie erneuten Zugriff nach Serverneustart. Der Release-Workflow läuft ausschließlich manuell, verlangt einen auf main bereits erfolgreich geprüften Commit und erzeugt nur einen Entwurf. Eine stabile Freigabe und Produktionsbereitstellung erfolgen dadurch nicht.
