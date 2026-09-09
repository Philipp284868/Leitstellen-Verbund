# Phase 5 – Polishing, Version 2.11.0

**Historischer Phasenbericht:** Seit Version 2.18 gelten ein erweitertes [Einsatz- und Bereitschaftssystem](EINSATZBETRIEB-2.18.md), keine Obergrenze aktiver Einsätze, 653 Vorlagen und die vollständige SQLite-Historie mit Schema 13. Angaben dieses historischen Berichts zu zwei Einsätzen, 500 Archivfällen und Schema 10 beschreiben den früheren Stand. Das Labor verwendet für koordinierte Nachbarhilfe inzwischen eine ausschließlich im Speicher angelegte SQLite-Datenbank; es öffnet keine Produktionsdatenbank.

Die Module 29–35 erweitern das vorhandene Spiel. Node.js 24, SQLite, Socket.IO, die große Karte, echte Fahrwege, serverseitige Entscheidungen und getrennte Spielstände bleiben die Grundlage. Unabhängige Leitstellen erhalten weiterhin nur ausdrücklich vereinbarte Nachbarhilfe.

## Musik, Signale und eigene Dateien

Unter **Einstellungen → Signalregler und eigene Soundprofile** gibt es eine Gesamtlautstärke und getrennte Regler für Melder, Sirene, Funk, Telefon, Wachgong und Ereignisse. Musik und Effekte behalten ihre vorhandenen eigenen Regler. Die Profile **Standard**, **Ruhige Nachtschicht** und **Funk im Vordergrund** stellen diese Regler gemeinsam ein; anschließend lässt sich jeder Wert einzeln verändern.

Die Audioverwaltung wurde inzwischen erweitert: WAV-, MP3- und OGG-Dateien verwenden die tatsächliche Browserquota ohne feste 2-MB-/15-Sekunden-Grenze. Eigene Dateien lassen sich lokal zuweisen, aktivieren, deaktivieren, ersetzen und löschen. Sprechwunsch und Priorität haben eigene Regler; Notfall und Priorität behalten unterschiedliche Originaltöne. Die aktuelle Bedienung und technische Umsetzung stehen in [Musik und lokale Audiodateien](AUDIO.md).

Dateien liegen ausschließlich in IndexedDB dieses Browsers. Es gibt keine Upload-API, externe Audio-URL oder Dateiabfrage durch den Spielserver. Regler und Layout liegen in localStorage, der Wiederverbindungsmerker in sessionStorage. Browserdaten löschen entfernt diese lokalen Einstellungen und Signale, nicht den serverseitigen Spielstand. Nur Dateien verwenden, für die die nötigen Nutzungsrechte vorliegen.

Neue dringende Sprechwünsche mit Priorität NOTFALL oder PRIORITÄT erhalten einen eigenen Originalton mit Vorrang vor gewöhnlichen Meldungen. Dieser Ton wird nicht durch einen eigenen Funkclip ersetzt. Stummschaltung, ausgeschaltete Effekte und auf null gestellte Regler gelten trotzdem. Die vorhandene Musik, Pegelbegrenzung, Absenkung der Musik bei Meldungen und Abstimmung zwischen mehreren Tabs bleiben erhalten. Hintergrundtabs und minimierte Fenster pausieren Audio; bei Wiederverbindung wird kein alter Meldungsstapel abgespielt. Alle Aktionen funktionieren auch ohne Ton.

## Anpassbarer Arbeitsplatz

**Einstellungen → Arbeitsplatzlayout und Tastatur** verändert die Position und Breite der Einsatzspalte, kompakte Einsatzkarten, die Reihenfolge von Notrufübersicht und Einsatzliste sowie Wachen oberhalb oder unterhalb der Karte. Auf kleinen Geräten bleiben die vorhandenen Tabs für Karte und Einsätze erhalten. Bei wenig Höhe bleiben Karte und Zusatzinformationen scrollbar, statt die Kartenfläche auf null zu verkleinern. Das ist eine Konfiguration der vorhandenen Bereiche, kein frei schwebendes Fenster- oder Mehrmonitor-System.

