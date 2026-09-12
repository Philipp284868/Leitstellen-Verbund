# Leitstellen-Verbund

Kooperative Leitstellensimulation auf der Deutschlandkarte. Konten, Besitz und Simulation werden auf einem Node-24-Server mit SQLite verwaltet. Die Anwendung benötigt geprüfte Deutschland-Geodaten und einen passenden GraphHopper-Router.

- **Serverbetreiber:** [AMP-Installation, einmaliger Reset und normale Updates](docs/AMP.md).
- **Spieler:** [Spielanleitung](docs/wiki/Home.md).
- **Versionsverlauf:** [vollständiger Changelog](CHANGELOG.md).
- **Quellen und Rechte:** [Lizenz-/Datenhinweise](docs/LIZENZEN.md), [Sicherheit](SECURITY.md).

## Quellcode

| Ordner                               | Aufgabe                                                  |
| ------------------------------------ | -------------------------------------------------------- |
| `src/client/`                        | Oberfläche, Karte, Audio und Browserzustand              |
| `src/server/`                        | Authentifizierung, API, Echtzeit und Speicherung         |
| `src/shared/`                        | Gemeinsame Modelle, Protokolle und geografische Verträge |
| `src/simulation/`                    | Fachliche Einsatz- und Fahrzeugabläufe                   |
| `ops/runtime/`                       | Instanzverwaltung, Start, Update und bestätigter Reset   |
| `scripts/build/`, `scripts/release/` | Build, Paketierung und Freigabe                          |
| `scripts/geodata/`                   | Daten-/Katalogwerkzeuge                                  |
| `public/`, `data/`, `config/`        | Aktuelle Assets, Datenkataloge und Vorlagen              |
| `tests/`, `.github/`                 | Gezielte Regressionen und CI; nicht im Serverpaket       |

Die AMP-Vorlage und ihre JSON-Manifeste liegen für die automatische AMP-Erkennung in der Repositorywurzel. Das Produktionspaket enthält fertige Client-/Serverdateien, benötigte Laufzeitabhängigkeiten und Betriebswerkzeuge; es ist kein Git-Checkout.

## Entwicklung

Node 24 verwenden. Einmal `node scripts/amp-setup.mjs --install-only`, anschließend `node scripts/build/build.mjs`. Die lokale Entwicklerumgebung startet mit `node scripts/dev.mjs`. `pnpm check:quick`, `pnpm test:quick` und gezielte Integrationstests vor Änderungen; vollständige Produktprüfung und Paketabnahme laufen in GitHub. [Entwicklungsdetails](docs/ENTWICKLUNG.md).

Ein Git-Push aktualisiert keinen privaten Server. Der Betreiber löst Updates in AMP selbst aus. Ein Reset ist immer eine separate, instanzbezogen bestätigte Wartungsaktion.
