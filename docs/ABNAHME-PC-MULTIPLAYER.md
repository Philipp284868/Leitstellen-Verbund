# PC-Multiplayer: Abnahme und verbleibende Einrichtung

> Historischer Nachweis des im Dokument genannten Stands. Frühere Karten, Bedienwege und Prüfzahlen sind keine aktuelle Produktanleitung. Aktuell: [Deutschland](DEUTSCHLAND.md), [Entwicklung](ENTWICKLUNG.md), [Laufzeitmessungen](TESTLAUFZEITEN.md).

Stand: 08.09.2026. Dieser Bericht trennt nachgewiesene Ergebnisse von noch ausstehender Freigabe. Der zugehörige Git-Commit und dessen Actions-Prüfung sind maßgeblich; ein früherer grüner Lauf bestätigt keinen späteren Commit.

## Produkt und Bestandsschutz

Aktiver Einzelspieler aus Menü, Store-Umschaltung, HTTP-/Socket-Moduszugriff und laufender Serverwelt entfernt. Kein eigener Offline-Start oder lokaler Simulationsersatz. Einzelne Disponenten dürfen selbstverständlich allein auf dem Multiplayer-Server spielen. Historische SQLite-Migrationen und die solo_saves-Tabelle bleiben aus Gründen des Bestandsschutzes bestehen. Eigenes Archiv kann authentifiziert über die Sicherungsoberfläche oder offline über archive-export exportiert werden. Fremder Besitz ist nicht exportierbar; Archive sind kein Importweg in die Multiplayerökonomie.

Schema 11 bleibt erhalten. Keine Rücksetzung von XP, Geld, Gebäuden oder Fahrzeugen. Die gemeinsame Simulation, Routing, Kataloge, Authentifizierung, Audio und freiwillige Backups bleiben bestehen. Gemeinsame Leitstellen arbeiten weiterhin berechtigt zusammen; unabhängige Leitstellen teilen neue Einsätze nicht automatisch. Unterstützungsanfragen bleiben ausdrücklich erforderlich. Weltgröße 100 × 100 km, Straßengeschwindigkeiten, ETA, Fahrten, Level und Freischaltungen sind weiterhin serverseitig verbindlich.

Entfernt sind spezielle Smartphone-CSS-Anordnungen, aktive Modusauswahl, Solo-Spielstart und ehemalige Menüeinstiege. Gemeinsame Pointer-Steuerung und Desktop-Media-Queries bleiben. Unter 1100 px Breite oder 650 px Höhe erscheint ein geordneter Hinweis. Verwendete Abhängigkeiten wurden erhalten: Dexie unterstützt weiterhin freiwillige Sicherungen/Archive; keine begründbar überflüssige Abhängigkeit wurde lediglich für eine kleinere Paketliste entfernt.

## Oberflächen und tatsächliche Bilder

Menü: links sechs funktionierende Einstiege, rechts Profil, echter verbundener Server, Leitstellenwerte und freigegebene GitHub-Meldung. HUD: obere Statusleiste, Einsatzliste links, dominante Karte, rechte Disposition und untere Werkzeuge. Keine erfundene globale Serverliste. Nachrichten sind Klartext mit erlaubten GitHub-Quellen, gesammelt beim Build; ein gebündelter lokaler Fallback verhindert eine Spielblockade bei Ausfall.

Alle acht Aufnahmen wurden mit der gebauten Anwendung und isolierten Testkonten erzeugt. Die Werte gehören zu einer Testwelt, nicht zu einem privaten Spielerstand.

| Größe       | Hauptmenü                                                                                                                                      | Spiel-HUD                                                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1920 × 1080 | [Menü](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.14/menu-1920.png) | [HUD](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.14/hud-1920.png) |
| 2560 × 1440 | [Menü](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.14/menu-2560.png) | [HUD](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.14/hud-2560.png) |
| 1366 × 768  | [Menü](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.14/menu-1366.png) | [HUD](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.14/hud-1366.png) |
| 3440 × 1440 | [Menü](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.14/menu-3440.png) | [HUD](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.14/hud-3440.png) |

Die Referenzkomposition wird übernommen, die Karte bleibt eine gezeichnete fiktive Spielkarte. Sie ist keine fotorealistische Satellitenansicht. Die Einsatzdetails zeigen tatsächlich vorhandene Notruf-/AAO-Funktionen statt einer rein dekorativen Brandfotografie. Moderne Desktopbrowser sind Zielplattform; keine Windows-EXE und keine neue mobile Version.

## Prüfungen und Laufzeit

Lokaler Build/Typecheck und Lint bestanden. Der Windows-Vitest-Lauf hatte 173 bestandene Fälle und einen ausdrücklich fehlgeschlagenen Linux-SIGTERM-Test. Der separat ausgeführte Windows-Node-Lauf hatte 13 Erfolge, zwei EPERM-Symlinkfehler und einen Prozess-Timeout. Diese Ergebnisse werden nicht als vollständige lokale Freigabe ausgegeben. Die entsprechenden Linux-Prüfungen bleiben in CI verpflichtend.

Am veröffentlichten Stand efa9511 bestanden 174 Vitest- und 16 Node-Betriebsfälle auf Ubuntu/Node 24.20.0. Cold-Setup, Audit, bytegleiche doppelte Runtime-Verpackung und echter Paketstart einschließlich Registrierung und Neustart bestanden. Die CodeQL-Ausführung war erfolgreich; anschließend waren keine offenen CodeQL-Funde vorhanden. Der erste parallele Browserlauf scheiterte ausschließlich an den beiden CPU-konkurrierenden Lastmessungen. Die Korrektur führt diesen unveränderten Lasttest anschließend mit einem Worker aus. Die Korrektur bestand vollständig in Actions 34216504365 (01ebfc3): 174 Vitest-, 16 Node- und 76 Browserfälle, beide Lastmessungen ohne erhöhte Grenze. CodeQL 34216504535 bestand ebenfalls. Die finale Remote-Prüfung nach dem zusätzlichen Entwicklungsstart-Test wird im Abschlussbericht und in den verknüpften Issues mit ihrem tatsächlichen Run angegeben.

