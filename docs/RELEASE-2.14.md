# Version 2.14.0 – PC-Multiplayer

Dieser Stand ist ein Release-Entwurf. Er wird nicht automatisch stabil veröffentlicht oder auf einem Spielserver installiert.

- Ausschließlich serverbasierter Multiplayer; keine aktive Einzelspieler-Umschaltung oder lokale Ersatzsimulation.
- Historische Einzelspielerstände bleiben geschützt und können kontogebunden als Archiv exportiert werden. Schema 11 und vorhandene Multiplayerfortschritte bleiben erhalten.
- Desktop-Hauptmenü mit Spielen, Leitstellen, Hilfe, veröffentlichten Projektneuigkeiten, Einstellungen und Abmeldung. Dominante Spielkarte mit Einsatzliste, rechter Disposition und unterer Werkzeugleiste.
- Desktopgrößen von 1366 × 768 bis 3440 × 1440; Hinweis für zu kleine Fenster. Smartphone-Sonderlayouts entfernt.
- Bestehende Berechtigungen, gemeinsame Leitstellen, Unterstützungsanfragen, Notrufe, AAO, FMS, Level, 100-km-Welt und straßenabhängige Fahrten bleiben erhalten.
- Sichere Projektmeldungen mit lokalem Ausfallersatz. GitHub ist für den Spielbetrieb nicht erforderlich.
- Begrenztes, idempotentes Herunterfahren bei offenen HTTP-Verbindungen.
- Vollständige Tests in getrennten CI-Stufen und Browserjobs, weiterhin einschließlich Linux-Betriebs- und Migrationstests.

## Installation

Das `linux-runtime.tar.gz` enthält gebauten Client und Server sowie Produktionsabhängigkeiten. Erforderlich ist Node.js 24 auf dem Linux-Server; Spieler benutzen einen Desktopbrowser. SHA256SUMS prüfen, in ein neues Programmverzeichnis entpacken und `.env` mit bestehendem externem DATA_DIR konfigurieren. `node dist/server/index.js` startet das Paket ohne erneuten Build. Die vollständige Anleitung liegt im Paket unter docs/RUNTIME-PAKET.md und docs/AMP.md. release.json nennt den genauen Quellcommit und die enthaltenen Dateien.

Vor Updates Sicherung prüfen und den bisherigen Server sauber stoppen. Keine Datenbank und keine Zugangsdaten sind enthalten. Keine automatische Rückübernahme alter Einzelspielerökonomie. Wiki-Erstveröffentlichung und GitHub Project benötigen noch den im Repository dokumentierten zusätzlichen Zugriff; integrierte Hilfe und Issues sind bereits nutzbar.

Das Hauptmenü und HUD folgen den Referenzlayouts. Die bestehende bedienbare Spielkarte ist weiterhin eine gezeichnete Karte, keine fotorealistische Satellitenaufnahme.
