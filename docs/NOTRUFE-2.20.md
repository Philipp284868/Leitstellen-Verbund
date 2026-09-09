# Notrufaufkommen und Informationsstand – 2.20

Stand: 9. September 2026. Diese Dokumentation beschreibt die implementierte Serverregel und die tatsächlich ausgeführten Vergleichsmessungen. Sie ersetzt keine reale deutsche Einsatzstatistik.

## Befund vor der Änderung

Vier zuerst angelegte Regressionstests schlugen auf dem bisherigen Code fehl: Der beispielhafte nächste Anruf kam nach 106 Sekunden, unerledigte Notrufe verlängerten das Intervall nicht, die öffentliche Ansicht enthielt vor der Erkundung bereits Telemetrie und unbekannte interne Ereignisarten, und die Meldebildfrage lieferte eine konkrete interne Vorlagen-ID. Der alte Generator gewichtete die gesamte Vorlagenliste unmittelbar; zusätzliche Brandvarianten erhöhten deshalb ihren Anteil. Die allgemeine Generierung lief außerdem auch im ruhenden eigenen Spielstand eines Disponenten weiter, der bereits einer fremden Leitstelle zugeordnet war.

Die Belastungsmessung bestätigte den praktischen Effekt: In einer simulierten Stunde entstanden mit nur einem TSF 28–31 Vorgänge. Am Ende waren 19–22 noch nicht alarmiert. Eine zweite Messreihe mit HLF und TLF ergab einschließlich zusätzlicher Anrufer bis zu 34 Anrufe.

## Zentrale Erzeugung und persistente Fristen

`src/simulation/pacing.ts` enthält die gemeinsame Regel. `server/game.ts` wendet sie genau einmal pro aktiver Leitstelle an. Normale Zufallsereignisse, Kampagnen und Folgeereignisse teilen dieselbe Zulassung; pro Serversimulationsschritt kann höchstens ein neuer unabhängiger Vorgang entstehen. Mehrere Browserfenster, Disponenten, Ansichten und Wiederverbindungen setzen keinen eigenen Timer in Gang. Bestehende Vorgänge und Fahrzeugbewegungen eines ruhenden Mitgliederspielstands werden weiterhin abgearbeitet; er erzeugt keine neuen unabhängigen Einsätze.

| Regel                                          | Implementierter Wert / Wirkung                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Grundintervall einer kleinen Leitstelle        | Deterministisch variierende 300–480 Sekunden                                                                         |
| Absolute Intervallgrenzen                      | 120–1.200 Sekunden; Ressourcen- und Lastregeln können neue Ereignisse länger zurückhalten                            |
| Vergrößerung                                   | Logarithmisch nach vorhandenen Fahrzeugen an fertiggestellten Wachen und der Zahl ihrer Standorte                    |
| Erfahrungspunkte / Stufe                       | Erhöhen die Rate nicht unmittelbar                                                                                   |
| Unerledigte Vorgänge                           | Verlängern das Intervall und begrenzen die Zahl offener Vorgänge                                                     |
| Klingelnde / aktive Gespräche                  | Verstärken die Drosselung; es werden die betroffenen Vorgänge gezählt                                                |
| Gebundene / nicht alarmierbare Fahrzeuge       | Verstärken die Drosselung; tatsächliche Besetzung, Bereitschaft und Störungen fließen über `vehicleAvailability` ein |
| Keine alarmierbaren Fahrzeuge                  | Kein neuer unabhängiger Vorgang                                                                                      |
| Keine Fahrzeuge an fertiggestellten Wachen     | Die Einstiegswartezeit bleibt erhalten, während die erste Wache aufgebaut wird                                       |
| Nacht                                          | Faktor 1,2 auf das Intervall während 23–6 Uhr der gespeicherten Simulationszeit in UTC                               |
| Zu viel Last / aktuell keine geeignete Vorlage | Erneute Prüfung frühestens nach 45 Sekunden; längere fachliche Wiederholungsfristen bleiben erhalten                 |
| Größerer verpasster Zeitschritt                | Ab mehr als 60 Sekunden wird eine neue Zukunftsfrist gesetzt; keine nachträglich erzeugte Anrufwelle                 |

