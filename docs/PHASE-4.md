# Phase 4 – Große Lagen, Version 2.10.0

Die vorhandene Echtzeitsimulation, Karte, Notrufbearbeitung, AAO, FMS, dynamischen Gefahren, Personalregeln, Kliniken und ausdrücklich angenommene Nachbarhilfe werden erweitert. Beide Spielmodi bleiben getrennt. Es gibt keine zusätzlichen kostenlosen Fahrzeuge und keine automatische Unterstützung unabhängiger Leitstellen.

## Entstehung und ruhiger Grundrhythmus

Neue geeignete Einsätze können sehr selten zur Großlage werden: deterministische Wahrscheinlichkeit 0,4 % pro geeignetem neu erzeugtem Einsatz, mindestens acht vorhandene Fahrzeuge einschließlich Führungskomponente, keine aktive Flächenlage und mindestens zwei Stunden seit der letzten Ausrufung. Wettergewichtung und die vorhandenen Einsatzvoraussetzungen gelten weiterhin. Diese Wahrscheinlichkeit ist eine Spielregel, keine reale Ereignisstatistik.

Alternativ erscheint nach der ersten aufgenommenen Lagemeldung bei geeigneten aktiven Grundereignissen die Aktion **MANV / Großbrand / Unwetterlage / Hochwasser / Massenereignis ausrufen**. Sie verändert den laufenden Einsatz verbindlich: zusätzliche Abschnittsarbeit, mögliche weitere Patienten und gegebenenfalls eine Flächenlage. Bereits laufende Transporte werden nicht nachträglich in eine neue Großlage umgewandelt. Historische Einsätze ohne dynamische Simulation erhalten keine neuen Pflichten.

Grundlagen aus dem bestehenden Katalog:

- MANV: Verkehrsunfall, Busunfall, Gebäudeeinsturz und Bahnhofsereignis.
- Großbrand: Flächen-, Wohnungs-, Dach-, Industrie-, Silo- und Lagerhallenbrand.
- Unwetter: Baum, Trümmer und Notversorgung nach Stromausfall.
- Hochwasser: Keller, Unterführung und Deichsicherung.
- Massenereignis: vorhandene Lagen mit Menschenmengen, etwa Stadtfest, Sportveranstaltung und Versammlung.

Vor der Erkundung bleiben verborgene Großlagenmerkmale, künftige Patientenwellen und interne Planung aus den regulären HTTP-, Export- und Socket-Ansichten entfernt.

## Führung, Bereitstellung und Einsatzabschnitte

Nach Ausrufung sammeln alle gebundenen Kräfte logisch im **Bereitstellungsraum** am Einsatzort. Anfahrt, FMS und tatsächlicher Fahrzeugbesitz bleiben unverändert. Der Raum ist eine operative Zuordnung am vorhandenen Einsatzort, kein zusätzlicher frei platzierbarer Kartenbauplatz.

1. Mit AAO, freier Disposition oder ausdrücklicher Nachbarhilfe echte Fahrzeuge alarmieren.
2. Passende **Einsatzabschnitte beauftragen** und Priorität 1–3 einstellen.
3. Fahrzeuge aus Bereitstellung einem geeigneten Abschnitt zuweisen. Die Zuweisung kann schon während Alarmierung oder Anfahrt erfolgen; Arbeit beginnt erst nach tatsächlicher Ankunft.
4. Ein geeignetes Führungsfahrzeug der **Einsatzleitung** zuweisen. Ohne anwesende funktionsfähige Einsatzleitung schreitet kein Abschnittsauftrag voran.
5. Optional eine konkrete **Abschnittsleitung** benennen. Zulässig sind zugehörige Abschnittskräfte oder Fahrzeuge der zentralen Einsatzleitung. Fällt das benannte Fahrzeug aus, verlässt den Abschnitt oder erhält einen anderen Einsatzauftrag, pausiert der betreffende Abschnittsauftrag bis zur bewussten Neubesetzung. Ohne gesonderte Benennung führt die zentrale Einsatzleitung.

Ein Fahrzeug ist immer genau einem Abschnitt zugeordnet. Nur die dort passenden Fähigkeiten wirken: Ein HLF im Abschnitt Wasserversorgung zählt dort mit Wasser, aber nicht gleichzeitig mit Brandbekämpfung und Menschenrettung. In Bereitstellung wirkt es nicht an Gefahren oder Versorgung mit. Die Verbindung zur konkreten Alarmierung verhindert, dass eine alte Zuweisung bei späterem Wiedereinsatz automatisch weitergilt.

