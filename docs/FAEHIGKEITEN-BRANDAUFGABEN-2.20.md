# Fähigkeiten, dauerhafte Brandaufgaben und Kräfteabzug – 2.20

## Nachgewiesener Ausgangsfehler

Vor der Änderung wurde eine AAO mit `types: []` und `skills: { fire: 1 }` an einem erkundeten Müllbehälterbrand mit verfügbaren, besetzten Löschfahrzeugen ausgeführt. Der Vorschlag enthielt **kein Fahrzeug**; die Fehlmeldung benannte einen bestimmten TSF-W. `propose()` wählte nur die ausdrücklich eingetragenen Typen und bewertete Fähigkeiten erst nach dieser Auswahl.

Auch nach auf null abgearbeiteten und als erledigt gespeicherten Brandgefahren lieferte `requirements()` weiterhin `{ fire: 1 }`. Der alte allgemeine Einsatzfortschritt verbarg dabei einen weiteren Fehler: Eine explizit notwendige Wasserversorgung wurde für den Abschluss verlangt, beeinflusste aber die eigentliche Brandarbeit nicht. Ohne entsprechende Löschwasserversorgung konnten die Flammen schon vollständig verschwinden.

## Tatsächliche Umsetzung

Die vorhandenen Fahrzeugfähigkeiten und IDs bleiben erhalten. Eine AAO kann mit Fähigkeiten allein konfiguriert werden. Der Vorschlag ergänzt geeignete verfügbare Fahrzeuge, bis diese Fähigkeiten gedeckt sind oder keine passende Besatzung beziehungsweise Route mehr verfügbar ist. Explizite Typwünsche bleiben zusätzliche verbindliche Wünsche. Ein gemeinsamer Besatzungsallocator verhindert, dass dieselben Personen mehreren Vorschlagsfahrzeugen gleichzeitig zugerechnet werden. Die Auswahl berücksichtigt zuerst ihren Beitrag zu noch offenen Fähigkeiten und danach die berechnete Ankunftszeit und eine stabile ID-Reihenfolge. Ein Vorschlag enthält höchstens 30 Fahrzeuge entsprechend dem bestehenden Dispositionsvertrag.

Vor der ersten Erkundung verwendet die automatische Auswahl ausschließlich das gemeldete öffentliche Meldebild. Sie liest keine geheime Profil-ID und schlägt keine heimlich erkannten Spezialanforderungen vor. Manuell konfigurierte Spezialwünsche bleiben möglich.

TSF-W, TLF 4000 und HLF 20 bewältigen mit jeweils einer geeigneten Besatzung einen einfachen Müllbehälter- und Pkw-Brand allein. Ein RTW besitzt keine Brandbekämpfungsfähigkeit und wird deshalb nicht als Ersatz ausgewählt. Zusätzliche Anforderungen wie Drehleiter, Gefahrstoffausrüstung, technische Rettung oder explizit geforderte Wasserversorgung bleiben echte Fähigkeiten. Fehlmeldungen beschreiben die fehlende Leistung statt einen vermeintlich einzig erlaubten Fahrzeugtyp.

Die Planungsansicht unterscheidet zwischen vorhandenen Fähigkeiten (`effectiveSkills`) und der Arbeit einer Besatzung im aktuellen Simulationsschritt (`workingSkills`). Eine Mehrzweckbesatzung bearbeitet Brandbekämpfung und technische Rettung nacheinander. Zusammengehörige Fähigkeiten wie Brandbekämpfung und Löschwasser bleiben gemeinsam wirksam. Die vorhandenen Großlagenabschnitte steuern die Aufgabenverteilung in Großlagen. Ein aktiver Defekt, eine notwendige Nachbereitung oder eine durch Verletzungen nicht mehr ausreichende Besatzung liefert keine Einsatzleistung. Ausdrücklich für den Brand geforderte Wasser- und Schaummittelstärken müssen gedeckt sein, bevor die Brandbekämpfung die Feuergefahr reduziert.

## Persistenz und Bestandsmigration

