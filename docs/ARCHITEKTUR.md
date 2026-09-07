# Serverarchitektur

Eine Node-24-Instanz ist pro SQLite-Datenverzeichnis maßgeblich. HTTP-Frontend, Spiel-API und Socket.IO teilen denselben Anwendungsport. Der Server liefert ausschließlich dist/client aus; .env, Quelltexte und SQLite sind nicht über die statische Auslieferung erreichbar.

| Modul                             | Verantwortung                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| src/catalog, world, model, engine | Bestehende Kataloge, Welt, Validierung und testbare Simulation                        |
| server/config                     | Explizites Laden der .env, Port, Origin, Datenverzeichnis und Proxy-Vertrauen         |
| server/database                   | SQLite-Schema, Migration, Transaktionen, persistierte Zustände, konsistente Sicherung |
| server/auth                       | Gesalzene scrypt-Hashes, freie Spielerregistrierung, widerrufbare Sitzungen, Loginlimits   |
| server/actions                    | Strikte Schema-Whitelist zulässiger Spielaktionen                                     |
| server/game                       | Autoritative Aktionen und Ticks, kontoübergreifende Kooperation und Belohnungen       |
| server/index                      | HTTP, Cookies/CSRF/Origin, Socket.IO, statische Website, Stoppsignale                 |
| server/cli, lock                  | Backup/Restore/Altimport, exklusiver Zugriff                       |
| src/store, network                | Bestätigte Serveransicht, Anmeldung, Aktionen und Socket-Verbindung                   |

## Transaktionen und Zeit

Jede Aktion hat eine UUID. Der Server bindet sie an das angemeldete Konto und den Hash der geprüften Aktion. Gleiche ID und gleicher Inhalt ergeben keine erneute Mutation; eine andere Bedeutung wird abgelehnt. Der Browser übergibt weder Guthaben noch Eigentümer oder Zeitstempel als autoritativen Zustand. SQLite BEGIN IMMEDIATE, WAL und synchronous=FULL sichern die gemeinsame Speicherung von Zustand und Belegen.

Ein Server-Takt liest die Konten, berechnet deren Bewegung, Ausbildung und Missionen und übernimmt den vollständigen Tick in einer Transaktion. Die Serverzeit bestimmt den Fortschritt; eine echte Sekunde ergibt genau eine Simulationssekunde in beiden Modi. Eine Aktion zur Tempoänderung wird abgelehnt; alte Spielstände werden auf Tempo 1 normalisiert. Browser-Anwesenheit beeinflusst die Simulation nicht. Nach Serverstillstand werden höchstens vier Stunden nachberechnet. Ein Rücksprung der Uhr erzeugt keine negative Spielzeit. Bei Speicher-/Validierungsfehlern pausiert die Simulation, statt nicht gespeicherte Zustände auszuliefern.

## Phase-1-Ablauf und Leitstellen

Die neuen Module unter `src/simulation` trennen Gespräche, AAO/Alarmierung, FMS, Lagemeldungen und bestätigte Ereignisse. Die bestehende Engine orchestriert Bewegung, Arbeit und Transport. Erst bekannt gewordene Angaben werden durch `publicSave` freigegeben; Seed und interne Szenariodaten bleiben aus HTTP, Socket und Kontoexport entfernt. Die Kernsimulation arbeitet mit den vollständigen SQLite-Zuständen.

`server/workspaces` löst Multiplayeraktionen anhand der aktuellen Mitgliedschaft auf den Leitstelleninhaber auf. Aktionsbelege und Bearbeiternamen bleiben dem tatsächlich angemeldeten Konto zugeordnet. Einladungen benötigen gezielte Erstellung und ausdrückliche Annahme. Einzelspieler löst immer auf das eigene Konto auf. Chat wird nur innerhalb der aktuell berechtigten Leitstelle verteilt.

Neue Fälle sind privat für unabhängige Leitstellen. Die folgenden Regeln gelten ausschließlich für erhaltene Altfälle; das vollständige neue Unterstützungsanfragen-System bleibt Phase 3. [Schema 6 und Datenfluss](PHASE-1.md).

## Erhaltene alte Kooperation

Ein Besitzer gibt einen Einsatz ausdrücklich frei. Andere eingeladene Konten bieten jeweils ein eigenes einsatzbereites Fahrzeug an; die Freigabe erlaubt diese Unterstützung. Der Server prüft Runde, eigenen Besitz, Besatzung, Zustand und Gewässereignung. Fahrzeuge erhalten eine eindeutige Zuweisung. Erst tatsächlich am Einsatzort befindliche Fahrzeuge liefern Fähigkeiten und bestätigen ihre Eigentümer als Helfer. Höchstens vier unterstützende Konten je Einsatz werden zugelassen.

Die bestehenden Krankenhaus- und Transportregeln gelten auch für Helfer. Ein gespeicherter Transportauftrag wird erst bei tatsächlicher Übergabe als geliefert behandelt. Der Einsatzgeber erhält bei Unterstützung die Hälfte; die andere Hälfte teilen bestätigte Helfer, jeweils abgerundet. Kontoübergreifende Gutschriften und eindeutige SQL-Auszahlungsbelege werden zusammen mit dem Abschluss committed. Das funktioniert ohne offenen Besitzer- oder Helferbrowser und über Serverneustarts hinweg.

Es gibt keine Browser-Koordinatorwahl und keine P2P-Übernahme. Ein Verbindungsabbruch beendet nur die Ansicht. Bei ausdrücklichem Abbruch einer Kooperation werden fremde Kräfte zurückgerufen; laufende Patiententransporte müssen zuerst enden. Verwaiste Zuweisungen werden serverseitig zurückgeführt.

## Darstellung, Daten und Grenzen

Socket.IO übermittelt den freigegebenen Leitstellenstand an berechtigte Konten. Unabhängige Leitstellen erhalten keine neuen Fälle oder Wachen. Nur noch laufende alte Unterstützungen besitzen die erforderlichen eingeschränkten Fremdansichten; diese enthalten keine fremden Guthaben oder Personaldateien. Der Gruppenchat bleibt flüchtig und wird als Text gerendert. Bei Abmeldung werden Browseransicht und Chat geleert; freiwillig angelegte lokale Kopien bleiben ausdrücklich erhalten.

Die SVG-Karte und getrennte Fahrzeuganimation bleiben bestehen. Der Client bestätigt keine Offline-Aktionen und persistiert Serveransichten nicht automatisch als geteilten Offline-Cache. Statische gehashte Assets dürfen gecacht werden, API, Socket.IO, HTML und Kontoexporte erhalten no-store. Der alte Offline-Worker wird stillgelegt, ohne IndexedDB-Bestände zu löschen.

Dies ist eine Einzelserverarchitektur mit freier Spielerregistrierung und ausdrücklich angenommenen Leitstellenmitgliedschaften. SQLite und das Prozess-Lock ersetzen keinen Mehrserver-Cluster. Pro Tick werden alle Konten verarbeitet; umfassende Lastmessungen mit vielen gleichzeitig angemeldeten Konten sind separat erforderlich. Der vorhandene Test für 100 Wachen/300 Fahrzeuge/50 Einsätze bleibt erhalten, beweist aber keine unbegrenzte Serverkapazität.
