# Einsatzbetrieb 2.18

Dieser Stand erweitert die bestehende serverseitige Simulation. Node.js 24, SQLite, Socket.IO, Authentifizierung, Straßenrouting und das Echtzeitspiel bleiben die Grundlage. Die Änderungen benötigen keinen neuen Dienst, Port oder Geodatendownload. Produktion wird vom Betreiber separat aktualisiert.

## Bestandsprüfung und Umfang

Vor der Änderung enthielt der Katalog 41 Vorlagen und 20 Fahrzeugtypen. Normale Erzeugung, Folgelagen und Labor verwendeten eine Obergrenze von zwei offenen Einsätzen; das Save-Schema erlaubte maximal 60 aktive Fälle. Das Archiv war auf 500 Einträge im Save begrenzt. FMS, Rückkehrbereitschaft und feste Personalzuweisung verhinderten eine vollständig nachvollziehbare FF-/RD-Abfolge. Lokale Audiodateien hatten eine 2-MB-/15-Sekunden-Grenze.

Jetzt sind **653 Vorlagen und 50 Fahrzeugtypen** vorhanden. Die 206 Themenpositionen des Auftrags entsprechen nach Zusammenführung zweier Wiederholungen 204 Themen, jeweils mit drei verschiedenen Varianten. Die 41 alten IDs bleiben erhalten. Der [Katalognachweis](EINSATZKATALOG.md) enthält jede Zuordnung, die tatsächlichen Parameter, Fahrzeuge und Grenzen.

## Disposition und parallele Einsätze

Die Zahl aktiver Einsätze hat keine Obergrenze in Generator, Flächenlagen, Labor oder Save-Schema. Erzeugung bleibt zeitgesteuert: Die Grundspanne von 90–210 Sekunden wird durch Tageszeit, Wetter, Gebietsgröße und aktuelle Flächenlage verändert. Fahrzeugfähigkeiten und Fortschritt bestimmen geeignete Vorlagen. Auf der Deutschlandkarte muss außerdem ein passender erreichbarer Ort vorhanden sein. Nach längerem Serverstillstand entsteht kein Stapel nachgeholter normaler Notrufe.

Normale Einsätze erhalten keine automatisch wiederholten identischen Anrufe. Weitere Anrufer großer, weithin sichtbarer Lagen liefern zusätzliche Beobachtungen. Ein abgebrochener, unvollständig aufgenommener Notruf ohne mögliche Rückrufnummer darf erneut gemeldet werden, damit der Einsatz bearbeitbar bleibt. Das ist getrennt von zusätzlichen Großlagenanrufern gespeichert.

Der HUD zeigt 25 Einsätze pro Seite. Anruf- und Sprechwunschlisten zeigen jeweils zehn mit erreichbarer Seitennavigation. Filter und Sortierung wirken auf den vollständigen Bestand. Die sechs Prioritäten **INFO, NORMAL, DRINGEND, HOCH, KRITISCH, NOTFALL** beeinflussen Darstellung, Sortierung und Audio; sie alarmieren nie ungefragt Fahrzeuge. Historisches `PRIORITÄT` bleibt im Save erhalten und wird als HOCH angezeigt.

Benötigte Kräfte erscheinen als Fahrzeugvorschläge mit Anzahl. Geeignete andere Fahrzeuge werden anhand ihrer tatsächlichen Fähigkeiten angerechnet. Der Vorschlag ist kein Zwang zu einem bestimmten Fahrzeugtyp. Die Disposition zeigt Einsatzalter, bekannte Informationen, offene Sprechwünsche, Kräftebedarf, Besatzung und den serverseitigen Grund einer Sperre. Reserven sind Hinweise: Auch das letzte geeignete eigene Fahrzeug darf ausdrücklich ausgewählt werden. Bei fehlender Reserve wird auf die mögliche Nachbaranfrage hingewiesen.

## Freiwillige Feuerwehr und BF

