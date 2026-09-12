> Historisches Dokument zu 2.21. Tutorial und damalige Menüführung sind seit 2.25 abgelöst. [Aktuelle Bedienung](HUD-UND-SERVER.md).

# Persönliche Einführung und Serverübung · 2.21

Die Einführung begleitet die normalen Spielansichten. Eine zusätzliche persönliche Serverübung verwendet denselben Einsatz-, Dispositions-, FMS-, Routing-, Personal-, Aufgaben- und Abrechnungscode wie das eigentliche Spiel. Die Übung besitzt einen eigenen Spielstand; sie ersetzt keine produktive Leitstelle.

Die gemeinsame reale Deutschland-Browserabnahme mit Kapitelablauf und Bildschirmaufnahmen wird in [ABNAHME-2.21.md](ABNAHME-2.21.md) geführt. Die gezielten Backendprüfungen dieser Seite sind davon getrennt ausgewiesen.

## Einstieg und Lernweg

Unter **Hilfe / Tutorial** kann jeder angemeldete Benutzer die Einführung starten, überspringen und später fortsetzen. Ein erneuter Start einer abgeschlossenen Einführung beginnt deren Kapitel bei 1; er setzt weder Geld noch Welt oder Fahrzeuge zurück. Überspringen und Fortsetzen behalten dagegen den vorhandenen Kapitelstand. Das Lernen in der bestehenden Leitstelle erkennt vorhandene geeignete Gebäude und Fahrzeuge an. Ein dort bestätigter Kauf ist ein normaler Kauf aus deren Spielbudget. Die ausdrücklich als **Persönlicher Übungsstand** gekennzeichnete Alternative eröffnet dagegen eine getrennte Serverübung mit **1.400.000,00 € Übungsbudget**, Stufe 2 und eigenem Besitz.

Die 16 Kapitel sind:

| Nr. | Kapitel                          | Bestätigung                                                                                                                          |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Dein Arbeitsplatz                | Karte verschieben, zoomen und Suche verwenden.                                                                                       |
| 2   | Leitstelle und Budget            | Geldjournal öffnen.                                                                                                                  |
| 3   | Der erste Standort               | Eigene Feuerwache vorhanden oder aus dem realen Katalog erworben.                                                                    |
| 4   | Automatische Wachbesetzung       | Fertige Feuerwache und automatisches Personalmodell; Wachbereich geöffnet.                                                           |
| 5   | Das passende Fahrzeug            | Tatsächliches Fahrzeug mit Pumpfähigkeit vorhanden. LF 20 ist die vorgestellte passende Wahl.                                        |
| 6   | Ein neutraler Notruf             | Anruf angenommen; Ort und Meldebild durch das Gespräch bekannt.                                                                      |
| 7   | Technische Hilfe disponieren     | Tatsächliche Alarmierung im Einsatzereignisprotokoll.                                                                                |
| 8   | Ausrücken und FMS                | Erste tatsächliche Fahrzeugankunft.                                                                                                  |
| 9   | Lagemeldung und Sprechwünsche    | Erkundung bestätigt und Funkanfrage bearbeitet.                                                                                      |
| 10  | Abschluss und Rückfahrt          | Server hat einen Einsatz abgeschlossen und archiviert.                                                                               |
| 11  | Euro-Abrechnung und XP           | Einsatzbericht mit tatsächlicher Abrechnung geöffnet.                                                                                |
| 12  | Brand und echte Nachforderung    | Brand erkundet, tatsächliche Nachforderung bearbeitet, weiteres Fahrzeug anschließend alarmiert und angekommen, Brand abgeschlossen. |
| 13  | Rückzug und Rückfahrtalarmierung | Fahrzeugbereich geprüft und Rückfahrt beziehungsweise Freigabe im Spielstand beobachtet.                                             |
| 14  | Berechtigte Zusammenarbeit       | Verbundbereich geöffnet; Erklärung benötigt keinen zweiten Online-Spieler.                                                           |
| 15  | Deine Klangkulisse               | Audioeinstellungen und Vorschau verwendet.                                                                                           |
| 16  | Bereit für deine Leitstelle      | Hilfe/Lernabschluss geöffnet; Rückkehr zur echten Leitstelle ist möglich.                                                            |

Die Kapitel sind in `src/tutorial-model.ts` beschrieben. Operative Bereitschaft wird aus dem bestätigten Spielstand abgeleitet. UI-Aktivitäten wie Verschieben oder Öffnen eines Bereichs sind ausdrücklich Interaktionsnachweise und keine vorgetäuschte serverseitige Vermessung der Mausbewegung. Die Darstellung verwendet die öffentliche Sicht; verborgene Einsatzprofile, Anforderungen und Lagedaten werden dafür nicht vorzeitig aufgedeckt.

