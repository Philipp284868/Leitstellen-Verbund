# Rückfahrt, Transportbereitschaft und Störungen 2.20

Die Rückfahrt ist eine Bewegung zur Wache, keine pauschale Einsatzsperre. Ein besetztes, leeres und einsatzbereites Fahrzeug bleibt währenddessen alarmierbar. Das gilt für Feuerwehr, RTW, KTW, GRTW, Intensivtransport und nicht transportierende Rettungsmittel gleichermaßen. FMS 1 beschreibt diese Bereitschaft über Funk; an der Wache folgt FMS 2. Ein Folgeauftrag wechselt unmittelbar in FMS 3.

## Vorher bestätigte Fehler

Fünf neue Regressionstests scheiterten vor der Korrektur: jede Rückfahrt war gesperrt; der NEF erhielt pauschale Nachbereitung; tatsächliche Passagiere wurden nur durch die allgemeine Rückfahrtsperre verdeckt; ein neuer Defekt wartete unbegrenzt auf einen manuellen Auftrag; ein historischer wartender Defekt kam ebenfalls nicht automatisch weiter. Die Alarmierung verwendete zusätzlich das alte Pfadende für ihre Vorprüfung und plante erneut eine Besatzungsbildung.

## Verbindliche Umsetzung

- `availability.ts` berechnet die Bereitschaft aus dem tatsächlichen Zustand. Ein vom Client mitgesendeter beziehungsweise im Snapshot vorhandener `availability`-Wert hat keine Autorität. Passagiere, laufender Transport, tatsächliche Nachbereitung, Defekte und fehlende geeignete Besatzung bleiben konkrete Sperren.
- `dispatch.ts` alarmiert Rückkehrer mit vorhandener Besatzung direkt. Es erstellt eine neue Zuordnung, ersetzt die Route und ihren Ankunftszeitpunkt, behält Personalbindungen und verzichtet auf neue Ausrückezeit und FMS 9. Alarmierung und tatsächlicher Fahrtbeginn werden in der Historie erfasst; der Bericht erhält eine geplante Ausrückezeit von null.
- `road-continuation.ts` erhält den noch nicht befahrenen Teil der aktuell belegten gerichteten Straße einschließlich ihrer Formpunkte und anteiligen Meter. Erst am Ende dieser gerichteten Kante wird die neue Route angesetzt. `traffic.ts` nutzt dieselbe Planung für Alarmierung, Vorschau, Verkehrsneuberechnung und Reparaturfortsetzung. Die gespeicherten Bewegungsphasen erlauben dies auch nach einem Neustart ohne Routercache.
- Eine vorübergehende Routingstörung hält das Fahrzeug exakt an seinem Punkt. Das Journal behält den Restabschnitt für den späteren Versuch. `vehicle-position.ts` verhindert Bewegung während einer solchen Wartezeit. Es gibt keinen Rücksprung zur Wache und keine alte asynchrone Ankunft, die eine neue Zuordnung überschreibt.
- `germany/approach-key.ts` bindet den Cache der Fahrtvorschau an den Fahrzeugstatus, die Zuordnung und die konkrete Fahrt. Die Sichtprüfung hatte einen zusätzlichen Fehler aufgedeckt: Nach dem Zurückschicken zeigte der Browser bis zum Cacheablauf noch die frühere 30-Sekunden-Ausrückezeit der Wache, obwohl der Server korrekt ohne erneutes Ausrücken plante. Der Statuswechsel verwirft diesen Stand nun sofort. Während einer Fahrt wird die Vorschau in 15-Sekunden-Intervallen erneuert; ein alter asynchroner Antwortstand ersetzt keine neuere Vorschau.
- Eine an Bord befindliche Besatzung verlässt das Fahrzeug nicht allein durch einen Schichtwechsel. Verletzungen, fehlende Qualifikation und Ausbildung bleiben echte Einschränkungen. FF-Poolkräfte bleiben bis zur tatsächlichen Rückkehr gebunden und werden bei einem Folgealarm nicht neu gerufen.
- `recall` verwirft keine Patienten mehr. Die wirkliche Klinikankunft dokumentiert erst die Übergabe, merkt erforderliche Arbeit vor und leert erst dann die Transportbelegung. Die Nachbereitung ergibt sich aus tatsächlichem Transport und Transportfähigkeit, nicht aus einem Organisationsnamen oder einer Liste von Fahrzeugnamen.