**Suchen, filtern und sortieren** durchsucht ausschließlich den freigegebenen Spielstand: Einsatzkennung, bekanntes Meldebild, bestätigte Ortsangaben, Fakten, eigene zugeordnete Fahrzeuge und bekannte Patientenkennungen. Filter: Organisation, kritisch, Großlage/MANV, offene Sprechwünsche und von mir angenommene Anrufe. Sortierung: Priorität, Alter, Entfernung zur ersten Wache, Eskalation und bekannte Patientenzahl. Noch unbekannte Orte werden bei der Entfernung nach hinten gestellt.

| Standardtaste | Funktion                                              |
| ------------- | ----------------------------------------------------- |
| N             | Nächsten wartenden Notruf öffnen                      |
| F             | FMS öffnen                                            |
| A             | Disposition des ausgewählten/offenen Einsatzes öffnen |
| V             | Fuhrpark öffnen                                       |
| E             | Alle Einsätze anzeigen                                |
| P / R         | Polizei- / Rettungsdiensteinsätze filtern             |
| H             | Archiv und Statistik öffnen                           |

Die Tasten sind einzeln umbelegbar oder deaktivierbar. Doppelbelegungen werden entfernt. Eingabefelder, gedrückte Strg-/Alt-/Cmd-Tasten und automatische Tastenwiederholung lösen keine Kurzbefehle aus. Ein Kurzbefehl alarmiert nie unmittelbar Fahrzeuge.

Nach einer unterbrochenen Verbindung zeigt eine schließbare Zusammenfassung neu aufgezeichnete Ereignisse, Notrufe, Abschlüsse und Sprechwünsche seit dem letzten Stand dieses Tabs. Der Merker ist nach Konto, Spielmodus, Leitstelle und Spielgeneration getrennt. Er kann nur noch vorhandene Ereignisse zählen; er ersetzt keine dauerhafte Benachrichtigung außerhalb des Browsers.

## Statistiken und Einsatzberichte

**Einsatzarchiv → Statistiken** zeigt Auswertungen abgeschlossener Berichte: Notrufe und Nachforderungen, bestätigte Fehlalarme, Großlagen, Patientenübergaben, Verstorbene und erfasste Vergütung. Dazu kommen die seit dem Update gemessenen eigenen Kilometer und Mittelwerte verfügbarer Einsatzzeiten. Die bisherigen Gesamtabschlüsse bleiben separat erhalten. Ein fehlender historischer Messwert zählt nicht als null Sekunden.

Fahrleistung wird serverseitig aus dem tatsächlich durchfahrenen Anteil der jeweils gültigen Route gemessen. Stillstand, gesperrte Verbindungen, Defekte und bereits abgerechnete Zeit erzeugen keine zusätzlichen Kilometer. Rückfahrten und Fahrten zugesagter Nachbarkräfte gehen in die Gesamtfahrleistung ihrer Heimatleitstelle ein. Der einzelne Bericht enthält die bis zum Abschluss gemessenen eigenen Einsatz- und Transportkilometer. Eine spätere Rückfahrt verändert den abgeschlossenen Bericht nicht.

Jeder neue Abschluss erzeugt genau einen gespeicherten Bericht mit:

- Reaktion, Disposition bis zur Alarmierung, Ausrückzeit, erster Anfahrt, Erkundung, Arbeit bis zum ersten Transport/Abschluss, erstem Transport bis Abschluss und Gesamtdauer.
- Gesprächen, Sprechwünschen, Nachforderungen, eigenen eingesetzten Fahrzeugen und ihren erfassten Strecken.
- Patienten und Transportbelegen, bestätigten Ereignissen, tatsächlich gebuchter Vergütung und XP.
- Verwendeten AAO-Vorschlägen und deren Abdeckung der damals bekannten Anforderungen. Das ist keine nachträgliche Bewertung unbekannter Eskalationen.

Die Zeitsegmente beschreiben die ersten jeweiligen Ereignisse; parallel laufende Tätigkeiten lassen sich daraus nicht als exakte Personalstunden ableiten. Anschaffungen und Personalbuchungen bleiben im Geldjournal. Das Spiel erhebt keine erfundenen laufenden Einsatzkosten.

