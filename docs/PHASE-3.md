# Phase 3 – Organisationen und Nachbarleitstellen (2.9.0)

Phase 3 erweitert das bestehende Spiel, seine serverseitige Simulation und beide getrennten Spielstände. Es werden keine Konten, Wachen, Fahrzeuge, Guthaben oder abgeschlossenen Einsätze zurückgesetzt. Die Grenzen von zwei gleichzeitig erzeugten Einsätzen und unregelmäßigen 90–210 Sekunden zwischen neuen Notrufen bleiben bestehen. Die Simulation läuft unverändert in Echtzeit.

## Wachen, Personal und Ausrücken

Unter **Wachen → Wache öffnen → Organisation, Ausrücken und Reserve** lässt sich eine Feuerwache als Berufs-, Freiwillige, Werk-, Betriebs- oder Flughafenfeuerwehr führen. Die drei betrieblichen Varianten verwenden in Phase 3 die vorhandenen Feuerwehrfahrzeuge; besondere Flughafenfahrzeuge oder Werksgeometrien wurden nicht erfunden. Neue BF-Wachen verwenden 30 Sekunden Grundzeit; Führungsfahrzeuge benötigen die Hälfte, mindestens zehn Sekunden. Bereits bestehende Wachen behalten bis zum Speichern eines Organisationsprofils ihre bisherige Alarmverzögerung. DME, Sirene und Wachalarm bleiben als Alarmierungsarten nutzbar. Ein gespeichertes Organisationsprofil bestimmt die Grundzeit.

**Freiwillige Feuerwehr:** Jedes zugewiesene Mitglied quittiert den Alarm anhand seiner konfigurierten Erreichbarkeit. Verfügbare Kräfte kommen einzeln von ihrem Wohnort oder während ihrer Arbeitszeiten vom Arbeitsort über das Straßennetz zur Wache. Eigenes Auto, Fahrrad oder Fußweg haben unterschiedliche Geschwindigkeiten. Tageszeit, Arbeitswoche, Verkehr und Wetter beeinflussen die Anreise. Bereitschaftspersonal ist bereits an der Wache. Die errechneten Rückmeldungen und Ankunftszeiten werden gespeichert: Neuladen oder Serverneustart würfelt sie nicht neu aus.

Unter jedem Personalprofil können Name, Funktion, Schicht, Wohn-/Arbeitsort, Anreise, Erreichbarkeit, Bereitschaft und zeitlich begrenzte beziehungsweise unbefristete Abwesenheiten eingestellt werden. Urlaub, Krankheit, Fortbildung, Unerreichbarkeit, Verschlafen und sonstige Abwesenheit sind wirkliche Dispositionssperren. Laufende Ausbildung und erforderliche Fachausbildung gelten weiterhin. Gebundene Personen können während eines Einsatzes nicht umkonfiguriert werden. Die Zahl ihrer Ausrückvorgänge bleibt erhalten.

Die Anzeige im **Fuhrpark** nennt verfügbare und benötigte Besatzung sowie während einer Alarmierung die einzelnen Ankünfte. Ein Fahrzeug rückt erst aus, wenn genügend geeignete Kräfte tatsächlich eingetroffen sind. Sind zu wenige positive Rückmeldungen vorhanden, endet die Alarmierung nach zehn Minuten ohne Ausrücken. Die eigene Einsatzleitung erhält einen Sprechwunsch zur Ersatzdisposition. Bei Nachbarhilfe bleibt eine ausgefallene Zusage in der Anfrage nachvollziehbar; Ersatz kann über eine neue Anfrage bestellt werden.

Regel- und Vollbesatzung verwenden die bisherige Katalogstärke. Als ausdrücklich vereinfachte Spielregel kann für Feuerwehrfahrzeuge Mindestbesatzung gewählt werden: drei Kräfte, bei kleineren Fahrzeugen deren Katalogstärke. Die erforderliche Fachausbildung bleibt unverändert. Unter **Fuhrpark → Alternativfahrzeug besetzen → Besatzung umsetzen** lässt sich tatsächlich vorhandenes, geeignetes Personal zwischen zwei freien Fahrzeugen derselben Wache verschieben. So kann ein kleineres Fahrzeug ausrücken, wenn für das größere genügend Personal fehlt.

Die Rettungsdienstschichten sind Tag 06–14 Uhr, Spät 14–22 Uhr, Nacht 22–06 Uhr oder 24 Stunden. Bereitschaft überbrückt die Schichtgrenze. Die regionale Simulationsuhr nutzt fest UTC+1; sie hängt nicht von der Zeitzone des Serverbetriebssystems ab. BF-Wachabteilungen A/B/C dienen der organisatorischen Zuordnung bei durchgehender Besetzung. Ein vollständiger Personalstundenplan, automatische Vertretungsplanung oder ein Feiertagskalender ist damit nicht vorgetäuscht.

## Reserve und Einsatzaufträge

