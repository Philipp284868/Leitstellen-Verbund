# Prüfbericht Einsatzbetrieb 2.18

Stand: 09.09.2026. Geprüft wurde die Erweiterung des bestehenden Repositorys ab `d0eacd4` auf Version 2.18.0. Dieser Bericht unterscheidet lokale Ergebnisse und die verpflichtende Linux-CI. Er behauptet keine Installation auf dem privaten AMP-Server.

## Lokale Abschlussprüfung

Windows, Node.js 24.19.0, pnpm 11.19.0, vorhandenes Edge über Playwrights Chromium-Projekt. Produktionsbuild für Rivermere und Deutschland einschließlich Typecheck erfolgreich. Globaler ESLint und `git diff --check` erfolgreich. `pnpm audit --prod --audit-level=high` meldete beim tatsächlichen Abruf keine bekannten Schwachstellen.

| Prüfung                                        | Tatsächliches Ergebnis                                                                                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finale Vitest-Prüfung, 54 Dateien, zwei Worker | **971 bestanden, ein vorhandener Windows-Symlink-Skip**; 81,45 s während parallelem Browserlauf                                                                              |
| AMP-Neustart per echtem SIGTERM                | Unter Windows separat versucht und an der verbliebenen Prozesssperre abgebrochen; dieser Test wurde aus obigem Windowslauf ausgeschlossen und bleibt unverändert in Linux-CI |
| Node-Betriebstests `hard-reset.node.mjs`       | Lokal 13 bestanden, zwei Symlinkfälle mit Windows-`EPERM`, ein Prozessfall nach 30 s abgebrochen; kein lokaler vollständiger Erfolg behauptet                                |
| Gesamter lokaler Browserumfang                 | **Alle 52 unterschiedlichen Abläufe erfolgreich abgedeckt**, einschließlich zwei isolierter Lastfälle; siehe genaue Laufaufteilung unten                                     |
| Neuer FF-/RD-Ablauf                            | Echte gestaffelte Anreise, Besatzung, Abfahrt, Nachforderung, Abschluss, Rückfahrt und Nachbereitung einschließlich Neustarts bestanden                                      |
| Neue lokale Audiofälle                         | Lange WAV >4 MB, MP3 und OGG, Quota-/Codecfehler, Ersatz, Zuordnung, Löschung, Reload, geschützte Priorität, Netzwerkisolation und Quellenfreigabe bestanden                 |
| Neue Archiv-/HUD-Abnahme                       | 73 aktive Einsätze, sechs Prioritäten, Reservehinweis ohne Sperre, 137 Berichte, Filter, alte Details, JSON-Export und Neustart bestanden                                    |

Der gemeinsame Browserlauf führte alle 50 normalen Abläufe und danach beide Lastfälle aus: **46 bestanden**, sechs alte Testannahmen schlugen fehl. Korrigiert wurden eine mehrdeutige Einstellungen-Schaltflächensuche, zwei Erwartungen sofort anwesender FF-Besatzung, zwei alte Fähigkeitsbezeichnungen statt des neuen Fahrzeugbedarfs und eine Hochwasserprüfung mit der früheren Zwei-Einsatz-Annahme. Danach bestanden die vier betroffenen Audio-/Phase-1-/Hochwasserabläufe gemeinsam und alle sechs Konto-/Mehrspielertests gemeinsam, einschließlich der zwei dort betroffenen Fälle. Es wurden keine Assertions zu Serverbesitz, Fahrten, Belohnung oder Neustart entfernt. Dies ist ein vollständiger lokaler Nachweis über Gesamtlauf plus gezielte Wiederholungen, kein behaupteter einzelner fehlerfreier 52er-Lauf.

Die unveränderte GitHub-Prüfung führt sämtliche Vitest- und 16 Node-Fälle unter Linux sowie alle 52 Browserabläufe jeweils in Chromium und Firefox aus. Ein grüner Windows-Teillauf ersetzt sie nicht. Maßgeblich ist der tatsächliche Actions-Lauf des zugehörigen `main`-Commits; dessen Link und Ergebnis werden in der Übergabe genannt. Die CI umfasst außerdem kaltes AMP-Setup, Produktionsabhängigkeiten, reproduzierbares Linux-Paket, echten Runtime-Neustart und die vorhandenen Python-/OSM-Werkzeugfixtures.

## Fachliche Nachweise