Das Detailarchiv behält wie bisher die letzten 500 Einsätze. Summen neuer Abschlüsse bleiben auch nach dem Entfernen älterer Detailberichte erhalten. Alte Archivfälle erhalten nur aus ihren vorhandenen Ereignissen ableitbare Werte und werden als teilweise erfasst gekennzeichnet. Historisch nicht erfasste Vergütung und XP bleiben unbekannt.

Berichte lassen sich als **JSON**, **CSV** oder über **Bericht drucken** ausgeben. Der Archivfilter ermöglicht einen gemeinsamen CSV-Export ausgewählter Fälle. Exporte benutzen den bereits freigegebenen Spielstand und enthalten keine geheimen Szenariodaten. CSV-Zellen werden zitiert; gefährliche Tabellenformel-Anfänge werden neutralisiert. Der Export verändert den Spielstand nicht.

## Ereignis-Replay und lange Historien

Ein abgeschlossener Einsatz besitzt einen Zeitstrahl mit Anfang, Einzelschritten, automatischer Wiedergabe, Pause und Schieberegler. Er zeigt aufgezeichnete Meldungen und den daraus ableitbaren Funkstatus eigener Fahrzeuge zum ausgewählten Ereignis. **Das ist ein Ereignis-Replay, keine vollständige Rücksimulation der Karte oder historischer Patientenzustände.** Die Wiedergabe verändert weder Serverzeit noch Fahrzeugbewegungen oder Geld.

Lange Einsatzhistorien sind durchsuchbar und zeigen zunächst höchstens 100 Einträge. Weitere Einträge lassen sich in Schritten von 100 laden. Berichte werden als separates UI-Modul nachgeladen; Bibliotheken liegen getrennt vom Spielcode und können bei Spielupdates im Browsercache bleiben.

## Balancing und bestätigter Fehlalarm

Normale Meldungen kommen weiterhin einzeln mit unregelmäßigen Abständen von **90–210 echten Sekunden** und höchstens **zwei offenen Einsätzen**. Nach einem Serverstillstand wird keine aufgestaute Liste nacherzeugt. Dieselbe Obergrenze gilt für Folgeereignisse und Flächenlagen. Diese Grenzen liegen jetzt zentral in `BALANCE`; Änderungen sind mit den Rhythmustests zu prüfen.

Als zusätzlicher kleiner Fall enthält der Katalog jetzt **41 Einsatzarten**: Eine automatische Brandmeldung kann sich nach bestätigter Erkundung als Fehlalarm herausstellen. Vor der Lagemeldung erhält der Browser nur „Ausgelöste Brandmeldeanlage“. Der Fall erzeugt keinen fiktiven Brand, benötigt aber Anfahrt, Erkundung und Abschlussarbeit. Erst das bestätigte Ereignis erhöht die Fehlalarmstatistik. Er vergütet 5.000 Credits und verdrängt keine offenen Einsätze.

Der reproduzierbare Balancing-Audit spielt Müllbehälterbrand, Pkw-Brand und Flächenbrand mit jeweils drei Seeds und den echten Dispositions-/Simulationsfunktionen durch. Er verifiziert anschließend jede Aktionsfolge anhand ihrer Zustandsprüfsummen und prüft, ob Kataloganforderungen überhaupt von vorhandenen Fahrzeugfähigkeiten bedient werden können. Das ist eine gezielte Abnahme kleiner Fälle, kein Nachweis perfekter Balance jeder denkbaren Flottenzusammenstellung.

## Isoliertes Entwicklerlabor

Voraussetzung: Projektabhängigkeiten wie beim normalen AMP-Setup installiert. Das Labor wird separat für Node.js gebaut. Es ist **nicht** in den HTTP-Server, den Produktions-Client oder die Server-Verwaltungs-CLI eingebunden und öffnet keine SQLite-Datenbank. Es hat keine Produktions-Zeitbeschleunigung und keinen privilegierten Spielaccount. Die Bezeichnung `developer` gehört ausschließlich zur neu erzeugten lokalen Prüfdatei.

```sh
node scripts/lab.mjs create --seed 124 --out .tools/lab-start.json
node scripts/lab.mjs step --in .tools/lab-start.json --action .tools/action.json --out .tools/lab-next.json
node scripts/lab.mjs verify --in .tools/lab-next.json
node scripts/lab.mjs events --in .tools/lab-next.json --out .tools/lab-events.json
node scripts/lab.mjs balance --out .tools/balance-audit.json
```