Die neu geplante Transportnachbereitung umfasst 45 Sekunden Desinfektion, 30 Sekunden Reinigung und 30 Sekunden Materialauffüllung. Bei bekannter Gefahrstoff-/Kontaminationslage dauert die Desinfektion 75 Sekunden. Die Arbeiten beginnen an der Wache, blockieren aber bereits die Rückfahrt mit der konkreten Information „nach Rückkehr erforderlich“. Bestehende gespeicherte Aufgaben und ihre bereits laufenden Fristen bleiben erhalten. Ein leerer RTW nach einem Einsatz ohne Transport und ein NEF erhalten daraus keine künstliche Sperre.

## Automatische Störungen

`fault-config.ts` enthält bewusst kurze Spielunterbrechungen, keine Behauptungen über echte Werkstattzeiten:

| Störung            | Simulationszeit |
| ------------------ | --------------: |
| Motor              |           120 s |
| Reifen             |            60 s |
| Technische Störung |            60 s |
| Funk               |            30 s |
| Ausrüstung         |            45 s |
| Tank/Ladung        |            45 s |
| Fahrzeugunfall     |           150 s |

`faults.ts` speichert Ursache, tatsächliche Position, Beginn und Reparaturfrist sofort. Währenddessen gilt FMS 6 und es werden keine ausgefallenen Fähigkeiten beigetragen. Beim Ablauf wird der vorhandene Zustand neu bewertet: an der Wache FMS 2, Rückfahrt FMS 1, Anfahrt FMS 3, Einsatzstelle FMS 4, Patiententransport FMS 7. Andere tatsächlich offene Sperren, insbesondere Nachbereitung oder unvollständige Besatzung, werden dabei nicht aufgehoben. Patienten, Ziel und Einsatzzuordnung bleiben erhalten. Für fünf Minuten nach einer abgeschlossenen Reparatur erfolgt keine erneute zufällige Defektauslösung; gezielte Laborstörungen bleiben ausdrücklich steuerbar.

Alte manuelle Reparaturaktionen bleiben als kompatible, idempotente Schnittstelle bestehen, sind für das Spiel aber nicht erforderlich. Ein historischer `awaiting`-Eintrag wird beim nächsten Simulationsschritt anhand seines ursprünglichen Beginns und des Störungstyps übernommen. Ein bereits verstrichener Termin wird sofort einmalig bearbeitet, nicht mit jedem Browserstart zurückgesetzt.

## Persistenz und Prüfung

SQLite-/Spielstandschema **13 bleibt unverändert**. Es gibt keine neue Pflichtspalte, keinen Datenreset und keine Konvertierung vorhandener Weltgeometrien. Neue Zustände verwenden vorhandene Fahrzeug-, Bewegungs-, FMS- und Arbeitsdaten. Bei alten Defekten mit überschriebenem Bewegungsepoch wird ein geometrisch eindeutig zuordenbarer gespeicherter Abschnitt anhand der eingefrorenen Position wiedergewonnen. Fehlende historische Geometrie wird nicht erfunden.

Gezielt ausgeführt am 09.09.2026: **60/60 Tests in sieben Dateien**, 14,59 Sekunden auf dem lokalen Windows-Rechner:

```text
node node_modules/vitest/vitest.mjs run tests/return-faults.test.ts tests/return-http.test.ts tests/germany-simulation.test.ts tests/availability-security.test.ts tests/phase-two.test.ts tests/dispatch-expansion.test.ts tests/fleet-view.test.ts --maxWorkers=1
```

Die neuen Fälle prüfen unterschiedliche leere Transportmittel und NEF, reale Nachbereitung/Passagiersperren, exakten anteiligen Straßenweg, erhaltene gerichtete Formpunkte, gleichbleibende Personalbindung, FMS-Wechsel ohne erneute Ausrückezeit, alte Ankunftszeitpunkte, doppeltes Alarmieren, automatisch endende und historische Defekte, Patiententransport während einer Reparatur und die Schonfrist nach Wiederherstellung. Die Deutschlandfälle verwenden eine echte SQLite-Datenbank und einen ausdrücklich **synthetischen** GraphHopper-Vertragsserver; sie prüfen zusätzlich Datenbank- und Provider-Neustart.