- Der Katalogtest ordnet jede der 206 Auftragspositionen zu und prüft alle 612 neuen Profile auf echte Parameterunterschiede, Fähigkeitserfüllbarkeit und Persistenz. Der [Katalognachweis](EINSATZKATALOG.md) erklärt die zwei zusammengeführten Wiederholungen und die daraus folgenden 653 IDs.
- 521 gewöhnliche neue Varianten laufen mit geeigneten, tatsächlich besetzten Fahrzeugen durch Vor-Ort-Arbeit und gegebenenfalls echte Klinikfahrt bis zum Archiv. Die fünf Großlagentypen werden mit Abschnitten und Transporten separat durchgespielt. Diese Tests beginnen an der Einsatzstelle; vollständige Notruf-/Anfahrt-E2E sind zusätzliche Fälle und werden nicht für jede Variante einzeln behauptet.
- Verletzung tatsächlicher Besatzungsmitglieder reduziert Fähigkeiten und Transportfähigkeit. Klinikübergabe, Genesung, Tod und spätere Ersatzbesatzung sind geprüft. Gefahr-/Patientenübergänge erzeugen keine wiederholten Tick-Meldungen.
- Mehr als zwei beziehungsweise 60 aktive Einsätze bleiben speicherbar und über Neustart erhalten. Der Generator, Folgelagen und das Labor haben keine entsprechende Obergrenze. Normale Doppelanrufe, zusätzliche Großlageninformationen und Wiederanrufe nach verlorenem unvollständigem Gespräch werden getrennt geprüft.
- FF: interne Verfügbarkeit, unterschiedliche reale Anreisen, Mindestbesatzung, Qualifikationen, keine Doppelbindung, Verletzung während Anreise, Neubau als FF und bestandsgeschützte BF. BF-Ausbau prüft Freischaltung, Kosten, Zeit und tatsächliche Kapazität; private Dienstmanipulation bleibt abgewiesen.
- Rückfahrt und Nachbereitung lassen sich weder durch FMS 2 noch eingesandte Bereitschaftsfelder entsperren. Fristen, Recovery bereits vorgemerkter Arbeit und einmalige Wiederfreigabe bleiben über Neustarts bestehen.
- Archiv: 537 Berichte über 22 Seiten vollständig, ohne Dopplung; Text-/Organisations-/Großlagenfilter, ungültige Parameter, persönlicher Altbestand und angenommene/widerrufene Disponentenmitgliedschaften. HTTP- und echter CLI-Export enthalten auch alte Berichte außerhalb des 100er-Snapshots. Nachbereitungsereignisse aktualisieren alte Berichte bis zum letzten Arbeitsschritt.
- Migration v12 → v13 übernimmt 500 vorhandene Berichte. Die vorherige Sicherung enthält den alten Save bytegleich. Konten, Geld, Fortschritt, Fahrzeuge und BF-Bestand bleiben erhalten; erneutes Öffnen erzeugt keine Duplikate.
- Labor: gemeinsame Zeit aller Prüfwelten, reale Unterstützungsannahme und Ablehnung bei gebundenen Nachbarkräften, vollständige Archive, unveränderte Eingaben, eindeutige Seeds und deterministische Wiederholung. Produktionsaktionen können die Laborbefehle nicht aufrufen.

## Deutschland und Leistung

Die [Standortprüfung](GERMANY-INCIDENT-SITES.md) verwendet echte kleine MVT-Geometrien und den produktiven Provider-/Serververtrag. Sie prüft sämtliche Standortarten, Inseln, Kachelgrenzen, passende Straßenanker, Kaufwiederholungen, Neustart, Speichergrenzen und eine gemeinsame Routingfrist. Bei vorübergehendem Routerausfall bleiben Health und Simulation aktiv; der Standortversuch wartet persistiert 60 Sekunden. Ungültige Routerantworten bleiben Fehler mit Transaktionsrollback.

Zusätzlich wurden mit dem vorhandenen echten Deutschlandbestand und GraphHopper 11 **14 örtliche Abfragen mit jeweils vier belegten Standorten** ausgeführt. Wiederholungen ergaben dieselben Ergebnisse. Spree-, Wannsee- und Duisburger Ufer wurden für Wasserwachen akzeptiert, eine Binnenstraße abgewiesen. Das sind konkrete regionale Stichproben, keine behauptete Prüfung jedes deutschen Ortes. Es gab keinen Neuimport oder Eingriff in Produktionsdaten.

