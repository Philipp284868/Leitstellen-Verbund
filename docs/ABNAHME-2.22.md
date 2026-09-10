# Abnahme 2.22 – Funk, Notrufarbeitsplatz, Weltlagen und Einsatzorte

> Historischer Nachweis des im Dokument genannten Stands. Frühere Karten, Bedienwege und Prüfzahlen sind keine aktuelle Produktanleitung. Aktuell: [Deutschland](DEUTSCHLAND.md), [Entwicklung](ENTWICKLUNG.md), [Laufzeitmessungen](TESTLAUFZEITEN.md).

Stand: 10. September 2026. Dieser Bericht beschreibt die tatsächlich implementierten Regeln und die lokalen Messungen. Der GitHub-Prüflauf ist zusätzlich am jeweiligen Commit zu kontrollieren; ein lokales Ergebnis ist keine Aussage über einen noch laufenden CI-Job oder den privaten AMP-Server.

## Bestätigte Ursachen und Änderungen

| Befund                                                                                                                          | Umgesetzte Änderung                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Getrennte Funkkanäle konnten am Arbeitsplatz gleichzeitig Sprache ausgeben.                                                     | Serverkanäle besitzen geordnete Übertragungen; der lokale Arbeitsplatz serialisiert zusätzlich sämtliche überwachten Fahrzeugkanäle. Telefon, Musik und Umgebung behalten eigene Wege.                           |
| Wiederholte Fahrzeugankünfte konnten dieselbe Ersterkundung auslösen.                                                           | Eine gespeicherte Erstmeldung pro Einsatz; Ergänzungen und Nachforderungen bleiben möglich.                                                                                                                      |
| Ein nach telefonischem Meldebild passend entsandtes Fahrzeug konnte bei abweichendem tatsächlichem Bedarf ohne Erstlage warten. | Erkundung richtet sich zunächst nach dem gemeldeten Bild; tatsächlich angekommene Kräfte melden auch eine unerwartete Lage. Regression mit notwendiger technischer Nachforderung.                                |
| Notruf und Disposition waren über mehrere umfangreiche Ansichten verteilt.                                                      | Gemeinsamer Arbeitsplatz mit Warteschlange, Gespräch, bekannten Einsatzdaten und Disposition; dieselben Komponenten in Menü, Tastenkürzel und Einsatzdetail.                                                     |
| Weltwetter und Einsatzbelastung besaßen keinen gemeinsamen regionalen Lageverlauf.                                              | Ein persistenter Servercontroller bestimmt sechs Profile und fünf Phasen; betroffene Regionen wirken auf passende Ereignisse, Wetter und Fahrten.                                                                |
| Der ruhige Einstieg und eine Erholungsphase waren nicht ausreichend voneinander abgegrenzt.                                     | Erst drei abgeschlossene Einsätze durchlaufen, bevor mehrere eigene Vorgänge freigegeben werden; Mindestabstände und vorhandene Lastgrenzen bleiben wirksam. Größere Flotten erhalten passende weitere Aufgaben. |
| Die geografische Nähe allein bewies keine anfahrbare Lage innerhalb von 15 Minuten.                                             | Vor Veröffentlichung werden Ortsreferenz, Zugang und reale Straßenprofile mit höchstens 900 Fahrsekunden geprüft.                                                                                                |
| Technische Altortprüfung konnte einen schon begonnenen fremden Patiententransport von der Abschlussrückmeldung ausschließen.    | Neue Aufnahme am ungeprüften Ort pausiert; laufende Transporte und Krankenhausübergaben bleiben aktiv. Technische Aufhebung erst anschließend, ohne Einsatzvergütung oder Wertung.                               |

## Konkreter Funktionsumfang