Neu gebaute Feuerwachen beginnen als FF. Verfügbarkeit wird serverseitig aus Tageszeit, Wochen-/Feiertag, Weg, Wetter, Verkehr, bereits gebundenen Kräften und reproduzierbaren personenbezogenen Werten berechnet. Der Spieler stellt keine privaten Dienstpläne ein und sieht keine privaten Tagesabläufe. Rekrutierung, Ausbildung, Wachen und Fahrzeugausstattung bleiben strategisch steuerbar.

Nach Alarmierung fahren geeignete Kräfte mit unterschiedlichen Reaktions- und Straßenfahrzeiten zur Wache. Die Karte zeigt diese anonymen Anreisen. Eintreffen, Einsteigen und Fahrzeugbesatzung sind persistiert. Fahrzeuge fahren erst, wenn die wirkliche Mindestbesatzung anwesend und ausreichend qualifiziert ist. Kleine Fahrzeuge haben andere Mindeststärken als große. Dieselbe Person kann nicht gleichzeitig mehrere Fahrzeuge besetzen. Nach tatsächlicher Rückkehr wird die FF-Besatzung wieder freigegeben.

Ab **Stufe 6** ist für **240.000 Credits** und **180 Sekunden Umbau** der BF-Ausbau möglich. Die Grundkapazität für Fahrzeugplätze und Personal verdoppelt sich. BF nutzen fest zugewiesene, verfügbare und qualifizierte Besatzungen sowie kürzere Ausrückzeiten. FF und BF können parallel bestehen. Historische Feuerwachen ohne gespeichertes Organisationsprofil bleiben BF; bestehende andere Feuerwehrorganisationen werden nicht umgewandelt. Ein kostenloser Wechsel durch Änderung des Profiltyps ist gesperrt.

## Bereitschaft, FMS und Nachbereitung

Der Server unterscheidet `AVAILABLE`, `DISPATCHED`, `EN_ROUTE`, `ON_SCENE`, `RETURNING`, `POST_INCIDENT`, `MAINTENANCE` und `UNAVAILABLE`. FMS bleibt ein getrenntes Meldeprotokoll mit Definitionen und Historie. Eine manuelle FMS-Änderung hebt keine tatsächliche Sperre auf.

- FF kann alarmierbar sein, bevor ihre Kräfte an der Wache sind. Die Anzeige unterscheidet Alarmierbarkeit und Ausrückbereitschaft.
- Rückfahrt bleibt bis zur tatsächlichen Ankunft gesperrt, auch bei FMS 1.
- Rettungsmittel erhalten nach einem Aufenthalt am Einsatzort oder Patiententransport Reinigung und Materialauffüllung, bei transportierten Patienten beziehungsweise Rauch- oder Gefahrstoffgefahren am Einsatzort zusätzlich Desinfektion. Diese Schritte beginnen nach Erreichen der Heimatwache. Eine vorzeitig abgebrochene reine Anfahrt erzeugt keine erfundene Desinfektion.
- Jeder Arbeitsschritt und seine Frist werden gespeichert. Währenddessen gilt FMS 6. Erst nach dem letzten Schritt folgt FMS 2 und erneute Freigabe. Wartung und Fahrzeugdefekte bleiben eigenständige Sperrgründe.
- Verletzte Einsatzkräfte fallen aus der wirksamen Besatzung. Nach tatsächlicher Klinikübergabe folgt eine 15-minütige Genesung im Spiel; verstorbene Personen stehen dauerhaft nicht mehr zur Verfügung. Das sind Spielregeln, keine medizinischen Zeitangaben.

Die API liefert abgeleitete Bereitschaftswerte. Vom Client eingesandte Werte ersetzen keine Simulation; die Datenbank speichert diese Anzeigeableitung nicht als Entscheidungsgrundlage.

## Deutschland: passende Einsatzorte