`return-http.test.ts` benutzt echte HTTP-Sitzungen eines Inhabers, eines berechtigten Disponenten und eines fremden Kontos. Zwei gleichzeitig gesendete Alarmierungen ergeben genau einen Erfolg und eine Ablehnung. Der erfolgreiche Aktionsschlüssel bleibt wiederholbar, die Zuordnung entsteht genau einmal. Fremdzugriff wird abgelehnt. Typecheck wurde danach ebenfalls erfolgreich ausgeführt.

Zusätzlich bestanden die 22 Archiv-/FF-Tests in `history-integration.test.ts` und `volunteers.test.ts` nach der Korrektur ihrer alten pauschalen Rückfahrtsannahmen. Der neue Test `approach-context.test.ts` bestand mit 1/1 Fall und prüft den Wechsel von 30 auf null Sekunden Ausrückezeit, sofortige Cachetrennung bei Rückfahrt und neuer Zuordnung sowie die zeitlich begrenzte Aktualisierung während der Fahrt.

## Reproduzierbare Deutschland-Browserabnahme

`scripts/incident-acceptance.mjs` startet die isolierte Fixture `tests/fixtures/incident-real-server.ts` mit zwei echten angemeldeten Konten derselben Leitstelle. Sie benutzt den gebauten Deutschland-Client, das lokale Deutschland-Geodatenpaket und einen laufenden GraphHopper-Router. Ein neuer temporärer Datenordner trennt die Abnahme vollständig von bestehenden Spielständen. Die Fixture stellt nur den Anfangszustand, konkrete Einsatzlagen, eine gezielte Störung, die Simulationszeit und einen Serverneustart bereit. Notrufbearbeitung, Fahrzeugauswahl, Alarmierung, Lagemeldung, Zurückschicken und Prioritätsänderung erfolgen über sichtbare Bedienelemente des Browsers.

Beispiel in PowerShell nach einem erfolgreichen Build und bei laufendem lokalen Router:

```powershell
$env:GEODATA_DIR = (Resolve-Path '../leitstellen-deutschland-geodata').Path
$env:ROUTER_URL = 'http://127.0.0.1:8989'
$env:PW_EDGE = '1'
node scripts/incident-acceptance.mjs
```

Der Ablauf prüft einen zunächst neutralen Notruf, den gemeldeten Brandverdacht, TLF und DLK ohne HLF, echte Straßenanfahrt, erste Lagemeldung, sinkende Brandintensität bis null und den Rückzug des TLF bei noch laufenden unabhängigen Leiterarbeiten. Der Folgealarm muss von seiner exakten Straßenposition ohne neue Ausrückezeit mit derselben Besatzung beginnen. Ein medizinischer Notfall muss im Dropdown und durch sein Notfallsymbol sichtbar sein und seine grüne Grundfarbe behalten. Eine gezielte technische Störung endet automatisch nach ihrer persistenten Frist, einschließlich Serverneustart, unveränderter Zuordnung und anschließender Wiederverbindung beider Konten.

Nach einem erfolgreichen Lauf werden die strukturierten Messwerte nach `docs/quality-evidence/incident-real-2.20.json` und zehn Bilder nach `docs/screenshots/2.20/` geschrieben. Fehlerscreenshots liegen ausschließlich unter `.tools/test-runs/`. Geplante Basisfahrzeit und durch Fahrprofil/Verkehr/Wetter tatsächlich angesetzte Simulationsfahrzeit werden getrennt angegeben. Die Fixture beendet bewusst nicht die verbliebene Leiterarbeit und behauptet keine abschließende Belohnungsprüfung für diesen Einsatz.

