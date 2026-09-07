# Phase 2 – Dynamik (Version 2.8.0)

Phase 2 erweitert den vorhandenen Leitstellenablauf um acht verbundene Systeme. Neue, vom Server erzeugte Notrufe erhalten einen persistenten dynamischen Einsatz. Die Karte, feste Echtzeit, AAO, freie Disposition, FMS, Funk, Konten und getrennten Spielstände bleiben erhalten. Phase 3 bis 5 bleiben Roadmap.

## Bedienung

Unter der Karte stehen **simuliertes Regionalwetter, Sichtweite, Verkehrslage und Straßenmeldungen**. Straßenereignisse sind bei eingeschalteten Routen auch auf der Karte markiert. Angaben beziehen sich auf die fiktive Spielregion, nicht auf einen realen Wetterdienst. Die Tageszeitberechnung verwendet UTC der Simulationszeit.

Beim Alarmieren lässt sich **Normalfahrt, Sonderrechte oder Notfallfahrt** wählen. Die Anfahrtsvorschau und serverseitige Fahrt berücksichtigen Strecke, Verkehr und Wetter. AAO-Vorschläge verwenden ebenfalls die aktuelle Fahrzeit. Fahrzeuge zeigen Sollroute, Reststrecke, Mehrzeit und den letzten Störungsgrund. Bei einer Vollsperrung wird eine andere Verbindung gesucht. Gibt es keine, wartet das Fahrzeug an seiner tatsächlichen Position auf Freigabe. Es fährt nicht durch die Sperrung. Bei sehr starkem Wind warten neu disponierte Luftfahrzeuge auf eine neue Wetterperiode.

Nach Aufnahme der ersten Lagemeldung erscheint **Dynamische Lage** im Einsatzdialog:

- Gefahrenwerte, Alarmstufe und Zustand zeigen, ob die Lage wächst, kritisch ist, stabilisiert wird oder die Nachkontrolle läuft.
- **Regelvorgehen**, **Defensiv / Sicherheitsabstand** und **Menschenrettung priorisieren** verändern Gefahrenabbau, Arbeitsgeschwindigkeit beziehungsweise Patientenversorgung. Defensives Vorgehen verringert unter anderem Rauch-/Einsturzrisiken, kostet aber Zeit. Es ermöglicht auch vorläufige Absicherung von Gasgefahren.
- Die Brandansicht zeigt Brennstoff, Fläche, Temperatur, Rauch, Intensität, Ausbreitung, Explosionsrisiko, Löschfortschritt sowie betroffene und angrenzende Bereiche. Ein schneller Erstangriff kann die Ausbreitung verhindern; unbeachtete Brände können überspringen.
- Kritische Entwicklungen erzeugen priorisierte Sprechwünsche und aktualisieren den tatsächlich benötigten Kräftebedarf. Weitere Fahrzeuge werden wie in Phase 1 bewusst disponiert. Bei beherrschter Gefahr sinkt der zusätzliche Bedarf wieder.
- Patienten besitzen eigene Befunde, Zustände, Versorgung, Prognose und Verlauf. Die vorhandenen Kräfte versorgen sie automatisch. Versorgungsschwerpunkt und Priorisierung sind echte Aufträge: ohne geeignetes Fahrzeug entsteht keine Behandlung. Ein stabilisierter Patient lässt Versorgungskapazität für weitere Betroffene frei.
- Verschlechterung kann Notarztbedarf und Reanimation auslösen. Reanimationszyklen können zu ROSC oder zum dokumentierten Tod führen. Werte und Maßnahmen sind abstrahierte Spielmechanik, keine medizinische Anleitung.
- Transportfähige Patienten werden mit den vorhandenen Transportfahrzeugen und Krankenhauskapazitäten übernommen. Einzelne Patienten bleiben Fahrzeug und Übergabe zugeordnet. Ein Fahrzeugdefekt während des Transports verliert weder Patient noch Auftrag.