Die bestehende lokale `maps.mbtiles` liefert OSM-Wasser-, Flächennutzungs-, Wald-/Feld-, Bahn- und POI-Geometrien. Der Straßenindex und der lokale Router bestätigen erreichbare Zufahrten. Neue Profile wählen passende Orte für Wohngebiete, Gewerbe, Industrie, Wald, Felder, Bahn, öffentliche Einrichtungen, Baustellen oder Gewässer. Fehlt ein passender Ort, wird diese Erzeugung ausgelassen; sie fällt nicht auf eine beliebige Straße zurück. Ergebnisse werden räumlich begrenzt abgefragt und zwischengespeichert.

Wassereinsätze liegen an tatsächlichen Uferzugängen auf Land, innerhalb von 60 Metern zu passender Wassergeometrie. Brücken, Tunnel und ungeeignete Straßenanker werden ausgeschlossen. Wasserwachen verwenden dieselbe serverseitige Uferprüfung. Das deutsche **Zugfahrzeug mit Rettungsboot (MZB)** ist eine vollständige Kombination und fährt auf Straßen zum Ufer; Rettung erfolgt am Einsatzort. Es gibt weiterhin keinen befahrbaren offenen Wassergraphen. Die ältere Rivermere-Wasserkarte und ihre gespeicherten Fahrten bleiben erhalten.

Die OSM-Daten beschreiben Kartengeometrien, keine reale amtliche Einsatzfreigabe. Ein passender Straßenanschluss bestätigt keine Zufahrtserlaubnis für echte Rettungsfahrzeuge. Das vorhandene Deutschlandpaket besitzt die benötigten Detailkacheln auf Zoomstufe 14; synthetische Testpakete müssen diese Metadaten entsprechend ausweisen.

## Dynamik, Bewertung und vollständiges Archiv

Profile speichern Ausgangslage, Patienten, Gefahren, Brandmerkmale und Folgeereignisse. Wetter, Jahreszeit, Verkehr und Tageszeit verändern Ziehung, Anfahrt, FF-Verfügbarkeit und Verlauf. Die vorhandenen MANV-, Abschnitts-, Flächenlagen- und Nachbarhilfemechanismen bearbeiten die erweiterten Situationen. Neue Fahrzeugfähigkeiten wie Messung, Dekontamination, Schaum, Intensivversorgung und Betreuung werden in tatsächlichen Anforderungen und Maßnahmen verwendet. Abrollbehälter werden ausdrücklich als vollständige WLF-Kombinationen gekauft.

Ereignisse wie `MISSION_CREATED`, `ALARM_CREATED`, `VEHICLE_DISPATCHED`, `VEHICLE_DEPARTED`, `VEHICLE_ARRIVED`, `FMS_CHANGED`, `SPEAK_REQUESTED`, `HAZARD_CREATED`, `HAZARD_ESCALATED`, `HAZARD_RESOLVED`, `PATIENT_CREATED`, `PATIENT_DETERIORATION` und `PATIENT_DEAD` entstehen bei den jeweiligen Übergängen. Wiederholte Ticks erzeugen nicht dieselbe Übergangsmeldung erneut.

Berichte enthalten vorhandene Dispositions-/Ausrücke-/Fahrtzeiten, Lageänderungen, Patientenergebnisse, Nachforderungen und gebundene Fahrzeuge. Der Qualitätsfaktor liegt zwischen 0,75 und 1 und wirkt auf Credits/XP. Er bewertet unter anderem Verzögerungen relativ zur tatsächlichen Fahrtplanung und Patientenergebnisse. Eine große Ausgangslage, fachlich notwendige Nachforderungen oder eine taktische Reserve werden nicht pauschal bestraft. Eskalationen geben keinen zusätzlichen Vergütungsbonus. Alte Berichte ohne ausreichende Messwerte erhalten keine erfundene Note.