Der Skalierungsfaktor ist `1 + 0,12 × log2(Fahrzeuge) + 0,04 × log2(Wachenstandorte)`, jeweils mit mindestens 1 als Logarithmusargument. Das Mindestintervall beträgt `max(120, 300 / Faktor)`. Der Lastfaktor ist `1 + 0,35 × offeneVorgänge / OffenLimit + 0,2 × wartendeVorgänge + 0,3 × AnteilNichtAlarmierbar`. Das zufällig variierende Grundintervall wird durch den Skalierungsfaktor geteilt, mit Last- und gegebenenfalls Nachtfaktor multipliziert und auf die genannten Grenzen begrenzt. Zufall verwendet den gespeicherten Seed und benannte deterministische Teilziehungen.

Das Limit offener Vorgänge ist `min(8, 1 + floor(log2(Fahrzeuge) / 1,5))`; das Gesprächslimit ist `min(3, 1 + floor(log2(Fahrzeuge) / 3))`. Eine Startleitstelle mit einem oder zwei Fahrzeugen hat damit höchstens einen gleichzeitig offenen neu erzeugten Vorgang. Bestehende Spielstände mit mehr offenen Einsätzen werden nicht beschnitten. Die Generierung wartet, bis die Last wieder unter die Grenze fällt. Ein großes vorhandenes Szenario wird ebenfalls nicht gelöscht oder künstlich abgeschlossen.

Diese Regel betrifft die automatische Servergenerierung. Der direkte Aufruf von `generate()` bleibt für kontrollierte Szenarien und Tests nutzbar. Produktiv wird er durch den beschriebenen gemeinsamen Zulassungspfad aufgerufen. Einen nicht erreichbaren Deutschland-Standort ersetzt der Generator weiterhin nicht durch einen erfundenen Straßenpunkt; bestehende Routerwarte- und Fehlerregeln bleiben wirksam.

## Mehrere Anrufer zum selben Ereignis

Mehrfachanrufer sind weiterhin möglich, erzeugen aber keinen zweiten Einsatz. Pro Vorgang bleiben höchstens vier Anrufe erlaubt. Ein zusätzlicher Anruf ist frühestens nach 120 Sekunden vorgesehen; der gespeicherte Seed variiert den ersten zusätzlichen Zeitpunkt um bis zu 90 Sekunden. Fehlen nach einem abgebrochenen, nicht rückrufbaren Gespräch wesentliche Angaben, kann eine erneute Meldung frühestens nach 45 Sekunden erfolgen. Beide Regeln berücksichtigen den zuletzt erzeugten Anruf in aktuellen Vorgängen und in der Historie.

Solange bereits ein Anruf klingelt, wird ein geplanter zusätzlicher Anruf verschoben. Seine noch ausstehende Meldung geht dadurch nicht verloren. Ein bereits angenommenes Gespräch verhindert einen zweiten Anruf nicht pauschal; weitere Disponenten derselben Leitstelle können ihn bearbeiten. Die aktionsseitige Besitzprüfung verhindert, dass zwei Disponenten gleichzeitig dasselbe Gespräch verändern.

## Kategorie zuerst, Vorlage danach

`src/simulation/incident-selection.ts` bestimmt zunächst eine fachlich verfügbare Kategorie und erst danach die konkrete geeignete Vorlage. Die Menge der Brandvarianten ist damit kein Gewicht mehr. Doppelte Vorlagen-IDs werden vor der Auswahl entfernt. Wettergewichte wirken innerhalb der gewählten Kategorie und sind auf 1–4 begrenzt.

| Kategorie        | Nominales Spielgewicht | Alte Auswahl, 10.000 Ziehungen | Neue Auswahl, 10.000 Ziehungen |
| ---------------- | ---------------------: | -----------------------------: | -----------------------------: |
| Technische Hilfe |                     50 |                          4.687 |                          5.065 |
| Brand            |                     18 |                          2.828 |                          1.736 |
| Medizin          |                     24 |                          1.321 |                          2.410 |
| Polizei          |                      5 |                            848 |                            474 |
| Wasserrettung    |                      2 |                            299 |                            194 |
| Sonstige         |                      1 |                             17 |                            121 |

Eine separate Ziehung mit 1 % Wahrscheinlichkeit lässt außergewöhnliche Lagen zu, sofern solche Vorlagen fachlich geeignet sind. Darunter fallen als Großlage deklarierte Profile, schwere Brandprofile und die bisherigen großen Altvorlagen. Die 10.000er-Stichprobe enthielt 107 solche Ereignisse (1,07 %). Der Test zur Variantenunabhängigkeit prüft zusätzlich 2.000 identische Seeds mit nur einer Vorlage pro Kategorie gegenüber sämtlichen gewöhnlichen Brandvarianten: Die gezogene Grundkategorie bleibt jeweils gleich.