- Funk: stabile IDs, Serverreihenfolge je Leitstelle, sichtbare Warteschlange, Priorität mit Wartezeitausgleich, Notfallunterbrechung mit Nachvollziehbarkeit, abgeschlossene Historie. Stummgeschaltete oder geschlossene Clients blockieren weder Kanal noch FMS. Reconnect erzeugt keine historische Sprachlawine. Ein Watchdog befreit hängende lokale Sprache; ausschließlich lokale geeignete Stimmen werden verwendet.
- Notruf: verborgene tatsächliche Lage, schrittweise bekannte Aussagen, situative Fragen einschließlich Zugang und Rückruf, geschützte gemeinsame Bearbeitung und Übergabe. Frühe Alarmierung bei bekanntem, geprüftem Zugang, während das Gespräch weiterläuft. Priorität, AAO, freie Auswahl, Alarmierungsart und echte Anfahrtsangaben sind wirksam. Alarmierung und tatsächlicher Status 3 bleiben getrennt.
- Weltlagen: ruhig, normal, Sturm, Starkregen/Hochwasser, Hitze/Trockenheit und Winterglätte. Alle Teilnehmer sehen denselben Zustand; außerhalb einer betroffenen Region entsteht nicht dasselbe lokale Wetter. Serverneustart und später Login erhalten den Verlauf. Lagewechsel sind eine Serverfunktion, keine persönliche Anzeigepräferenz.
- Bereitschaft: Empfehlung aus Belastung, Wartezeit, Dringlichkeit, Bindung und Fähigkeitslücken. Nur berechtigte Leitung aktiviert sie. Tatsächliche Mobilisierung beseitigt anschließend Sammelanteile; Mindestbesatzung, Qualifikation, Defekte und Patientenbindung gelten weiter. Keine schnelleren Straßenfahrten und kein stapelbarer Bonus. Andere Leitstellen sehen den öffentlichen Alarmstatus, keine dadurch automatisch freigegebenen Einsätze.
- KatS: eigener Wachtyp, GW-SAN als Material-/Behandlungsfahrzeug und NKTW als Transportfahrzeug. Kauf, Mobilisierung, Behandlung, Transport, Klinikübergabe, Aufbereitung und Rückkehr sind angebunden.
- FFW: vier bis sechs persistente hauptamtliche Personen pro neuer Wache als Kern. Ergänzende Ehrenamtliche kommen tatsächlich zur Wache. Bestehende stärkere Besetzung und aktive Bindungen bleiben erhalten; derselbe Mensch besetzt keine zwei Fahrzeuge.
- Garage: physischer Aufenthalt statt bloßer Heimatzuordnung, auch Status 6 und besuchte vorhandene Wachen. Unterwegs zugehörige Fahrzeuge bleiben getrennt. Klappzustand pro Benutzer und Spielkontext, ohne erneutes Öffnen durch Echtzeitupdates.
- Unterstützung: freie gewünschte Namen/Funkrufnamen ergänzen Menge und Fähigkeiten. Entwurf, Versand, Empfang, Alternative und Historie bewahren den Originalwunsch; tatsächlich zugesagte IDs werden getrennt gespeichert. Kein Zugriff auf private fremde Fahrzeugnamen und keine zusätzliche Dispositionsberechtigung.

## Vorher/Nachher bei gleicher Konfiguration

Feste Seeds **123, 987, 4071**, jeweils eine Simulationsstunde. Identischer idealisierter Testdisponent mit 5-Sekunden-Schritten, identische Flotten und echte Simulationsaufgaben. Vorher ist der Projektstand vor dem neuen Weltcontroller; nachher der ruhige Einstieg. Die zweifahrzeugige Vergleichsleitstelle ist nicht die achtfahrzeugige Flotte der folgenden Langmessung.