Die zusätzliche Snapshot-Messung verwendete 20 Wachen, 500 Fahrzeuge, 4.500 Personen und 200 aktive Einsätze, je zur Hälfte FF/BF. Im letzten lokalen Lauf: kalt **25,41 ms**, warm Median **21,35 ms**, P95 **27,08 ms**, JSON-Serialisierung **4,43 ms**, 1.915.544 Bytes JSON beziehungsweise 42.510 Bytes gzip. Gemessen wurden `publicSave` und Serialisierung; Datenbank, Routing, Netzwerk und Simulationstick sind nicht enthalten. Die Quelle blieb unverändert und private Daten wurden entfernt.

Die beiden Browser-Lastfälle bestanden isoliert: große Fahrzeug-/Wachenmenge und gemessene Rivermere-Kartenbewegung. Unveränderte Interaktionsassertions bleiben bestehen. Der Deutschland-MapLibre-Build hat weiterhin die bekannte Größenwarnung des Vendor-Bundles; es wurde keine Warnungsgrenze hochgesetzt, um diese zu verbergen.

## Änderungen und Grenzen

Die fachliche Umsetzung und Bedienung stehen in [EINSATZBETRIEB-2.18.md](EINSATZBETRIEB-2.18.md). Wesentliche Dateigruppen:

| Bereich                                     | Dateien                                                                                                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Katalog, Freischaltung und Profile          | `src/catalog.ts`, `src/catalog/*`, `src/progression.ts`                                                                                                                                                                                   |
| Notruf, Disposition, Prioritäten und Status | `src/simulation/calls.ts`, `dispatch.ts`, `incidents.ts`, `priority.ts`, `mission-status.ts`, `force-plan.ts`                                                                                                                             |
| FF/BF und Bereitschaft                      | `staffing.ts`, `volunteers.ts`, `organizations*.ts`, `availability*.ts`, `post-incident.ts`, `responder-recovery.ts`, `src/model.ts`                                                                                                      |
| Dynamik und Bewertung                       | `dynamics*.ts`, `fire.ts`, `hazards.ts`, `patients.ts`, `faults.ts`, `weather.ts`, `major-*.ts`, `reports.ts`, `report-schema.ts`                                                                                                         |
| Server, Archiv und Labor                    | `server/game.ts`, `database.ts`, `history.ts`, `index.ts`, `cli.ts`, `lab.ts`, `lab-worlds.ts`, `aid.ts`, `balance.ts`, `src/engine.ts`                                                                                                   |
| Deutschland                                 | `server/germany/geography-sites.ts`, `provider.ts`, `runtime.ts`, `src/germany/world.ts`, `src/simulation/incident-location.ts`, `src/purchase.ts`                                                                                        |
| Oberfläche und Ton                          | `GameHud.tsx`, `Desk.tsx/css`, `Resources.tsx`, `Organizations.tsx`, `Dynamics.tsx`, `Reports.tsx`, `ForceNeeds.tsx`, `QualityReport.tsx`, Kartenmarker, `fleet-view.ts`, `workspace.ts`, `SoundProfiles.tsx`, `Sound.css`, `src/audio/*` |
| Regressionen und Dokumentation              | Neue Katalog-/Archiv-/Labor-/Geo-/FF-/Bereitschafts-/Audio-/Status-/Leistungstests, aktualisierte E2E, lokale MP3-/OGG-Testsignale, README und Dokumentation; exakte Liste im Git-Diff                                                    |

Historisch bereits gelöschte Berichte lassen sich nicht rekonstruieren. Große Bestände benötigen weiterhin reale Serverressourcen; „keine Einsatzobergrenze“ ist kein Versprechen unbegrenzter Hardwareleistung. Deutschland-Boote sind Zugfahrzeug/MZB-Kombinationen zum Ufer, kein neues offenes Wasserwegenetz. Reproduzierbare Wiederholung gilt für dieselbe Software- und Datenversion. Balanceprüfungen ersetzen keine langjährige Spielbeobachtung sämtlicher Flotten und Kombinationen. Es gibt keine automatische Produktionsbereitstellung.

Lokale Belege: `.tools/expansion-vitest-release.json`, `.tools/test-runs/expansion-browser*.json`, `.tools/test-runs/game-ff-browser.json`, `.tools/test-runs/public-save-performance.json`, `.tools/test-runs/geography-acceptance.json`, `.tools/test-runs/geography-water-stations.json`. Diese Dateien sind lokale Prüfartefakte; die CI erzeugt eigene Logs und veröffentlichte Actions-Artefakte.