## Übungen und tatsächlicher Spielablauf

Die technische Übung erzeugt **Keller unter Wasser** in der Nähe einer fertiggestellten Feuerwache. Dafür ist eine vorhandene Pumpfähigkeit erforderlich. Anschließend kann ein **Flächenbrand** aus dem bestehenden Katalog angefordert werden, sobald der technische Einsatz abgeschlossen ist. Der Brandanker wird in tatsächlichen Metern gewählt; Deutschland verwendet hierfür unverändert seinen realen Straßenraum. Der technische Ablauf bleibt unverändert. Es gibt keine künstliche LF-ID-Sperre für ein ebenfalls geeignetes Fahrzeug.

Die Brandübung ändert keine Spielregel: Der vorhandene Flächenbrand verlangt `fire:2` und `water:3`. Das LF 20 stellt `fire:2, water:2` bereit; allein fehlt ihm eine Einheit Löschwasserversorgung. Nach der ersten Lagemeldung entsteht daher die normale serverseitige Nachforderung. **Nachforderung bearbeiten** im Funk bestätigt deren Aufnahme. Ein zusätzliches TSF-W ergänzt `fire:1, water:1` und kann über die gewöhnliche Disposition alarmiert werden. Der Server lässt das Feuer erst mit ausreichender tatsächlicher Versorgung löschen.

Von 1.400.000,00 € Startbudget verbleiben nach 650.000,00 € für die Feuerwache und 320.000,00 € für das LF 20 noch 430.000,00 €. Das TSF-W kostet 180.000,00 €; es bleiben 250.000,00 € sowie die private Vergütung des technischen Einsatzes. Zusätzliche Förderbuchungen, kostenlose Fahrzeuge, ein zweiter Spieler oder besondere Übungsfähigkeiten sind dafür nicht erforderlich. Die tatsächlichen FF-Ausrückzeiten, Straßenfahrten und gegebenenfalls Störungen gelten weiter.

Kapitel 12 ist erst erledigt, wenn im öffentlichen Ereignisprotokoll eine echte bearbeitete Nachforderung, die nachfolgende Disposition eines weiteren Fahrzeugs, dessen Ankunft mit derselben Zuordnung und der abgeschlossene Brand nachgewiesen sind. Eine alleinige Lagemeldung, bloßes Schließen eines Sprechwunschs oder ein zweites bereits vor der Nachforderung entsandtes Fahrzeug ersetzt diesen Lernweg nicht. Frühere Übungsstände mit einem bereits begonnenen Müllbehälterbrand werden nicht verändert; nach dessen Abschluss können sie einmalig die neue Flächenbrandübung anfordern.

Ein Szenario wird je Übungsstand nur einmal erzeugt. Erneute Anforderung desselben Szenarios dupliziert den Einsatz nicht. Der Server nutzt die vorhandenen Notruf-, Ausrück-, Straßenrouten-, Funk-, Aufgaben-, Abschluss- und Abrechnungsmodule. Es gibt keinen separaten clientseitigen Erfolgsschalter. Normale Simulationsentscheidungen bleiben serverseitig. Ein wiederhergestellter identischer Übungsstand mit denselben Aktionen und verstrichenen Zeiten wird deterministisch weitergerechnet.

Der Übungsstand läuft bei geschlossenem Browser weiter, solange er aktiv ist. Wiederaufnahme nach Serverstillstand übernimmt höchstens vier Stunden verstrichene Zeit pro Nachholschritt. **Zur echten Leitstelle** pausiert ausschließlich die persönliche Übung. Ihre spätere Fortsetzung übernimmt den gespeicherten Stand und rechnet die angehaltene Zeit nicht nach.

## Besitz, Geld und Multiplayer