| Konfiguration      | Anrufe/h vorher | Anrufe/h nachher | Fahrzeugauslastung vorher | Fahrzeugauslastung nachher | XP vorher | XP nachher |
| ------------------ | --------------- | ---------------- | ------------------------- | -------------------------- | --------- | ---------- |
| TSF, Seed 123      | 6               | 3                | 66,3 %                    | 27,5 %                     | 675       | 395        |
| TSF, Seed 987      | 6               | 4                | 53,1 %                    | 22,6 %                     | 824       | 420        |
| TSF, Seed 4071     | 5               | 3                | 70,3 %                    | 27,2 %                     | 654       | 390        |
| HLF/TLF, Seed 123  | 6               | 3                | 50,9 %                    | 12,5 %                     | 725       | 385        |
| HLF/TLF, Seed 987  | 7               | 4                | 30,3 %                    | 19,4 %                     | 844       | 565        |
| HLF/TLF, Seed 4071 | 5               | 3                | 77,0 %                    | 25,1 %                     | 596       | 455        |

Maximal ein gleichzeitiger Einsatz in allen sechs Einstiegsläufen; nachher kein unzugewiesener Rückstau am Ende. `tests/notruf-measurement.test.ts` verwendet dieselbe Vergleichskonfiguration. Die Rohdaten liegen im Abnahmeordner unter `balancing-before.json` und `balancing-after.json`.

Vergütung und XP pro korrekt abgeschlossenem Einsatz sowie Preise wurden durch den Lagecontroller **nicht geändert**. Ruhige Stunden ergeben deshalb weniger Einkommen, aber auch mehr freie Zeit. Bereits 335 kumulative XP reichen nach der vorhandenen Progressionsregel für Stufe 3; die TSF-Läufe verdienen 390–420 XP. Diese Messung gilt für einen idealisierten Disponenten und ist keine garantierte Spielerleistung.

## Reproduzierbarer Verlauf über ruhige Lage, Normalbetrieb und Sturm

`tests/world-balancing.test.ts` führt pro Flotte und Seed 3 Stunden 40 Minuten aus: 60 Minuten ruhig, 60 Minuten normal und 100 Minuten Sturmverlauf mit Ankündigung, Anstieg, Hauptphase, Abklingen und Erholung. Zusammen **22 simulierte Stunden**. Der Disponent bearbeitet echte Notrufe, Funk, Organisationsaufträge und Patiententransporte; es gibt keine teleportierten Fahrzeuge oder fingierten Krankenhausübergaben.

Die Starterflotte besitzt ein TSF. Die ausgebaute Flotte besitzt acht Fahrzeuge (HLF/TLF, zusätzlich HLF/LF, zwei RTW, NEF und GKW) und eine Klinik. Fähigkeiten begrenzen die Auswahl: Ein TSF erhält keine unlösbaren technischen Pflichtaufgaben allein wegen eines Sturms. Normalbetrieb gewichtet bei geeigneter Ausstattung TH stärker als Brände. Der vollständige Mix, Fahrzeugauslastung, Euro/XP und Rückstauabbau stehen in `abnahme-2.22/balancing-world.json`.

Aus den kontrollierten Verläufen: TSF ruhig 3–4 Anrufe/h, normal 4–6/h, niemals mehr als ein offener Vorgang. Die ausgebaute Leitstelle erhält ruhig 5/h, normal 7–9/h und bleibt im gesamten Sturmverlauf bei höchstens drei offenen Vorgängen. In der 30-minütigen Hauptphase fallen 4–6 Anrufe an, in den 30 Minuten Erholung zwei bis drei. Das entspricht 8–12 beziehungsweise 4–6 pro Stunde; kurze Phasenwerte sind eine Normierung, keine zusätzliche volle Stundenmessung.

Bei der ausgebauten Flotte wächst die durchschnittliche Fahrzeugbindung in der Hauptphase auf 43,2–73,3 % und fällt in der Erholung auf 25,3–36,9 %. Der bei Beginn der Erholung vorhandene Rückstau wird in den drei Seeds nach 5:00, 14:30 und 12:45 Simulationsminuten abgebaut. Neue Vorgänge in der Erholung bleiben zulässig; vorhandene Schäden werden nicht gelöscht.