Abschnittsaufträge besitzen Fortschritt und benötigen tatsächlich geeignete Kräfte. Priorität beeinflusst den Fortschritt des Erstauftrags. Auch nach abgeschlossenem Aufbau bleiben zugewiesene Kräfte für laufende Gefahren wirksam. Rücknahme in Bereitstellung entzieht ihre Fähigkeiten wieder. Benötigte Erstaufträge, Nacherkundung und Evakuierung verhindern einen vorzeitigen Einsatzabschluss.

Die **Dispositionspriorität** eines gesamten Einsatzes ist separat einstellbar. Die Einsatzliste sortiert nach Dringlichkeit und anschließend Meldezeit; eine tatsächliche spätere Eskalation kann die Priorität wieder erhöhen. Der Spieler entscheidet weiter selbst, welcher Einsatz welche verfügbaren Kräfte bekommt.

## MANV und Klinikverteilung

Ein MANV beginnt mit mindestens fünf individuellen Patienten. Zwei Nacherkundungen können nach jeweils vier Minuten weitere je drei Patienten feststellen. Massenereignisse beginnen mit mindestens drei Patienten und können zweimal je zwei weitere feststellen. Maximal 30 individuelle Patienten pro Einsatz verhindern unbegrenztes Wachstum. Neue Befunde erscheinen im Verlauf und bei vorhandenen Kräften als dringliche Nachforderung. MANV-Stufen 1–3 sind ein Spielprofil.

**Behandlung / Transport** beauftragen und geeignete Kräfte zuweisen. Die polizeiliche Sicherung aus Phase 3 bleibt Voraussetzung, wenn sie für das Grundereignis nötig ist. Danach jeden Patienten mit **Sichtung und Ziel bestätigen** einer Kategorie I, II oder III zuordnen. Der vorgeschlagene Wert wird erst durch die Bestätigung verbindlich. Sichtung erfordert medizinische Kräfte im Abschnitt; sie ersetzt keine tatsächliche Versorgung.

Nach Aufbau des Behandlungsabschnitts können **priorisierte Transporte freigegeben** werden. Gesichtet, mindestens Gesundheitswert 55 und Behandlungsfortschritt 80: Der Patient kann ein passendes freies Rettungsmittel im Behandlungsabschnitt nutzen. Kategorien I, II und III, anschließend zusätzliche Dringlichkeit und Zustand bestimmen die Reihenfolge. Die Klinikzuteilung prüft Fachrichtung, Aufnahmezustand, belegte und bereits zugesagte Betten sowie Fahrweg. Pro Patient kann ein eigenes Ziel gewünscht werden; ungeeignete Ziele führen zur geeigneten Alternative. Die eigene Aufnahmeübersicht zeigt freie, belegte und zugesagte Plätze.

Transporte beginnen bereits während anderer Abschnittsarbeit oder offener Nacherkundung. Nach Übergabe kehren Fahrzeuge tatsächlich zurück und können erneut alarmiert und zugewiesen werden. **Neue Transporte anhalten** hält nur weitere Abfahrten an, keine bereits laufende Fahrt. Bei ausdrücklich zugesagten fremden Rettungsmitteln gelten deren Heimatkliniken; die Einsatzleitung übernimmt keine Kontrolle über fremde Krankenhausbestände. Patient, Fahrt, Übergabe und Belohnung bleiben genau einmal verbucht.

## Großbrand und Ressourcenknappheit

Mehrere Brandbereiche und ein größerer Brandumfang nutzen die vorhandene Gefahren-/Brandentwicklung. Der Abschnitt Wasserversorgung speist einen begrenzten Löschwasserpuffer von anfangs 5.000, höchstens 20.000 Litern. Verbrauch entsteht durch tatsächlich aktive Brandbekämpfung; Wasserversorgungs- und Pumpfähigkeiten liefern Nachschub. Bei unzureichendem Vorrat sinkt die Löschleistung auf 15 %, und der Handlungsbedarf benennt den fehlenden Nachschub. Das sind nachvollziehbare Spielkoeffizienten, kein physikalisches Hydranten- oder Schlauchleitungsmodell.

Die vorhandenen Personal-, Defekt-, Wach- und Fahrzeugreserven gelten weiterhin. Abschnittszuweisungen umgehen keine fehlende Besatzung und erzeugen keine Fahrzeuge. Die Großlagenübersicht nennt disponierbare, gebundene und als Reserve gesperrte eigene Fahrzeuge. Nachbarkräfte müssen weiter gezielt angefragt und ausdrücklich zugesagt werden; ihre Abschnittszuordnung darf nur die berechtigte Einsatzleitung bearbeiten.