Einzelne Fahrzeuge können im Fuhrpark **als Reserve zurückgehalten** werden. Zusätzlich lässt sich je Wache eine Zahl verfügbarer Fahrzeuge als Gebietsreserve festlegen. Diese Regeln gelten für freie Disposition, AAO und Zusagen an Nachbarleitstellen, auch bei Mehrfachauswahl. Die Reserve wird zur Freigabe bewusst herabgesetzt beziehungsweise ausgeschaltet; dies ist auch während laufender Einsätze möglich. Änderungen von Organisation, Grundzeit und Besatzungsregel warten dagegen auf die Rückkehr aller Fahrzeuge.

Neue Einsätze erhalten passende **Organisationsaufträge** nach der Erkundung:

| Bereich | Wirksame Aufträge |
| --- | --- |
| Polizei | Einsatzstelle sichern, Ermittlungen/Fahndung |
| THW / technische Kräfte | Abstützen und Bergen, Strom und Beleuchtung, Pumpen und Logistik |
| Rettungsdienst | Sichtung und Versorgung koordinieren |

Der Disponent beauftragt die Maßnahme. Fortschritt entsteht ausschließlich mit passenden, funktionsfähigen Fahrzeugen am Einsatzort. Bei erforderlicher polizeilicher Sicherung beginnt die Patientenversorgung am Einsatzort erst nach deren Abschluss. Transporte mit bereits aufgenommenen Patienten werden weiterhin versorgt. Offene Organisationsaufträge verhindern den Einsatzabschluss. Dynamische Gefahren, Nachforderungen, Taktik und individuelle Patienten aus Phase 2 bleiben integriert. Geeignete Nachbarkräfte zählen bei Fähigkeiten, AAO, Nachforderungen und Einsatzarbeit mit.

## Rettungsdienst und Krankenhäuser

Unter **Wachen → Krankenhaus → Krankenhausaufnahme** sind Aufnahmezustand, nutzbare Betten und Fachbereiche konfigurierbar. Verfügbar sind Notaufnahme, Chirurgie/Schockraum, Intensivmedizin, Kinderheilkunde und Brandverletzungen. Nutzbare Betten können die gebaute Kapazität nicht überschreiten.

Die Zuteilung prüft die tatsächlich einzuladenden Patienten: Kinder brauchen Kinderheilkunde, schwere Zustände beziehungsweise Reanimation Intensivmedizin, passende Verletzungen Chirurgie oder Brandversorgung. Belegte Betten und bereits zugesagte Transporte werden gemeinsam gezählt. Die Regionalklinik bleibt als bestehende öffentliche Aufnahme mit 100 Plätzen und allen Fachbereichen erhalten. Diese Kapazitäten gehören zur jeweiligen Leitstellenwelt; es wurde keine unbegrenzte gemeinsame Krankenhausressource eingeführt.

Im Einsatz kann ein bevorzugtes Krankenhaus gewählt werden. Ist es abgemeldet, ungeeignet oder voll, fährt der Server eine geeignete Alternative an. Bei einem eigenen Rettungsmittel wird die tatsächliche geplante Fahrzeit für die Auswahl verwendet. Ohne passende Aufnahme warten die Patienten versorgt am Einsatzort. Bereits fahrende Transporte behalten ihre Aufnahmezusage auch bei späterer Abmeldung. Fremde Rettungsmittel verwenden die Aufnahmeangebote ihrer Heimatleitstelle. Individuelle Patienten, Transportauftrag, Übergabe und einmalige Abschlussbuchung werden zwischen beiden Leitstellen abgeglichen.

Es gibt gemeinsame Bettenkapazität und Fachbereichseignung; getrennte Echtwelt-OP-, Schockraum- und Intensivbelegungspläne sind keine zusätzliche versteckte Simulation.

## Ausdrückliche Hilfe zwischen unterschiedlichen Leitstellen

**Freunde → Leitstellenverbund · Nachbarleitstellen** zeigt unabhängige Leitstellen, ihren Namen und Onlinezustand. Ihre übrigen Einsätze, Fahrzeugbestände, Personal und Guthaben werden dadurch nicht freigegeben.

1. **Neue Unterstützungsanfrage:** Nachbarleitstelle, eigenen ausreichend aufgeklärten Einsatz, Priorität, gewünschte Fahrzeugtypen und Nachricht wählen. Mehrere Exemplare eines Typs sind möglich.
2. **Entwurf anlegen:** Der Entwurf bleibt ausschließlich in der eigenen Leitstelle sichtbar.
3. **Anfrage verbindlich senden:** Die ausgewählte Nachbarleitstelle sieht die gezielte Anfrage samt gemeldetem Einsatzbild und Ort.
4. Die andere Leitstelle kann Rückfragen stellen, ablehnen oder ein beziehungsweise mehrere tatsächlich verfügbare eigene Fahrzeuge auswählen. **Ausgewählte Kräfte alarmieren** ist die ausdrückliche Zusage und Alarmierung. Teilannahme ist möglich, weitere angeforderte Kräfte lassen sich später ergänzen.
5. Erst für zugesagte Unterstützung werden zugehöriger Einsatz, gebundene Fahrzeuge und deren Heimatwachen sichtbar. Freie Fahrzeuge und andere Einsätze bleiben privat. Die Partneransicht enthält bestätigte Lage, Status und Verlauf; die Einsatzleitung bleibt beim anfragenden Disponenten.
6. FMS und Ankunft werden serverseitig verfolgt. Auch die erste Erkundung kann von einer Nachbarleitstelle kommen. Die anfragende Leitstelle nimmt die Lagemeldung auf und beauftragt weitere Maßnahmen. Defekte fremder Fahrzeuge erzeugen eine Ersatzmeldung. Nachfragen und Antworten bleiben gespeichert.
7. Anfrage zurückziehen oder Unterstützung beenden ruft die zugeordneten Kräfte zurück. Ein laufender Patiententransport muss zuerst ankommen. Ein Fahrzeug mit Defekt bleibt bis zu seiner Reparatur gebunden und kehrt anschließend zurück.
8. Nach Einsatzabschluss endet die Hilfe automatisch. Der bestehende, einmalig gebuchte Kooperationsanteil wird auf tatsächlich beteiligte Leitstellen verteilt. Anfrageverlauf und Einsatzhistorie bleiben einsehbar.