- Persönlicher Fortschritt liegt in `tutorial_progress(user_id, payload)`.
- Persönliche Übungsstände liegen in `training_worlds(user_id, payload, updated_at)`.
- Die echten Spielstände, ihre Besitzverhältnisse und ihre laufende Simulation bleiben unabhängig davon bestehen.
- Auch zwei berechtigte Disponenten derselben echten Leitstelle besitzen jeweils eine eigene Übung. Die Übungsansicht gewährt ihnen nur die Verwaltung des jeweils persönlichen Übungsstands.
- Übungsvergütung, Übungs-XP und Geldjournal werden innerhalb des Übungsspielstands berechnet. Sie werden nicht in produktive Vergütungs- oder Einsatzhistorientabellen übernommen.
- Die regelmäßige Grundfinanzierung ist in Übungen deaktiviert. Eine wiederholte Übung erzeugt weder reale Geldgeschenke noch reale XP.
- Verbund-, Freigabe- und Mitgliedschaftsaktionen sind in der Übung gesperrt. Die Übungsansicht gibt keine Übungseinsätze oder Übungsfahrzeuge an andere Leitstellen frei.
- Historie und Export liefern während einer Übung ausschließlich deren Archiv. Der Export heißt ausdrücklich `leitstellen-verbund-practice`; nach dem Verlassen werden wieder die reguläre Historie und der reguläre Export angeboten.

**Übung neu beginnen** ersetzt nach ausdrücklicher Bedienung nur den persönlichen Übungsstand und setzt dessen Lernweg zurück. Es gibt keinen Produktionsreset und keine automatische Übernahme von Übungsgegenständen.

## API-Vertrag und Schutz bei mehreren Tabs

Jede dekorierte Spielansicht enthält `playContext`, eine pro Benutzer dauerhaft gespeicherte nichtnegative Ganzzahl. Erster Übungsstart, tatsächliches Beenden, Fortsetzen einer angehaltenen Übung und Reset erhöhen diesen Kontext genau einmal. Ein erneuter Start einer bereits aktiven Übung verändert ihn nicht. Die normale Ansicht vor dem ersten Übungswechsel verwendet 0.

Mutation des Spiels und Tutorialsteuerung benötigen `X-Play-Context`. Solange eine Übung aktiv ist, muss zusätzlich `X-Training-Session` deren aktuelle UUID enthalten. Nach dem Ende ist dieser Sessionheader unzulässig. Die Kontrolle erfolgt nach vollständigem Empfang des Requestbodys, unmittelbar vor der synchronen Operation. Ein während des Empfangs erfolgter Kontextwechsel kann so keinen alten Befehl in einen anderen Spielstand umleiten.

