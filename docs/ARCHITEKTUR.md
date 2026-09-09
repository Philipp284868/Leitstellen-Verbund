# Serverarchitektur · Version 2.21

Eine Node-24-Instanz ist pro SQLite-Datenverzeichnis maßgeblich. Website, Spiel-API und Socket.IO teilen den Anwendungsport. Der Rivermere-Build liefert `dist/client`, der Deutschland-Build `dist/germany/client` aus. Konfiguration, Quelltexte, SQLite und private Geodatenpfade werden nicht als statische Verzeichnisse veröffentlicht.

| Modul                              | Verantwortung                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| src/catalog, model, engine         | Kataloge, Validierung und Orchestrierung der Simulation                                               |
| src/simulation                     | Gespräche, Disposition, FMS, persistente Aufgaben, Gefahren, Patienten, Organisationen und Auswertung |
| src/money, src/economy             | Sichere Eurocentarithmetik, Preise, Buchungen, Finanzierung und versionierte Geldumstellung           |
| src/simulation/building-staffing   | Automatische qualifizierte Wachbesetzung und bestandsschützende Personalübernahme                     |
| server/config                      | Weltbezogene Konfiguration, Port, Origin, Datenpfade und Proxyvertrauen                               |
| server/database, economy-migration | Schema 14, Transaktionen, Vorabsicherung, Migrationsplan und Summenprüfung                            |
| server/auth, actions, workspaces   | Anmeldung, strikte Aktionsschemas, Mitgliedschaft und Eigentumsprüfung                                |
| server/game, aid                   | Autoritative Aktionen/Ticks, ausdrückliche Nachbarhilfe und Auszahlungsbelege                         |
| server/tutorial                    | Persönlicher Lernfortschritt, isolierte Übungswelt und Spielkontextprüfung                            |
| server/index                       | HTTP, Cookies/CSRF/Origin, Socket.IO, Clientauslieferung und regulärer Stopp                          |
| server/cli, lock                   | Offline-Vorschau, Backup/Restore/kompatibler Altimport und exklusiver Zugriff                         |
| server/germany, src/germany        | Lokale Geodaten, Straßenrouting, reale Standorte und Vektorkartendarstellung                          |
| src/store, network                 | Bestätigte Serveransichten, Sitzung, Anfragen und geordnete Kontextwechsel                            |
| src/audio, device-preferences      | Lokale Audiowiedergabe, Datei-/Reglerentwürfe und Gerätepräferenzen                                   |

## Aktionen, Zeit und Geld

Jede Spielaktion hat eine UUID. Der Server bindet sie an das Konto und den Hash der geprüften Aktion. Gleiche ID und gleicher Inhalt ergeben keine erneute Mutation; andere Bedeutung wird abgelehnt. Der Browser bestimmt weder Guthaben noch Eigentümer oder Serverzeit. SQLite `BEGIN IMMEDIATE`, WAL und `synchronous=FULL` sichern Zustand und Belege gemeinsam.

Eine echte Sekunde ergibt eine Simulationssekunde; Tempoänderungen werden abgelehnt. Die normale Multiplayerwelt läuft ohne Browser weiter. Nach Serverstillstand werden höchstens vier Stunden nachberechnet, ein Uhrenrücksprung erzeugt keine negative Zeit. Bei Speicher-/Validierungsfehlern werden keine ungesicherten Zustände als erfolgreich ausgeliefert.

Geld bleibt integercentgenau; Multiplikation und Summen verwenden geprüfte rationale beziehungsweise BigInt-Zwischenschritte. Währungsversion 1 und Preisversion 1 sind getrennte Markierungen. Automatische Finanzierung nutzt einen persistenten nächsten Abrechnungszeitpunkt. Einsatzerlöse werden aus dem ursprünglichen Auftrag und bestätigter Qualität berechnet; Wiederverbindung, weitere Fahrzeuge und Warten erzeugen keine zweite Vergütung. [Wirtschaft und Migration](EURO-WIRTSCHAFT.md).