## Unwetter, Hochwasser und Katastrophenschutz

Die erste entsprechende Großlage begründet eine Flächenlage aus dem Ausgangseinsatz und höchstens vier weiteren Meldungen. Zwischen neuen Meldungen liegen 240–360 Sekunden. Pro Simulationsdurchlauf entsteht höchstens ein neuer Notruf, niemals eine sofortige Nachholwelle. **Höchstens zwei eigene Einsätze gleichzeitig** bleiben verbindlich. Während einer Flächenlage pausiert die gewöhnliche Neugenerierung, damit sie die freien Plätze nicht belegt. Bei längerem Serverstillstand wird keine Warteschlange auf einmal abgearbeitet.

Die Folgeeinsätze nutzen den normalen vollständigen Notruf-/Erkundungs-/Dispositionsablauf und bleiben in derselben Leitstelle. Baum, Notversorgung, Keller, Trümmer oder Verkehrsunfall liegen in der Umgebung des Ausgangsereignisses. Sie verlangen reale, anderweitig noch verfügbare Kräfte. Technische Hilfe, Notstrom/Versorgung und **Evakuierung / Betreuung** müssen in den passenden Abschnitten umgesetzt werden. Bei den entsprechenden Großlagen werden 24 betroffene Personen als betreute Evakuierungsgruppe geführt; Fortschritt benötigt aktive geeignete Kräfte und Führung.

Aktive Wasser-, Wetter-, technische, elektrische oder Verkehrsgefahren zugehöriger Einsätze sperren tatsächlich einen nahen Straßenabschnitt. Die vorhandene Routen-/Umleitungslogik verarbeitet diese Sperre. Sie bleibt über einen Wetterperiodenwechsel bestehen und entfällt nach Beseitigung der zugehörigen Gefahr. Es gibt keine neue flächige Wasserstandsberechnung, zerstörbare Stadtgeometrie oder persönliche Bewohner-KI.

Sind alle fünf zugehörigen Einsätze abgeschlossen, wandert die Flächenlage mit Einsatzanzahl und Dauer in die Übersicht abgeschlossener Flächenlagen. Die einzelnen vollständigen Einsatzverläufe bleiben im bestehenden Archiv.

## Speicherung und Betrieb

**SQLite-Schema 9** ergänzt `Save.operations`, optionale `Mission.major` sowie optionale Sichtungs-/Zielangaben an Patienten. Die Daten liegen weiterhin in den vorhandenen transaktionalen Spielständen. Vor der Migration entsteht die bestehende konsistente `pre-migration-v2-*.sqlite`-Sicherung; der historische Dateipräfix bleibt kompatibel. Beide Modi werden validiert und übernommen. Alte Bestände, Besitz, Guthaben, Anfahrten und Alarmierungstermine bleiben erhalten. Bereits vorhandene Einsätze werden nicht automatisch hochgestuft.

Zufall, Zeit, Aufgabenfortschritt, Abschnittsbindung und zukünftige Wellen bleiben serverseitig und werden gespeichert. Gleicher Zustand und gleiche Aktionen ergeben dieselbe Fortsetzung. Neue Aktionen nutzen die vorhandenen strikten Schemata, Besitz-/Mitgliedschaftsprüfung, Origin-/CSRF-Prüfung und persistenten Aktions-IDs. Ein Import übernimmt entsprechend dem bisherigen Importvertrag keine aktiven Einsätze, fremden Verbundbindungen oder Flächenlagen in eine andere Identität. Eine vollständige Sicherung/Wiederherstellung erhält dagegen laufende Lagen.

Keine neuen Abhängigkeiten, Dienste, Ports oder Umgebungsvariablen. Reguläres AMP-Update: stoppen, sichern, `main` aktualisieren, Setup erfolgreich abschließen, starten. Ein älterer Programmstand darf nicht gegen Schema 9 gestartet werden. Es wird kein privater Produktionsserver automatisch aktualisiert.

Phase 5 bleibt für Audio-/UI-Feinschliff, weitergehende Statistik, Berichte, Replay, Debugwerkzeuge und Balancing vorgesehen. Der vorhandene Katalog mit 20 Fahrzeugtypen und 40 Grundereignissen wird weiterverwendet; zusätzliche Großlagen entstehen als Varianten und zusammenhängende Abläufe.

[Prüfbericht](PHASE-4-TESTBERICHT.md) · [Phase 3 und Nachbarhilfe](PHASE-3.md) · [AMP](AMP.md)