Zustände: `DRAFT`, `SENT`, `ACCEPTED`, `DECLINED`, `IN_PROGRESS`, `DONE`, `CANCELLED`. Eine Zusage setzt **keine allgemeine Einsatzfreigabe**. Maximal vier unterstützende Leitstellen je Einsatz, 20 angeforderte Fahrzeuge je Anfrage und 30 offene Anfragen je anfragender beziehungsweise empfangender Leitstelle begrenzen die Koordination. Bis zu 500 eigene Anfragen werden gespeichert; die Verbundansicht zeigt die jüngsten 500 zugänglichen Anfragen. Pro Anfrage sind 100 Nachrichten möglich.

Disponenten derselben Leitstelle dürfen diese Vorgänge gemeinsam bearbeiten. Rechteentzug wirkt sofort. Ein Beitritt zu einer anderen Leitstelle ist bei eigenen offenen Unterstützungsanfragen zunächst gesperrt; die laufende Koordination darf nicht ohne zugänglichen Disponenten zurückbleiben. Einzelspieler bleibt unabhängig und enthält keine Nachbarleitstellen. Ohne eingeloggten Disponenten nimmt eine Leitstelle keine neue Anfrage automatisch an; bereits angenommene Hilfe wird bei geschlossenem Browser weiter simuliert.

## Speicherung und Migration 7 → 8

SQLite erhält Schema 8. Die neuen optionalen Felder liegen in den bestehenden serverseitigen Spielständen: `Building.organization`, `Building.hospital`, `Person.duty`, `Vehicle.turnout/reserve/destination`, `Mission.organization` und `Save.aid`. Konten, Mitgliedschaften und Aktions-/Belohnungsbelege verwenden die vorhandenen Tabellen und Transaktionen.

Vor einer Migration legt der Server die bestehende vollständige `pre-migration-v2-*.sqlite`-Sicherung an. Der historische Dateipräfix bleibt zur Kompatibilität mit den bestehenden Betriebswerkzeugen erhalten. Beide Spielmodi werden übernommen. Alte Einsätze erhalten keine nachträglich verpflichtenden Organisationsaufträge und laufende Ausrück-/Fahrtermine bleiben erhalten. Historische leere Anfragebestände werden als leere Liste ergänzt. Neue Maßnahmen gelten für neu generierte Einsätze.

Neue Aktionen verwenden weiterhin strenge Schemata, serverseitige Besitzprüfung, CSRF-/Origin-Schutz und persistente Aktions-IDs. Fehlgeschlagene Mehrfachzusagen werden vollständig zurückgerollt. Wiederholte Zustellung derselben Aktion erzeugt keine zweite Zusage, Alarmierung oder Auszahlung. Zufällige Personalquittierung wird ausschließlich serverseitig reproduzierbar ermittelt.

Keine neuen Umgebungsvariablen, Ports, Dienste oder Abhängigkeiten. AMP wie bisher stoppen, sichern, `main` aktualisieren, Setup erfolgreich abschließen lassen und starten. Der Auftrag umfasst keine automatische Aktualisierung des privaten Produktionsservers. Alte Programmstände dürfen nicht gegen Schema 8 gestartet werden; ein Rollback benötigt passende Software und Sicherung.

## Weitere Roadmap

Phase 4 bleibt für MANV, große Unwetter-/Katastrophenlagen, Großbrände, Massenereignisse und umfassende Ressourcenknappheit vorgesehen. Phase 5 bleibt für erweiterten Audio-/UI-Feinschliff, Statistik, Berichte, Replay, Debugwerkzeuge und Balancing. Die vorhandenen 20 Fahrzeugtypen und 40 Einsatzvorlagen werden weiterverwendet; die lange Master-Katalogliste ist keine Behauptung zusätzlicher bereits gebauter Spezialfahrzeuge.

[Testbericht](PHASE-3-TESTBERICHT.md) · [Multiplayer](MULTIPLAYER.md) · [AMP-Betrieb](AMP.md)