`Mission.tasks` ist ein optionaler, streng validierter Aufgabenstand mit `version: 1`. Jede Aufgabe enthält stabile ID, Fähigkeit, Bedarf, erbrachte Arbeit, Arbeitsdauer, Erledigungszustand und Abschlusszeit. Der Aufgabenstand wird für aktive dynamische Einsätze additiv angelegt. Bereits erbrachter allgemeiner Fortschritt und aufgelöste Gefahren werden übernommen; es gibt keinen neuen Zufallswurf und keine Veränderung von Einsatzziel, Standort, Seed, Besatzung, Belohnung oder Kontostand. Historische Einsätze ohne aktive Dynamik behalten ihren bisherigen Abschlussweg.

Brandbekämpfung, Rauch- und Gefahrenkontrolle sowie die anschließende tatsächlich mit Kräften bearbeitete Brandnachkontrolle bleiben getrennt. Nachkontrolle benötigt 15 Simulationssekunden geeigneter Arbeit, nachdem Feuer, Rauch- und Hitzegefahren erledigt sind. Zusätzliche nicht bereits durch eine Gefahr abgebildete Nachforderungen erhalten eigene dauerhafte Arbeitsaufgaben. Fertige Aufgaben werden nicht durch Fahrzeugabzug zurückgesetzt. Notwendige medizinische Betreuung, Transportbindung, Organisationsaufgaben und noch offene Großlagenabschnitte werden weiterhin unabhängig geprüft.

Das Feuer erhält optional `extinguishedAt`, `previousIntensity` und `trend`. Nach bestätigtem Erlöschen kann der normale Simulationsschritt es nicht durch fehlende Fahrzeuge erneut entzünden. Auch die nachträgliche Ausrufung einer Großlage setzt den erledigten Feuerzustand nicht zurück. Ein tatsächlich neues Folgeereignis bleibt ein eigener Vorgang. Nach Abschluss sämtlicher fachlicher Aufgaben muss kein zweiter allgemeiner Timer mit gleichzeitig anwesenden Fahrzeugen abgearbeitet werden. Die bestehende Prüfung von Gefahren, Patientenbereitschaft, Organisationsaufgaben, Großlagen und Nachkontrolle bleibt vor dem Abschluss bestehen. Die bisherige einmalige Belohnungs- und Archivlogik bleibt maßgeblich.

Es wird keine Datenbank zurückgesetzt und kein SQL-Datenbestand neu angelegt. Der optionale Aufgabenstand ist Bestandteil des bestehenden versionierten Save-Schemas und wird mit dem regulären Spielstand gespeichert. Bestehende SQLite-Dateien werden weiterhin über den vorhandenen Speichermechanismus geladen und geschrieben.

## Öffentliche Brandrückmeldung

`fireFeedback(m)` projiziert gespeicherte Serverwerte auf einen kleinen, reproduzierbaren Anzeigestand:

- Ausbreitung, stabiler Brand, Rückgang, kontrollierter Brand, gelöscht oder Nachkontrolle;
- aktuelle Intensität und Löschfortschritt;
- zuletzt ermittelter Trend;
- konkrete noch offene Restgefahren und Nachkontrolle;
- Zeitpunkt des zugrunde liegenden Simulationsstands.

Vor Erkundung liefert die Funktion `null`. Die UI kann dort „Erkundung ausstehend“ anzeigen, ohne geheime Brandwerte zu verraten. Die Funktion erzeugt keine Zufallszahlen und berechnet keine eigenständige Client-Simulation.

## Atomarer Rückruf

`assessWithdrawal()` prüft die komplette ausgewählte Gruppe gegen dieselbe Besitzerlage. Der Rückruf ist nur für tatsächliche eigene Einsatzbindungen möglich. Patienten an Bord, offene Transportaufträge, Defekte, Nachbereitung und eine noch nicht erkundete Lage werden ausdrücklich abgefangen. Offene Anforderungen werden gegen die nach Entfernung **aller ausgewählten Fahrzeuge** verbleibenden Kräfte geprüft. Eine bereits vorher bestehende Unterdeckung macht nicht jede überschüssige Einheit unabziehbar; der Rückruf darf die bestehende notwendige Abdeckung jedoch nicht weiter verringern.