Die Stichprobe vergleicht beide Auswahlverfahren auf demselben Katalog bei identischer Zeit, identischem Wetter und reproduzierbarer Seedfolge. Sie misst die Auswahlkomponente, nicht 10.000 reale Deutschland-Einsätze. Die vorhandene Prüfung von Fähigkeiten, Voraussetzungen und passenden Geostandorten bleibt vorgeschaltet. Fehlt beispielsweise die medizinische Ausstattung, wird daraus kein nicht bewältigbarer medizinischer Auftrag. Gewichte werden auf die tatsächlich verfügbaren Kategorien normalisiert. Besteht ein explizit eingeschränkter Kandidatensatz ausschließlich aus außergewöhnlichen Vorlagen, bleibt dieser Satz nutzbar; die 1-%-Regel ist deshalb keine universelle Obergrenze für handverlesene Szenarien.

## Unbekannter Notruf und bekannte Beobachtungen

Ein noch nicht erfragter Vorgang verlässt den Server als `incoming`, mit neutraler Darstellung und neutraler Fragenauswahl. Die globale Seedfolge, künftige Notrufzeitpunkte, interne Vorlage, Gefahrendynamik, geplante Eskalationen, Aufgaben, Telemetrie, Defizitberechnung, interner Bericht und unbekannter Standort werden nicht in die öffentliche Ansicht übernommen. Neue interne Ereignisarten sind vor der Erkundung standardmäßig nicht freigegeben. Die Positivliste lässt nur das tatsächliche Gespräch, Bedienaktionen und beobachtete Fahrzeugbewegungen zu. Automatisch intern gesetzte Großlagenpriorität wird vor einer echten Disponentenentscheidung nicht veröffentlicht. Eine ausdrücklich vom Disponenten gewählte Priorität bleibt dagegen schon vor der Alarmierung sichtbar; ihr `DISPATCH_PRIORITY`-Ereignis gehört zum bekannten Bedienverlauf.

`src/simulation/call-observations.ts` definiert die öffentlichen Meldebild-IDs `reported-fire`, `reported-technical`, `reported-medical`, `reported-police`, `reported-water` und `reported-other`. Die Frage „Was ist passiert?“ liefert eine telefonische Beobachtung, beispielsweise Rauch an einem Fahrzeug, statt einer exakten Vorlagenbezeichnung oder einer bereits bestätigten Diagnose. Danach ist die beobachtete Kategorie bekannt und darf die Fragen, Darstellung und AAO-Grundanforderungen beeinflussen. Eine bereits klar berichtete Brandbeobachtung wird nicht bis zum ersten Fahrzeugbericht verschwiegen. Die tatsächliche vollständige Lage wird erst mit der autorisierten Lagemeldung freigegeben; frühere Fakten und Widersprüche bleiben sichtbar.

Die Serverdaten tragen das Meldebild, `src/mission-presentation.ts` übersetzt denselben Vertrag für die Oberfläche. Eine ausgebliebene Erstmeldung wird nicht clientseitig aus Organisation, Icon, Farbe oder einer versteckten Vorlagen-ID erraten. Gesprächsmerkmale werden ohne vorlagenspezifische Anruferrollen oder Brandgeräusche erzeugt. Allgemeine Aussagen über die anrufende Person sind keine bestätigte Einsatzdiagnose.

## Migration und Datenerhalt

Das optionale, versionierte Feld `callPacing` enthält `{ version: 1, notBefore, lastCreated, sequence }`. Ältere Spielstände ohne dieses Feld erhalten es beim nächsten autoritativen Schritt. Die erste Frist ist mindestens so lang wie ein neu berechnetes, zur vorhandenen Last passendes Intervall; eine längere vorhandene Wartezeit bleibt bestehen. Weitere Schritte und Wiederverbindungen initialisieren das Feld nicht erneut. Der Server speichert es zusammen mit dem übrigen Spielstand in SQLite. Ein zusätzliches SQLite-Schema-Upgrade ist hierfür nicht erforderlich.

Bestehende Missionen, historische Daten, Guthaben und Fortschritt werden nicht gelöscht oder neu gewürfelt. Ältere präzise `reportedTemplate`-Werte werden vor der Erkundung auf die passende öffentliche Meldekategorie abgebildet. Alte noch verborgene erste Telefonantworten, die bisher einen exakten Vorlagentitel enthielten, werden für die nächste Antwort in Beobachtungssprache überführt. Bereits gespeicherte Gesprächsfakten bleiben unverändert. Ein bereits durch Erkundung bestätigter Einsatz wird durch eine später beantwortete Telefonfrage nicht auf ein bloßes Meldebild zurückgestuft.