Eine Aktionsdatei enthält genau ein JSON-Objekt, beispielsweise `{"type":"generate","template":"bin"}`. Einsatz-, Fahrzeug- und Patientenkennungen stehen in der erzeugten Datei unter `save`. Jeder Schritt braucht einen neuen Ausgabepfad: Vorhandene Dateien werden niemals überschrieben. Eingaben sind auf 8 MB und Labore auf 2.000 Aktionen begrenzt. Das Labor ist kein Importwerkzeug für Produktionsspielstände.

| Aktion              | Felder und Wirkung                                                                   |
| ------------------- | ------------------------------------------------------------------------------------ |
| `generate`          | `template`: echten Katalogfall erzeugen, maximal zwei offen                          |
| `interview`         | `mission`: Notruf annehmen, Ort/Meldebild erfragen und beenden                       |
| `dispatch`          | `mission`, `vehicles`: normale Alarmierung und Bereitschaftsprüfung                  |
| `brief`             | `mission`: vorhandene erste Lagemeldung bearbeiten                                   |
| `advance`           | `seconds`: 1–14.400 Sekunden ausschließlich im Labor simulieren                      |
| `clock`             | `hour`: vorwärts zur nächsten angegebenen UTC-Stunde springen                        |
| `weather`           | `kind`: Wetterschlüssel aus `weatherKinds`, bis zum nächsten Wetterwechsel setzen    |
| `escalate`          | `mission`: vorhandene dynamische Gefahren erhöhen; weitere Reaktion im normalen Tick |
| `damage` / `repair` | `vehicle`: einsatzgebundenes Fahrzeug beschädigen / reguläre Reparatur beauftragen   |
| `fms`               | `vehicle`, `code`: Status 0–9 setzen; bestehende Defektregeln bleiben wirksam        |
| `patient`           | `mission`, `patient`, `health`: Gesundheit 0–100 und passenden Grundzustand setzen   |
| `crew-ready`        | Laborpersonal erreichbar und ohne Abwesenheit setzen                                 |

Jede erfolgreiche Aktion speichert ihren Inhalt und eine SHA-256-Prüfsumme des validierten Zustands. `verify` erzeugt dieselbe Ausgangswelt erneut, wiederholt alle Aktionen und vergleicht jeden Zwischenzustand und den Endstand. Manipulierte Aktionen, abweichende Prüfsummen oder ein veränderter Endstand werden gemeldet. Die Wiederholung gilt für dieselbe Programmversion; spätere Änderungen der Simulationsregeln können absichtlich andere Ergebnisse liefern.

## Migration und AMP

SQLite wird auf **Schema 10** migriert. Vorher erzeugt der bestehende Migrationsweg eine konsistente Originalkopie. Beide Modi werden einzeln verarbeitet. Fehlende Statistiken werden ergänzt, vorhandene Archive bekommen ableitbare Teilberichte, aktive alte Einsätze werden als teilweise erfasst markiert. Bereits vorhandene Messwerte werden erhalten. Konten, Wachen, Fahrzeuge, Personal, Geld, Aufträge, Mitgliedschaften und zugesagte Nachbarhilfe bleiben bestehen. Ein zweiter Start zählt alte Berichte nicht erneut.

Keine neuen Dienste, Ports oder Umgebungsvariablen. Für AMP gilt weiter: **Stoppen → `main` aktualisieren → Setup/Build erfolgreich abschließen → Starten → Browser neu laden.** `.env` und dauerhaften Datenordner erhalten. Ein Rollback benötigt die passende alte Software zusammen mit ihrer passenden Datenbanksicherung; ältere Software darf Schema 10 nicht öffnen. Normale Backups und Wiederherstellung behalten die neuen Berichte und Statistiken. Der explizite alte Bestandsimport übernimmt dagegen wie bisher keine laufenden Einsätze oder Abschlussarchive; deren neue Messdaten werden dabei ebenfalls nicht importiert.

Eine automatische Bereitstellung auf dem privaten AMP-Server gehört nicht zu diesem Auftrag. Testnachweise und tatsächlicher Git-Status stehen im [Prüfbericht](PHASE-5-TESTBERICHT.md) und dem zugehörigen Pull Request.