## Informationsstand und Zusammenarbeit

`publicSave` gibt nur beobachtete beziehungsweise bestätigte Angaben frei. Unbekannte Anrufe bleiben neutral; Seed, interne Vorlagen, Zufallsentscheidungen und unerkundete Gefahren/Messwerte fehlen in normalen Ansichten. Die Kernsimulation verwendet die vollständigen SQLite-Zustände. Persistente Einsatzaufgaben unterscheiden dauerhaft erledigte Arbeit von noch nötiger Abdeckung; Rückruf und Mehrfachabzug prüfen diese gemeinsam mit Patienten- und Abschnittsbindungen.

`server/workspaces` löst Spielaktionen anhand der aktuellen Mitgliedschaft auf den Leitstelleninhaber auf. Belege und Bearbeiternamen bleiben beim tatsächlichen Konto. Einladungen benötigen ausdrückliche Annahme; Chat wird nur in der berechtigten Leitstelle verteilt. Alte Einzelspielerstände sind inaktive Archive.

Unabhängige Leitstellen erhalten keine automatischen Einsatzfreigaben. `server/aid` bearbeitet gezielte Anfragen, Rückfragen, Zusagen und begrenzte Fremdansichten. Erst tatsächlich beteiligte zulässige Kräfte zählen; Hilfe, Transport und Auszahlung bleiben serverseitig überprüft. Rücknahme einer Unterstützung darf keine erforderlichen Patienten-/Aufgabenbindungen umgehen. [Aktuelle Zusammenarbeit](MULTIPLAYER.md).

## Tutorial und Kontextwechsel

Jeder Benutzer besitzt persönlichen Fortschritt und optional eine eigene serverseitige Übungswelt in separaten Tabellen. Die Übung benutzt dieselbe Engine, vorhandene Kataloge und echte Routen. Ihr Budget, XP, Aktionsbelege und Archiv gelangen nicht in die normale Leitstelle; laufende Grundfinanzierung bleibt dort aus. Verlassen pausiert die Übung.

Eine persistente monotone `playContext`-Revision und eine zusätzliche Übungssitzung schützen Kontextwechsel. Aktionen, Tutorialkontrollen und Übungssteuerung müssen den aktuellen Kontext senden. Start/Stop/Reset verwenden gespeicherte Belege mit ID und Fingerprint; Replay wirkt nicht doppelt. Der Browser verwirft verspätete Antworten nach Konto-/Kontextwechsel und bindet Wiederholungen an die ursprüngliche Anfrage. [Vollständiger Vertrag und Tests](TUTORIAL-2.21.md).

## Darstellung, lokale Daten und Grenzen

Deutschland verwendet eine lokal ausgelieferte MapLibre-Vektorkarte mit realen Straßengeometrien, Suchindex und lokalem GraphHopper. Historisches Rivermere behält seine SVG-Karte und eigene Weltidentität. Kamerabewegung ist lokal, Fahrplan und Einsatzentscheidung serverseitig. Keine Browser-Koordinatorwahl oder P2P-Übernahme ist erforderlich.

Audio- und Anzeigeentwürfe werden erst mit Übernehmen lokal gespeichert. Audiodateien verlassen IndexedDB nicht; Serverbackups enthalten keine eigenen Sounds. Die Klangereignisse folgen ausschließlich freigegebenen aktuellen Ereignissen, nicht geheimer Lageinformation. [Audio](AUDIO.md).

Private API-/Socketdaten, HTML und Kontoexporte werden nicht gecacht; gehashte öffentliche Assets dürfen gecacht werden. Offline bestätigt der Client keine neue Aktion und beginnt keine Ersatzsimulation. Ein einzelnes SQLite-Prozesslock ersetzt keinen Mehrservercluster. Lastmessungen und Browserabnahmen gelten nur für die tatsächlich dokumentierten Szenarien und Commits. Historische Phasenberichte bleiben Nachweise ihrer damaligen Version.