## Nachgewiesene Orts- und 15-Minuten-Prüfung

`tests/incident-reachability.test.ts` prüft 899 und 900 Sekunden als gültig, 901 als ungültig. Diese drei Grenzfälle verwenden kontrollierte Routingrückgaben. Zusätzlich wird eine wirkliche Straßenroute der kleinen Testwelt berechnet; Germany-Provider- und Geografieprüfungen prüfen reale Providerintegration mit bekannten Geodatenfixtures und kontrolliertem externem Routervertrag. Das ist **keine Behauptung einer durchgeführten deutschlandweiten Routingabnahme mit dem vollständigen Produktionsdatensatz**.

Geprüft werden außerdem falsche Eigentümer, fehlende Fähigkeiten, der unzulässige schnelle Führungswagen als Gebietsöffner, gebundene Fahrzeuge, Cacheinvalidierung durch Sperrungen, Nullpunkte und verborgene Ortsnachweise vor der Abfrage. Nachträgliche Straßensperren ändern die tatsächliche Route/ETA. Bereits freiwillig angenommene überörtliche Hilfe wird nicht auf 900 Sekunden gekürzt.

Originalort, nachgewiesener Zugang, Datensatz, Straßen-/Objektreferenz, Fahrzeugprofile und Prüfergebnis bleiben gespeichert. Reparaturen erfolgen nur in enger Nähe der ursprünglichen Lage. Die begrenzte Prüfwarteschlange rotiert bei vorübergehenden Fehlern, statt alle weiteren Altfälle zu blockieren. Ohne zulässiges eigenes Straßenprofil bleibt die Prüfung ausdrücklich wartend. Strukturell ungültige JSON-Spielstände werden weiterhin abgelehnt und nicht durch einen Datenreset ersetzt.

Bei mehr als 64 vorhandenen Profilen darf eine begrenzte erfolglose Suche nicht als Beweis vollständiger Unerreichbarkeit gewertet werden. Der Altfall bleibt in diesem Fall erhalten und wartend. Zwei zusätzliche Grenzfälle mit 64 beziehungsweise 65 Profilen sind zusammen mit den Germany-Simulationsprüfungen in einem Lauf mit 25 erfolgreichen Tests nachgewiesen.

## Migrationen und Datenerhalt

| Datenbankschema | Änderung                                                                          |
| --------------- | --------------------------------------------------------------------------------- |
| 15              | FFW-Kern und Katastrophenbereitschaft mit bestandsschonender Personalübernahme    |
| 16              | Versionierter Funkzustand und freie Fahrzeugwünsche; kein historischer Tonstapel  |
| 17              | Zentral gespeicherte Weltlage mit Seed, Uhr, Region und Verlauf                   |
| 18              | Versionsgebundene Ortsnachweise und begrenzte Prüfwarteschlange für Bestandsfälle |

Die vorhandenen Sicherungs- und Dry-Run-Wege gelten weiter. Migrationstests vergleichen geschützte Nutzdaten nach Entfernen ausschließlich der ausdrücklich neuen Metadaten: Besitzer, Geld, XP, Fahrzeuge, laufende Aufgaben und Patienten bleiben erhalten. Wiederholte Übernahme erzeugt keine doppelte Besatzung. Ein echter fremder Patiententransport wird auch während technischer Ortsprüfung bis zur Klinikübergabe ausgeführt; danach ist die technische Aufhebung ohne Kooperationsvergütung geprüft.

## Ausgeführte Prüfungen und Beleggrenzen