**Schema 13** führt `mission_history` ein, getrennt nach Leitstellenbesitzer und gespeichertem Modus. Jede vorhandene Archivmission wird vor Verkleinerung des laufenden Snapshots dauerhaft gespeichert. Der Snapshot hält die letzten 100 Berichte und zusätzliche Fälle mit noch laufender Fahrzeugnachbereitung oder Kampagnenbezug. Das ist keine Begrenzung der Historie. Späte Nachbereitungsereignisse werden weiter gespeichert. Das Archiv lädt 25 Fälle je Seite; Text, Organisation und Großlage sind serverseitig filterbar. Details, JSON/CSV und Druck bleiben nutzbar. Der ausdrücklich vollständige Spielstandexport und der Altarchivexport enthalten sämtliche gespeicherten Berichte, nicht nur das Snapshotfenster.

Mitgliedschaften derselben Leitstelle berechtigen zur gemeinsamen Arbeit und Historie. Andere Leitstellen erhalten keinen automatischen Zugriff. Annahme und Entzug von Mitgliedschaften werden auch bei Archivabfragen geprüft. Normale Exportansichten entfernen private FF-Daten und verborgene Szenariodaten; eine vollständige SQLite-Sicherung für den Betreiber bleibt davon unabhängig.

## Audio und Entwicklerlabor

Die [lokale Audioverwaltung](AUDIO.md) unterstützt WAV, MP3 und OGG ohne feste Größen-/Dauergrenze. Die tatsächliche Browserquota und unterstützte Codecs begrenzen die Speicherung. Lange Aufnahmen werden als Blob gestreamt. Hinzufügen, Testen, Zuordnen, Aktivieren/Deaktivieren, Ersetzen und Löschen bleiben lokal. Prioritäts- und Notfalltöne sind geschützt und getrennt. Die lokale IndexedDB migriert von Version 1 auf 2; vorhandene Aufnahmen bleiben erhalten.

Das CLI-Labor bleibt ausschließlich für Entwicklung und offline erzeugte Prüfwelten. Gemeinsame Zeitfortschritte und Nachbarhilfe verwenden den wirklichen Serverkoordinator in einer flüchtigen SQLite-Datenbank im Speicher. Es gibt keine HTTP-Debugaktion und keine Verbindung zu Produktionskonten oder Produktionsdaten.

Zusätzlich zu den bisherigen Laboraktionen sind `volunteers` (Verfügbarkeit und Dauer), `new-patient`, `major`, `neighbor` und `neighbor-response` vorhanden. Nachbarangebote durchlaufen Entwurf, Versand und tatsächliche Annahme beziehungsweise Ablehnung. `verify` wiederholt die Aktionen einschließlich Nachbarwelten und vergleicht Zustandsprüfsummen. Die Wiederholung gilt für dieselbe Software- und Datenversion. Aktionsschema und konkrete Beispiele stehen in `server/lab.ts` und `tests/laboratory-expansion.test.ts`.

## Update und Bestandsschutz

Vor Update den Server stoppen und eine konsistente Sicherung anlegen. Dann `main` aktualisieren, den bestehenden Setup-/Build-Befehl ausführen und starten. Die automatische Migration sichert zuerst die alte Datenbank und erhält Konten, Guthaben, Fortschritt, Wachen, Fahrzeuge, Personal sowie laufende Vorgänge. Nicht vorhandene historische Detailberichte können nicht rekonstruiert werden. Alte BF-Profile und der historische Modus bleiben erhalten. `.env`, `.env.germany`, Daten- und Geodatenordner weiterverwenden.

Ein Rückwechsel auf ältere Software benötigt die dazugehörige Datenbanksicherung. Alte Software darf Schema 13 nicht öffnen. GitHub-Prüfungen installieren nichts auf AMP. Die tatsächlichen Testläufe, Messwerte und verbleibenden Betriebsgrenzen stehen im [Prüfbericht](EINSATZBETRIEB-TESTBERICHT.md).