## Tatsächliche Vorher-/Nachhermessung

`tests/notruf-measurement.test.ts` führt sechs getrennte einstündige Simulationen mit SQLite und dem echten `Game.step()` aus. Der automatisierte Disponent nimmt Gespräche an, stellt alle fünf Kernfragen, alarmiert vorhandene geeignete Fahrzeuge, bearbeitet Sprechwünsche und fordert fehlende Kräfte nach. Fahrzeugwege, Ausrückzeiten und Einsatzarbeit bleiben echte Spiellogik; es werden keine Fahrzeuge teleportiert und keine Einsätze zur Verbesserung der Messwerte künstlich beendet. Ein Schritt entspricht fünf Simulationssekunden. Ein früher Stand hat ein TSF mit sechs tatsächlich zugewiesenen Kräften und 0 EP; der ausgebaute Feuerwehrstand hat HLF und TLF sowie 3.000 EP. Er ist kein voll ausgebauter Mehrorganisationsbetrieb.

Jede Zelle mit Pfeil zeigt **vorher → nachher** bei gleichem Ausgangsszenario und Seed. „Gebunden“ misst den Anteil der Fahrzeugzeit außerhalb des Status `ready`; eine bereits wieder alarmierbare Rückfahrt bleibt in diesem Messwert als unterwegs enthalten.

| Ausgangsstand | Seed | Einsätze/h | Anrufe/h | Max. offen | Mittlere offene Zahl | Fahrzeugzeit gebunden | Abgeschlossen | Verdiente EP |
| ------------- | ---: | ---------: | -------: | ---------: | -------------------: | --------------------: | ------------: | -----------: |
| 1 TSF         |  123 |     28 → 6 |   28 → 6 |     20 → 1 |         11,26 → 0,48 |         99,4 → 66,3 % |         8 → 5 |  1.064 → 675 |
| 1 TSF         |  987 |     31 → 6 |   31 → 6 |     19 → 1 |         10,46 → 0,37 |         99,4 → 53,1 % |        12 → 6 |  1.557 → 824 |
| 1 TSF         | 4071 |     28 → 5 |   28 → 5 |     22 → 1 |         12,71 → 0,56 |         99,4 → 70,3 % |         6 → 5 |    765 → 654 |
| HLF + TLF     |  123 |     28 → 6 |   30 → 6 |     21 → 1 |         10,89 → 0,52 |         98,3 → 44,0 % |         7 → 6 |  1.006 → 890 |
| HLF + TLF     |  987 |     31 → 7 |   34 → 7 |     18 → 1 |          8,66 → 0,40 |         97,4 → 29,2 % |        13 → 6 |  1.790 → 844 |
| HLF + TLF     | 4071 |     28 → 6 |   28 → 6 |     23 → 1 |         11,72 → 0,65 |         96,0 → 48,5 % |         5 → 5 |    687 → 732 |

Der ideale Disponent nahm die beantworteten Anrufe in beiden Reihen im Median innerhalb desselben Simulationsschritts an (0 Sekunden). Bei tatsächlich alarmierten Vorgängen lagen Median und 95. Perzentil der Zeit bis zur ersten Alarmierung in allen sechs Reihen bei 15 Sekunden. Das allein würde die frühere Überlast verschleiern: Am Ende waren vorher noch 20, 19, 22, 21, 18 beziehungsweise 23 Vorgänge gar nicht alarmiert. Der älteste davon wartete 2.705, 2.270, 2.935, 2.785, 2.135 beziehungsweise 3.045 Sekunden. Nachher waren in allen sechs Reihen keine noch unalarmierten Vorgänge übrig. Diese unerledigten Fälle werden gesondert ausgewiesen und nicht als angeblich kurze Wartezeit mitgezählt.

Der Fortschritt wurde für die Notrufänderung nicht durch einen neuen EP-Bonus kompensiert. In der TSF-Reihe wurden weiterhin 654–824 EP erreicht; die vorhandene Freischaltschwelle von Stufe 4 bei 555 EP bleibt damit in diesen Testabläufen innerhalb einer Stunde erreichbar. Dies ist eine gemessene Spielmöglichkeit, keine garantierte Zeit für jeden Spieler und jede Region.