| Endpunkt                              | Vertrag                                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/action`                    | Vorhandene UUID-Aktions-ID, Kontextheader und gegebenenfalls Übungssitzung. Übungsaktionen besitzen ein eigenes persistentes ID-/Fingerprint-Register.                                                        |
| `POST /api/tutorial`                  | `start`, `resume`, `skip`, `ui` oder `next`; Kontext-/Sessionprüfung. `next` verlangt die aktuelle Kapitelnummer und tatsächlichen Fortschrittsnachweis.                                                      |
| `POST /api/training`                  | Jede Operation benötigt `id` als UUID. `start` erlaubt optional `reset`; `stop` besitzt keine weiteren Aktionsfelder; `scenario` verlangt `kind` und die Übungssitzung. Unerwartete Felder werden abgewiesen. |
| `GET /api/me`                         | Aktuelle Sicht mit persönlichem Tutorial, Übungssitzung oder `null` sowie `playContext`.                                                                                                                      |
| `GET /api/history`, `GET /api/export` | Aktiver eigener Spielkontext entscheidet über die zurückgegebenen Daten.                                                                                                                                      |

Für Übungssteuerung wird der Fingerprint aus dem geprüften Body und den ursprünglich mitgesendeten Kontext-/Sessionwerten gebildet. Bereits quittierte gleiche Start-/Stop-/Reset-Anfragen führen keine zweite Umschaltung aus. Ihr Replay liefert die aktuelle Ansicht. Es aktiviert auch dann keine alte Übung erneut, wenn inzwischen weitere Wechsel erfolgten. Gleiche ID mit anderem Body oder anderen ursprünglichen Headern wird abgewiesen. Verschiedene verspätete IDs müssen den aktuellen Kontext und die aktuelle Sitzung erfüllen.

Die letzten 256 Steuerungsbelege überleben einen Reset. Alte, bereits verdrängte Umschaltanfragen sind weiter durch ihren veralteten Kontext gesperrt. Pro Übungsstand sind bis zu 5000 reguläre Spielaktionen mit persistenter Wiederholungserkennung möglich; danach verlangt die Übung einen neuen Start. Der produktive Aktionsbelegspeicher wird dafür nicht verwendet.

Authentifizierte HttpOnly-Sitzung, SameSite-Cookie, Originprüfung, CSRF-Prüfung und Ratenbegrenzung gelten auch für die Übungsendpunkte. Eine fremde Übungssitzungs-UUID allein ist keine Berechtigung.

## Kompatibilität und Speicherung

Die SQLite-Migration auf Version 14 führt die beiden persönlichen Tabellen gemeinsam mit den dokumentierten Wirtschafts- und Personaländerungen ein. Der vorhandene Migrationsweg erstellt davor eine Sicherung und prüft das Ergebnis. Siehe `EURO-WIRTSCHAFT.md` für Vorschau, Summenabgleich und Bestandsausgleich.

Das Übungs-JSON trägt Version 1. Ältere Übungsstände ohne `contextRevision` und `controlCommands` erhalten beim Lesen 0 beziehungsweise ein leeres Steuerungsregister. Ihr Geld, Besitz, Zufallszustand, Fortschritt und vorhandene Belege regulärer Übungsaktionen bleiben erhalten. Gespeicherte Übungszustände werden gegen das vollständige Spielstandschema validiert und müssen dem Benutzer der Tabellenzeile gehören.

## Ausgeführte gezielte Prüfungen

`node .tools/pnpm-11.19.0/bin/pnpm.cjs exec vitest run tests/tutorial.test.ts tests/tutorial-http.test.ts`

Ergebnis: **9 bestandene Tests**, davon vier Serviceprüfungen und fünf echte HTTP-Prüfungen. Die HTTP-Prüfungen verwenden einen eigenen temporären Datenordner, tatsächliche Anmeldungen und Cookies, die echten API-Endpunkte und tatsächliches Schließen sowie erneutes Öffnen des Servers. Simulationszeit wird ausschließlich über den autoritativen Übungs-Zeitfortschritt eingespeist; globale Uhren und produktive Daten werden dafür nicht zurückgesetzt.

Geprüft sind insbesondere getrennte Übungen zweier Disponenten derselben echten Leitstelle, konkurrierende identische Aktionen, ungültige CSRF-/Origin-/Sitzungswerte, fremde und veraltete Übungssitzungen, monotone Kontexte und verspätete Umschaltungen. Der vollständige technische Einsatz erreicht über echtes Gespräch, Alarmierung, FMS und Funk eine private Vergütung und einen privaten Archiveintrag. Danach wird der Flächenbrand mit nur einem LF begonnen, die tatsächlich fehlende Wasserversorgung nach erster Lagemeldung nachgefordert, ein TSF-W zum normalen Preis gekauft und separat alarmiert. Nach realer Ankunft gelingt der Brandabschluss. Ein fehlender Nachforderungs- oder Ankunftsnachweis bestätigt das Kapitel nicht; eine erneute Szenarioanforderung dupliziert weder Einsatz noch Vergütung. Zwei Kopien des disponierten gespeicherten Zustands ergeben sowohl für die technische Lage als auch für den Brand mit zwei Fahrzeugen bei identischer Weiterrechnung vollständig identische Spielstände. Reguläre Besitz-, Geld-, XP- und Journalwerte sowie produktive Vergütungs- und Historientabellen bleiben unverändert.

Scoped ESLint für Tutorialservice, Serverendpunkte und neue HTTP-Tests sowie der vollständige TypeScript-Typecheck wurden ebenfalls erfolgreich ausgeführt. Browserergebnisse gehören in den zusammengeführten Abnahmebericht.

Der zusätzliche vollständige Vitest-Lauf mit `--maxWorkers=2` ergab auf Windows **1143 bestanden, 1 übersprungen und 1 fehlgeschlagen** bei 1145 Tests in 82 Dateien. Einziger Fehler: `amp-autostart.test.ts` meldet die nach Windows-SIGTERM verbliebene Lockdatei und verlangt die Linux-CI-Prüfung. Im separaten Node-Hardresetlauf bestanden 13 von 16 Fällen; zwei Dateisymlink-Fixtures scheiterten bereits beim Anlegen mit Windows-`EPERM`, ein Prozessneustartfall wurde nach 30 Sekunden abgebrochen. Die eng begrenzte Diagnose zeigte ebenfalls eine nach Windows-SIGTERM verbliebene Lockdatei; der Test wartete anschließend beim Aufräumen auf den schon beendeten Kindprozess. Diese Ergebnisse sind **keine vollständig grüne lokale Gesamtabnahme** und wurden nicht durch geänderte Schutzprüfungen kaschiert. Belege: `.tools/test-runs/2.21-unit-final.log`, `2.21-hard-reset-final.log` und `2.21-hard-reset-diagnostic.log`; das endgültige Linux-CI-Ergebnis ist separat zu dokumentieren.