Ein **Fahrzeugdefekt** erscheint als FMS 6 im Wetter-/Betriebsbereich. Das Fahrzeug bleibt an seiner tatsächlichen Position, liefert keine Einsatzfähigkeiten und fordert Ersatz an. **Reparatur beauftragen** startet den mobilen Dienst: Motorschaden 180 Sekunden, andere Störungen 120 Sekunden. Nach der Reparatur setzt es den Auftrag fort oder fährt zurück, wenn der Einsatz inzwischen beendet wurde. Während der Reparatur bleiben die Besatzung und gegebenenfalls die Patienten gebunden. Es gibt keinen sofortigen kostenlosen Statuswechsel zurück in die Verfügbarkeit; der Dienst selbst benötigt keine Credits.

Im **Einsatzarchiv** bleiben die letzte dynamische Lage, Patientenverläufe und die bestätigte Ereignishistorie abrufbar.

## Dynamik und Grenzen

Die Gefahrenprofile bilden Feuer, Rauch, Hitze, Einsturz, Elektrizität, Gas, Gefahrstoffe, Wasser, Verkehr, Gewalt, Menschenmengen, Witterung, Sicht, Dunkelheit und technische Gefahren ab. Welche davon entstehen, folgt dem vorhandenen Einsatztyp, dessen Fähigkeiten und der Umgebung. Gefahren besitzen Startwert, Wachstum, Reduktion, Schwelle und benötigte Fähigkeiten. Vor Ort befindliche, funktionsfähige Fahrzeuge wirken darauf; eine bloße Alarmierung reicht nicht.

Die Brandmodelle verwenden Datenprofile für 16 Brennstoffe und mehrere Bereiche je Einsatz. Das ist eine abstrahierte Simulation der vorhandenen Einsatztypen, keine physikalische Gebäudeberechnung und keine Umsetzung jedes Falls des gesamten Masterkatalogs. Spezialorganisationen, detaillierte individuelle Personalzustände und die vollständige MANV-/Katastrophensimulation folgen in Phase 3/4.

Die Wetterauswahl umfasst Sonne, Wolken, Regen, Starkregen, Gewitter, Sturm, seltenen Orkan, Nebel, Schnee, Glatteis, Hitze und Frost. Jahreszeit und Tageszeit beeinflussen die Auswahl beziehungsweise Verkehrsdichte. Wetter verändert auch die Gewichtung passender neuer Einsatztypen, **nicht die Obergrenze oder Taktung der Notrufe**. Sturm wird in Phase 2 noch nicht zu einer Katastrophenwelle.

Die Koeffizienten und Grenzen stehen in `src/simulation/random.ts`; Brennstoffe und Gefahrenprofile in `fire.ts` und `hazards.ts`:

- Dynamik in persistenten Fünf-Sekunden-Schritten; keine browserabhängigen Zufallsentscheidungen.
- Erste mögliche Eskalation frühestens 300 Sekunden nach Erstellung und erst bei überschrittener Gefahrenschwelle. Danach mindestens 90 Sekunden Abstand.
- Maximal sechs Eskalations-/Sekundärereignisse und Alarmstufe 4 pro Fall. Ein Brandübersprung hat bei erfüllter Bedingung eine Wahrscheinlichkeit von 28 %, ein Teileinsturz 4 %, ein Folgeauftrag 15 %.
- Höchstens ein eigenständiger Folgeauftrag je Ursprung, keine weiteren Enkelketten. Frühestens nach 120 Sekunden und nur bei freiem Platz und abgelaufenem Meldeabstand. Verknüpfte Vorgänge bleiben in der eigenen Leitstelle.
- Weiterhin höchstens zwei aktive Einsätze und die vorhandenen versetzten Meldeabstände. Neustarts erzeugen keinen Nachholstapel an Anrufen.
- Seltene Defektprüfung (0,2 % je Minute) für Fahrzeuge in neuen dynamischen Einsatzaufträgen; sechs Defektarten. Frühere laufende Einsätze bekommen keine nachträglichen zufälligen Defekte.
- Verkehrsereignisse, Umleitungen und Wetteranpassungen werden begrenzt geprüft; keine Neuberechnung jeder Route in jedem Browserframe.
- Die bisherigen Archiv- und FMS-Historiengrenzen bleiben bestehen. Patientenverläufe halten bis zu 100 Einträge pro Patient vor.