- `check:quick`: Projektstruktur, Format, ESLint und TypeScript erfolgreich.
- Produktionsbuild: bestehender und Deutschland-Client/Server erfolgreich; Bundlebudgets eingehalten. MapLibre erzeugt weiterhin den bekannten Größenhinweis, keinen Buildfehler.
- Vollständiger lokaler CI-Testumfang: 1.180 bestandene Logik-/Integrationsprüfungen, acht Regionsprüfungen und 16 Laborprüfungen; eine bereits plattformabhängig übersprungene Prüfung. Der anschließend ergänzte Patiententransportfall ist gemeinsam mit den Ortsprüfungen in einem gezielten Lauf mit 30 bestandenen Tests nachgewiesen.
- Die separaten Node-Dateisystemtests erreichen unter Windows 15 erfolgreiche und zwei durch `EPERM` beim Anlegen symbolischer Links blockierte Fälle. Der Linux-Workflow führt diese Tests unverändert aus; sie werden lokal nicht als bestanden dargestellt.
- Browserprüfungen verwenden gebaute Anwendung, HTTP/Socket.IO, getrennte Konten und Kontexte, Neustarts und tatsächliche Bedienung. Kleine Desktopfenster, helle Darstellung, frühe Alarmierung, gemeinsame Lage, öffentliche Bereitschaft, KatS-Patientenablauf, Garage und freie Fahrzeugwünsche sind enthalten.
- Lokal bestand der vollständige normale Edge-Lauf zunächst 92 von 93 Abläufen. Die verbliebene Hochwasserprüfung wurde auf eine tatsächlich erfahrene Testleitstelle statt einen Anfängerstand umgestellt; anschließend bestanden alle zehn betroffenen Oberflächen-/Großlagenabläufe. Die feste sichtbare Alarmierung wurde zusätzlich einzeln geprüft. Beide Lastprüfungen bestanden in einem getrennten unveränderten Build: 100 Wachen, 500 Fahrzeuge, 40 Einsätze sowie gemessene Kartenbewegung. Ein vorangegangener Lastlauf mit gleichzeitig ersetztem Build ist ausdrücklich kein erfolgreicher Nachweis.
- Audioprüfungen messen tatsächliche PCM-Ausgabe, Überlagerung/Absenkung und eine MediaRecorder-Aufnahme. Der lokale Sprach-Watchdog wird zusätzlich mit kontrollierten Browserstimmen geprüft; dieser Verhaltenstest ist kein subjektiver Klangbeweis für jede installierte Systemstimme.

Die Screenshots und Audioaufnahmen stammen aus dem gestarteten Spiel mit kleinen reproduzierbaren Testwelten. Sie sind keine erfundenen Entwürfe und kein Bildbeleg für den vollständigen Deutschlanddatensatz. Die entsprechenden Linux-Browserläufe laden Belege in ihre GitHub-Actions-Artefakte. Verbindliche Abschlussnachweise sind die tatsächlichen Ergebnisse für den auf `main` übertragenen Commit einschließlich CodeQL-SARIF und offener Alerts.

## Betroffene Module

Servercontroller und Migrationen: `server/world-situation.ts`, `server/location-migration.ts`, `server/game.ts`, `server/database.ts`, `server/cli.ts`, Germany-Provider. Simulation: `world-situation`, `weather`, `traffic`, `location-reachability`, `location-repair`, `incident-selection`, `pacing`, `calls`, `civil-protection`, Funk-/Personal-/Hilfemodule. Oberfläche: `CallDesk`, `CallConversation`, `DispatchPanel`, `IncidentData`, `IncidentOperations`, `IncidentHistory`, `WorldSituationView`, `Topbar` und Garage. Die vollständigen Dateien sind im Git-Diff dokumentiert.

Wachpreise, Freischaltstufen, Sammelzeiten, Lagephasen und Generatorgewichte sind ausdrücklich **Spielparameter**. Fachliche Fahrzeugorientierung und deren Quellen sind in [Katastrophenschutz](KATASTROPHENSCHUTZ.md) getrennt beschrieben. Weitere Bedienungs- und Betriebsdetails: [Funk](FUNKVERARBEITUNG.md), [Weltlagen und Einsatzorte](WELTLAGEN-UND-EINSATZORTE.md).