[Messwerte, Teststufen und Engpässe](TESTLAUFZEITEN.md). Der Quick-Check ist keine vollständige Abnahme. Keine Tests wurden zur Erzeugung grüner Ergebnisse übersprungen und keine Leistungsgrenze erhöht.

## Git und GitHub

main war bereits Standardbranch und wurde direkt verwendet. Vor Beginn waren main und dev identisch; unmittelbar vor dev-Löschung erneut 0 exklusive Commits geprüft. dev wurde lokal und remote gelöscht. Zwei ältere vollständig integrierte lokale Feature-Branches, deren Remotes bereits entfernt waren, wurden einzeln geprüft und gelöscht. Nur main bleibt als regulärer Branch. Keine offenen fremden PRs oder uncommitteten Änderungen wurden überschrieben, keine Historie umgeschrieben.

Veröffentlichte Teilstände: 2650a13 (Regeln/Issue-Formulare), e80ee67 (begrenzter idempotenter Serverstopp), 7c2575a (PC-Multiplayer), efa9511 (Projektmeldungen, Teststufen, CI, Runtime- und Release-Ablauf). Die aktuelle Abnahme und weitere Korrekturen sind eigenständige normale main-Commits. Kein künstlicher PR, kein neuer Arbeitsbranch, keine automatische Produktionsbereitstellung.

Tatsächlich eingerichtet: Issues #19–22, sechs Labels, Discussions #23–25, aktualisierte README/CONTRIBUTING/SECURITY und Issue-Formulare, Dependabot-Warnungen, privater Sicherheitsmeldeweg, Secret Scanning, Push Protection und CodeQL. Keine automatische Dependency-Branchflut. GitHub Pages und Container Registry werden nicht zusätzlich eingerichtet, da der eigene Node.js-Server und das geprüfte Linux-Paket den Betrieb abdecken.

Nachtrag vom 08.09.2026: Die [deutsche Wiki](https://github.com/Philipp284868/Leitstellen-Verbund/wiki) ist veröffentlicht. Das private [Entwicklungsboard](https://github.com/users/Philipp284868/projects/1) ist über die angemeldete Browsersitzung eingerichtet, mit dem Repository verknüpft und mit den tatsächlichen Issues #19, #20, #21, #22 und #26 befüllt. Die sechs Status und beide Ansichten sind eingerichtet. Zusätzliche API-Scopes waren dafür nicht nötig. Die früheren Einrichtungshindernisse sind behoben. [Wiki-Nachweis](WIKI-VEROEFFENTLICHUNG.md) und [Project-Konfiguration und Prüfung](PROJECT-EINRICHTUNG.md).

Der Release-Workflow erstellt nach vollständiger Prüfung ausschließlich einen Entwurf mit Linux-Runtime, SHA256SUMS und Commit-/Dateimanifest. Das tatsächlich erstellte Release und sein Tag werden erst nach erfolgreicher manueller Ausführung im Abschlussbericht genannt. Ein Quellcodearchiv wird nicht als fertige Installation angeboten. Keine Produktionsdateien, Datenbanken, Passwörter oder Serversitzungen werden veröffentlicht.

## Wesentliche Änderungsorte

- Oberfläche: src/App.tsx, src/MainMenu.tsx, src/MainMenu.css, src/MenuPanels.tsx, src/GameHud.tsx, src/Hud.css, src/HudTheme.css, src/Panels.tsx, src/Desk.tsx, src/style.css, src/ProjectNews.tsx, src/project-news.ts.
- Multiplayer/Archive: src/mode.ts, src/store.ts, src/storage.ts, server/game.ts, server/database.ts, server/workspaces.ts, server/index.ts, server/cli.ts.
- Entwicklung/Prüfung: scripts/dev.mjs, scripts/tests.mjs, scripts/browser-tests.mjs, scripts/ci-summary.mjs, playwright.config.ts, vite.config.ts, tests/modes.test.ts, tests/shutdown.test.ts, tests/project-news.test.ts sowie die weiterhin vollständigen Desktopfälle in tests/e2e.
- Auslieferung: scripts/build.mjs, scripts/sync-project-news.mjs, scripts/package-runtime.mjs, scripts/runtime-smoke.mjs, scripts/release-draft.mjs, .github/workflows und die Betriebs-/Wiki-/Abnahmedokumentation.

Die vollständige Änderungsliste gegenüber 4d1c170 ist über Git nachvollziehbar. Historische Versionsberichte bleiben erhalten und sind keine aktiven Produktvorgaben.

Zusätzliche Live-Abnahme: Die lokale Vorschau auf localhost:5173 wurde mit einem getrennten Entwicklungskonto geöffnet. Nach einem echten Backend-Neubuild verband sie sich mit erhaltenem Konto wieder. Der Entwicklungsworker erhält den Stopp per IPC, sodass Windows-Neustarts SQLite und Sperre sauber schließen. Eine zuvor verwaiste Entwicklungssperre wurde nach nachgewiesen beendetem Prozess mit dem vorhandenen CLI-unlock entfernt; keinerlei Spielbestand wurde gelöscht. Freigegebene Nachrichten besitzen nun eine einzige Quelle in src/project-news-fallback.json; Vite importiert keine Dateien aus public. Testberichte lösen keinen unnötigen Hot Reload aus. Der neue Prozess-/Neustarttest besteht lokal und bleibt in der vollständigen CI enthalten.