## Architektur und Datenschutz

`dynamics.ts` orchestriert getrennte Module für Gefahren, Brand, Patienten, Wetter, Verkehr und Defekte. Die bestehende Engine bleibt für Bewegung, Arbeit, Transporte und Abschluss verantwortlich. `requirements()` ergänzt den Grundbedarf um aktuelle Gefahren und kritische Patienten. Ein Einsatz endet erst nach erfülltem Arbeitsbedarf, beherrschter Gefahr, Nachkontrolle und erfolgten erforderlichen Transporten.

Zufallsziehungen verwenden Seed, Kanal und fortgeschriebene Ereignisnummern beziehungsweise Zeitfenster. Die dynamischen Zustände, nächsten Termine, Fahrtstörungen, Reparaturaufträge, Patienten und Eltern-/Folgebeziehungen liegen im vorhandenen SQLite-Spielstand. Gleicher Zustand mit denselben Zeiten und Aktionen erzeugt denselben Verlauf. Wetter ist innerhalb derselben Zeitperiode regional gleich.

Interne Patienten-/Gefahrenzustände werden erst nach Erkundung veröffentlicht; Zufallsparameter und noch nicht ausgelöste Folgepläne bleiben auch dann aus regulärem HTTP, Socket und Kontoexport entfernt. Der bestehende Konto-/Leitstellenzugriff sowie Aktionsbelege und Transaktionen gelten auch für Taktik, Patientenversorgung und Reparatur. Unterschiedliche Leitstellen bekommen keine automatische Freigabe. Autorisierte Disponenten derselben Leitstelle bearbeiten denselben Zustand.

## Migration auf SQLite-Schema 7 und Betrieb

Vor der Migration legt der Server wie bisher eine konsistente `pre-migration-v2-*.sqlite` an. Der historische Dateipräfix bleibt wegen der vorhandenen Betriebswerkzeuge erhalten.

Migration 7 ergänzt Wetter und inaktive Dynamikmetadaten für bestehende aktive und archivierte Einsätze **beider Modi**. Deren Geld, Besitz, IDs, Fortschritt, Notrufe, Fahrwege, Termine und laufende alte Unterstützung bleiben erhalten. Altfälle werden nicht nachträglich eskaliert; die neue Dynamik beginnt mit neuen serverseitigen Einsätzen. Bereits laufende Fahrten erhalten durch die Migration keine geänderte Ankunftszeit.

Vollständige SQLite-Sicherung und CLI-Wiederherstellung erhalten die neuen Daten. Der separat bestätigte Offline-Altimport übernimmt weiterhin ausschließlich Bestand; dazu entfernt er auch alte Defekt-/Fahrtdaten, nachdem aktive Vorgänge entsprechend dem bestehenden Importvertrag verworfen wurden. Ein Kontoexport ist eine freigegebene Ansicht und kein Ersatz für die vollständige Datenbanksicherung.

Keine neue `.env`-Option erforderlich. AMP stoppen → sichern → `main` aktualisieren → vorhandenes Setup/Build erfolgreich abwarten → starten. Keinen älteren Server gegen Schema 7 starten; ein Rollback braucht passende alte Software und passende Sicherung. Es erfolgt keine automatische Produktionsbereitstellung.

## Prüfungen

`tests/phase-two.test.ts` ergänzt System-, Integrations-, Berechtigungs-, Migrations- und Wiederholungstests. `tests/e2e/phase-two.spec.ts` prüft den vollständigen dynamischen Brandablauf einschließlich Panne/Reparatur/Neustart sowie mobile Patientenversorgung bis zur Krankenhausübergabe. Die bestehenden Tests für Phase 1, Konten, Modi, Funk, Audio, Routing, Wiederverbindung und CLI-Restore laufen weiter.

Konkrete ausgeführte Ergebnisse: [Phase-2-Testbericht](PHASE-2-TESTBERICHT.md). Für Linux-Autostart, vollständige Prozessprüfung und beide Browser ist der CI-Lauf am tatsächlichen PR-Kopf maßgeblich.