Der abschließende Lauf mit Edge gegen den Release-Build endete am **09.09.2026 um 15:16:12 Uhr MESZ mit Exit 0**. Seine Logdatei ist `.tools/test-runs/incident-real-acceptance-final.log`; der versionierte [Messbeleg](quality-evidence/incident-real-2.20.json) enthält keine Browserfehler. Beide Fahrzeugrouten besitzen 42 Stützpunkte. Die geplante Basisfahrzeit beträgt jeweils 118,889 Sekunden, die tatsächlich angesetzte Simulationsfahrt 136,252 Sekunden. Die protokollierte Brandintensität sinkt von 24,597 über 18,008, 11,419 und 4,829 auf null. Nach der Brandnachkontrolle zeigt die Oberfläche ausdrücklich **2/3 erledigte Einsatzaufgaben**, weil die zusätzlich vorbereitete 900-Sekunden-Leiteraufgabe noch offen ist.

Die serverseitige Alarmzeit entspricht beim Folgealarm genau der neuen Abfahrtszeit. Neue Route und berechnete aktuelle Straßenposition beginnen beide bei `(46137.09686377807, 26456.68622678187)` in den Spielkoordinaten der Deutschlandwelt. Die Ausrückezeit beträgt null, auch in der sichtbaren Vorschau. Besatzung und neue Zuordnung bleiben beim folgenden 60-Sekunden-Defekt über einen echten Serverneustart erhalten. Der Browser bestätigt anschließend denselben FMS wie der Server und das verschwundene Störungssymbol. Die medizinische Priorität **NOTFALL** ist sowohl im Dropdown als auch am grünen Kartenmarker sichtbar; die Markierung bleibt nach Neustart erhalten.

Die Aufnahmen warten auf den passenden sichtbaren FMS-/Prioritätszustand und geladene Netzwerkinhalte. Für die Aufnahme werden endliche CSS-Übergänge abgeschlossen, damit ein bereits numerisch auf null stehender Brandbalken nicht mitten im Übergang fotografiert wird. Die während der Sichtprüfung gefundenen Widersprüche bei alter Fahrtvorschau, ausgeblendeter gewählter Priorität und altem Gesamtfortschrittsbalken sind im letzten Durchlauf zusätzlich durch DOM-Prüfungen abgesichert.

| Aufnahme                                                                            | Sichtbarer Nachweis                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [01 · Neutraler Notruf](screenshots/2.20/01-neutraler-notruf.png)                   | Noch kein bekanntes Einsatzbild und kein Brandbalken                      |
| [02 · Erste Disposition](screenshots/2.20/02-brandverdacht-tlf-disposition.png)     | Gemeldeter Brandverdacht und ausgewähltes TLF                             |
| [03 · Straßenanfahrt](screenshots/2.20/03-echte-strassenanfahrt.png)                | TLF und DLK mit FMS 3, Fahrtstrecke und verbleibender Zeit                |
| [04 · Bestätigte Lage](screenshots/2.20/04-bestaetigte-brandentwicklung.png)        | Sichtbare Brandentwicklung nach erster Lagemeldung                        |
| [05 · Feuer gelöscht](screenshots/2.20/05-feuer-geloescht-restaufgaben.png)         | Brandintensität null, Löschfortschritt vollständig, weitere Aufgabe offen |
| [06 · TLF auf Rückfahrt](screenshots/2.20/06-tlf-frei-restarbeiten-bleiben.png)     | FMS 1, null Sekunden Ausrückezeit, gebundene DLK und 2/3 Aufgaben         |
| [07 · Folgealarm](screenshots/2.20/07-folgealarm-von-aktueller-strasse.png)         | Neue Route ab aktueller Straßenposition mit FMS 3                         |
| [08 · Medizinischer Notfall](screenshots/2.20/08-medizinischer-einsatz-gruen.png)   | NOTFALL im Dropdown und als Zusatzzeichen am grünen Marker                |
| [09 · Automatische Störung](screenshots/2.20/09-automatische-stoerungsbehebung.png) | FMS 6 und sichtbare Restzeit der automatischen Behebung                   |
| [10 · Neustart und Fortsetzung](screenshots/2.20/10-neustart-fortsetzung.png)       | Wieder FMS 3 ohne Störungssymbol; medizinische Notfallmarkierung bleibt   |

Die vollständige Regression und der tatsächliche GitHub-/main-Status werden im [Gesamtbericht](EINSATZLOGIK-TESTBERICHT-2.20.md) dokumentiert. Diese gezielten Ergebnisse behaupten keinen bereits abgeschlossenen Release oder Produktionseinsatz.
