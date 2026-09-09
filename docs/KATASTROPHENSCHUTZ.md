# Katastrophenschutz und Bereitschaft

Die Katastrophenschutzwache ist ein eigener baubarer Standort ab Stufe 8. Vier Stellplätze kosten 520.000 Euro. Die Standortkapazität wächst mit dem regulären Ausbau. Diese Preise und Freischaltungen sind Spielparameter.

Vorhandene Fahrzeugtypen bleiben erhalten: GW-San (`gwsan`), NKTW / KTW Typ B (`ktwb`), SEG-RTW und SEG-Betreuung können zusätzlich hier stationiert werden. Vorhandene Fahrzeuge an Rettungswachen behalten ihre IDs, Heimatwachen und Einsatzbindungen. Neue KatS-Funkrufnamen sind umbenennbare Spielnamen; die Identität hängt nicht am Text.

GW-San unterstützt Behandlung und Materialversorgung mit sechs Kräften, ohne Patiententransportplätze. Der hier vereinfachte NKTW basiert auf dem KTW Typ B mit zwei Kräften und zwei Transportplätzen. Er besitzt weniger Versorgungsfähigkeit als ein RTW. Das BBK beschreibt je Fahrzeugvariante zwei liegende oder einen liegenden und einen sitzenden Patienten. Das Spiel vereinheitlicht die Platzdarstellung; die bestehende Eignungsprüfung der Patienten bleibt verbindlich.

Fachliche Quellen: [BBK Sanitätswesen](https://www.bbk.bund.de/DE/Themen/Ergaenzende-Ausstattung/Zivilschutzfahrzeuge/Sanitaetswesen/sanitaetswesen_node.html) und [BBK Teileinheit Patiententransport](https://www.bbk.bund.de/DE/Themen/Gesundheitlicher-Bevoelkerungsschutz/Sanitaetsdienst/MTF/Teileinheiten-Leistungen-Fahrzeuge/Patiententransport-Leistungen-Fahrzeuge/patiententransport.html), geprüft am 09.09.2026. Einzelne Fahrzeugfähigkeiten, Beschaffungskosten und Zeitparameter des Spiels sind keine Dienstvorschriften.

KatS-Fahrzeuge sind auch ohne Katastrophenalarm alarmierbar. Die Bereitschaft zieht vorhandene freiwillige Kräfte vorab über reale Straßen zur Wache. Bereits eingetroffene, ungebundene und qualifizierte Kräfte müssen anschließend nicht erneut anreisen. Mindestbesatzung, Vorbereitung des Fahrzeugs, Verletzungen, Defekte, Patientenbindungen und Straßenfahrzeit bleiben wirksam. Berufsbesatzungen erhalten keinen zusätzlichen Zeitbonus.

Nur die Leitstellenleitung ordnet die Bereitschaft an oder beendet sie. Die Mindestlaufzeit beträgt im Spiel zehn Minuten, die Abklingzeit fünf Minuten. Nach dem Beenden bleibt eine laufende Besatzung gebunden. Freie Kräfte werden nach drei bis sechs Minuten gestaffelt aus der Reserve entlassen. Anreisende Kräfte beenden ihre angefangene Anreise; die Reservezeit beginnt nach Ankunft.

Neue FFW-Wachen erhalten bei Inbetriebnahme einmalig einen deterministischen Kern aus vier bis sechs bestehenden Einsatzkräften. Diese Personen sind hauptamtlich verfügbar und teilen sich weiterhin verbindliche Fahrzeugzuweisungen. Ein Kern mit vier Personen besetzt kein Fahrzeug, das sechs qualifizierte Kräfte benötigt. Bestehende stärkere Besetzung bleibt erhalten.

Die Garage zeigt tatsächlich am Standort abgestellte Fahrzeuge, auch bei abweichender Heimatzuordnung. Zugehörige Fahrzeuge auf Einsatz oder Rückfahrt stehen getrennt unter unterwegs. Ein vorbeifahrendes Fahrzeug zählt nicht als geparkt. FMS 6 schließt physische Garagenanwesenheit nicht aus. Der aufgeklappte Zustand bleibt pro Benutzer, Modus, Welt und Standort auf dem Gerät erhalten.

Die Empfehlung berücksichtigt offene Fälle, wartende Anrufe und deren Alter, bekannte dringende Lagen, verfügbare Fähigkeiten und den gebundenen Flottenanteil. Ab vier Belastungspunkten empfiehlt sie eine Aktivierung; eine bereits aktive Bereitschaft wird ab zwei Punkten weiter empfohlen. Der Status selbst wird weiterhin nur durch eine berechtigte Anordnung geändert. Die öffentliche obere Anzeige nennt aktive Leitstellen und Standortzahl, ohne deren private Einsatzdaten zu veröffentlichen. Siehe [gemeinsame Weltlagen](WELTLAGEN-UND-EINSATZORTE.md).

Datenbankmigration 15 ergänzt den Bereitschaftskern und ersetzt historische KatS-Timer durch tatsächliche Anreisen. Sie erhält Personal-IDs, aktive Fahrzeugbindungen, Wege, Patienten, Guthaben und Erfahrung. Der Server erstellt über den bestehenden Migrationsmechanismus eine SQLite-Sicherung vor der Änderung. `migration-preview` plant dieselbe Transformation schreibgeschützt. Wiederholtes Öffnen würfelt keinen Kern neu und startet keine weitere Migration.