Die Messung verwendet die kleine historische Falkenried-Testkarte für reproduzierbare kurze Strecken. Sie behauptet keine gleichartigen Fahrzeiten für die Deutschlandkarte. Außerdem vergleicht sie die integrierte 2.20-Fassung einschließlich der geänderten Fahrzeugbereitschaft und Fähigkeiten mit dem vorherigen Stand; sie isoliert nicht den statistischen Effekt jeder einzelnen Codeänderung. Deutschland-Routing und tatsächliche Geostandorte werden in ihren eigenen Integrationstests geprüft.

## Ausgeführte Prüfungen und Wiederholung

Die vier Ausgangsregressionen wurden vor dem Fix ausgeführt und schlugen fachlich passend fehl. Nach der Umsetzung bestanden sie. Der ergänzte Migrationsfall für alte verborgene Vorlagentitel wurde ebenfalls zunächst rot reproduziert und danach korrigiert. Der abschließende Lauf aus Notrufregression, HTTP-/Socket-Test, Messung, Server- und Phase-1-Datei bestand mit 32 Tests. Anschließend bestand die gezielte Wiederholung nach dem zusätzlich durch eine Browserprüfung gefundenen Prioritätsfehler mit 12 Tests; die neue Regression prüft sowohl die ausdrücklich gesetzte sichtbare Priorität als auch die weiterhin verborgene automatische Priorität.

Die acht relevanten Bestandsdateien `phase-one`, `phase-http`, `modes`, `dispatch-expansion`, `germany-simulation`, `germany-http`, `phase-four` und `phase-five` bestanden zusammen mit 89 Tests. Ihre Zeitfixtures wurden an den ruhigen Einstieg angepasst; Routerausfälle werden gezielt bei einer wirklich fälligen gespeicherten Erzeugungsfrist ausgelöst. Zugangs-, Patienten-, Kampagnen-, Eigentums- und Neustartprüfungen bleiben erhalten. Die Serverdatei prüft weiterhin tatsächliche authentifizierte Socket-Verbindungen, CSRF und Fremd-Origin-Schutz, Aktionswiederholung, fremden Besitz und vollständig gemeinsam abgewickelten Patiententransport.

Der neue HTTP-/Socket-Test verwendet drei Konten und eine gemeinsame Leitstelle mit mehreren Tabs. Er bestätigt persistierte Fristen bei Wiederverbindung, keine eigene Erzeugung im ruhenden Mitgliederspielstand, getrennte Daten der unabhängigen Leitstelle, Abweisung fremder und doppelter Gesprächsaktionen, denselben bekannten Faktenstand für berechtigte Disponenten sowie Wiederherstellung aus derselben SQLite-Datei ohne nachträglichen Anrufstapel. Der Server läuft tatsächlich; die Uhr wird für deterministische Prüfung kontrolliert. Dieser Test ist kein Browser-Screenshot-Test.

Gezielte Wiederholung mit den installierten Projektabhängigkeiten:

```powershell
node .tools/pnpm-11.19.0/bin/pnpm.cjs exec vitest run tests/notruf-2.20.test.ts tests/notruf-http.test.ts tests/notruf-measurement.test.ts tests/server.test.ts tests/phase-one.test.ts --maxWorkers=2
```

Messwerte als lokale JSON-Datei ausgeben:

```powershell
$env:LV_CALL_MEASURE_OUT = '.tools/notruf-repeat.json'
node .tools/pnpm-11.19.0/bin/pnpm.cjs exec vitest run tests/notruf-measurement.test.ts --maxWorkers=1
Remove-Item Env:LV_CALL_MEASURE_OUT
$env:LV_CALL_MIX_OUT = '.tools/notruf-mix-repeat.json'
node .tools/pnpm-11.19.0/bin/pnpm.cjs exec vitest run tests/notruf-2.20.test.ts --maxWorkers=1
Remove-Item Env:LV_CALL_MIX_OUT
```

Die ursprünglichen Vorher- und Nachhermessungen sowie ihre zusätzlichen Wartezeitwerte wurden lokal aus den tatsächlichen SQLite-Testständen gesichert und sind in [notruf-2.20-messwerte.json](notruf-2.20-messwerte.json) zusammengefasst. Die heutige Messdatei berechnet die Wartezeit- und Restlastfelder direkt mit. Eine Wiederholung auf einem später veränderten Katalog kann andere Einzelzahlen liefern; Seeds, Zeit, Testkonfiguration und ausgewertete Spielfassung müssen deshalb gemeinsam angegeben werden. Weder diese Dokumentation noch lokale Testergebnisse behaupten einen bereits erfolgten Push, einen grünen CI-Lauf oder eine Produktionsinstallation.