Offene Großlagenabschnitte dürfen nicht ihre letzten tatsächlich zugeordneten Kräfte oder die benannte Abschnittsleitung verlieren. Bereits verifizierte Hilfe anderer Leitstellen wird einmal angerechnet. Das reine `assessRemoteWithdrawal()` führt dieselbe fachliche Prüfung im Besitzerauftrag aus, wenn ein berechtigter Helfer seine eigenen auswärtig gebundenen Fahrzeuge zurückrufen möchte. Rechte und tatsächliche Fahrzeugzuordnung werden im Server geprüft, nicht aus Clientbehauptungen übernommen.

Auch das Beenden beziehungsweise Abbrechen eines Unterstützungsauftrags prüft die gesamte dadurch zurückgerufene Gruppe. Ein notwendiger Helfer kann diese Prüfung nicht durch „Unterstützung beendet“ umgehen. Der DB-Integrationstest `tests/aid-withdrawal.test.ts` belegt die Verweigerung beider Wege ohne Teilmutation und die anschließende Freigabe mit tatsächlich eingetroffenen Ersatzkräften.

`withdraw()` erstellt nach der Prüfung eine private Save-Kopie, berechnet dort sämtliche Rückrouten und führt FMS-, Zuordnungs- und Ereignisänderungen aus. Erst wenn alle Rückrufe funktionieren, wird der neue Stand gemeinsam übernommen. Schlägt beispielsweise erst die zweite Rückroute fehl, bleibt auch das erste Fahrzeug unverändert. Die tatsächliche Rückfahrt beginnt über den bestehenden Routingmechanismus am aktuellen Standort. Eine erneute Aktion kann dieselbe gelöste Einsatzbindung nicht nochmals zurückrufen.

Für die Oberfläche baut `createWithdrawalAssessment()` je unverändertem Snapshot einen einzigen Prüfkontext auf. Alle Zeilen und die gemeinsame Auswahl verwenden dieselben daraus abgeleiteten Regeln, ohne Besatzung und Einsatzverlauf pro Zeile erneut zu durchsuchen. Die Liste zeigt 25 Fahrzeuge pro Seite; die gemeinsame Auswahl bleibt über Seiten hinweg erhalten. In einer synthetischen Messung mit 500 Fahrzeugen und 4.494 Einsatzkräften benötigten zuvor schon 25 separat vorbereitete Prüfungen 676 ms. Nach dem Fix dauerte die Vorbereitung 29 ms und die Prüfung sämtlicher 500 Einzelauswahlen weitere 1 ms. Dies ist eine lokale Logikmessung, keine behauptete Browser-Bildrate. Ein zusätzlicher Test prüft, dass die 500 Fähigkeitsberechnungen bei weiteren Einzelauswahlen nicht erneut ausgeführt werden.

## Nachweise und Grenzen

`tests/capability-tasks.test.ts` prüft die drei Löschfahrzeuge in jeweils zwei vollständigen Einsätzen bis zum Archiv, ungeeignete Fahrzeuge, Typwünsche, geheime Spezialanforderungen, echte Löschwasserversorgung, getrennte Crew-Arbeit, Spezialbedarf, Brandtrends, dauerhafte Nachkontrolle, leere abgeschlossene Einsatzstellen, Patientenrestaufgaben, Wiederaufnahme aus JSON-Speicherständen, Zufallsinvarianz, Gruppenabzug, wiederholte beziehungsweise fremde IDs, Patientenbindung, Helferbedarf, offene Abschnitte und einen Fehler erst auf der zweiten Rückroute.

Zusätzlich wurden die vorhandenen dynamischen Abschlussprüfungen und der Katalog-Lebenszyklus mit mehreren hundert tatsächlich bis zum Ende durchgespielten Fällen ausgeführt. Der konkrete finale Gesamtumfang einschließlich Browser- und Servernachweisen steht im übergreifenden Abnahmebericht; dieser Fachbericht ersetzt keine dort nicht ausgeführte Prüfung.

Dies bleibt ein serverseitiges Spielmodell mit Fähigkeits- und Arbeitsstärken. Es behauptet keine reale Löschphysik, keine Liter-genaue Tankmessung und keine reale medizinische Behandlungssimulation. Routen, Bereitschaft, Patientenbindung, Aufgabenfortschritt und die Anzeige entstehen aus tatsächlichen Spielzuständen. Es wurden für diesen Fachbereich keine Produktionsdaten verändert und keine Produktionsbereitstellung ausgeführt.
