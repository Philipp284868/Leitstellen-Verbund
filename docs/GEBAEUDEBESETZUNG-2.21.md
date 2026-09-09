# Automatische Gebäudebesetzung 2.21

Eine fertig gebaute eigene Wache stellt ihre im Spiel zugelassenen Fahrzeugfunktionen einschließlich Besetzung und Qualifikationen bereit. Der Bau- beziehungsweise Erweiterungspreis enthält diese Besetzung. Es entstehen keine Rekrutierungs-, Zuweisungs- oder Ausbildungskosten und keine zusätzliche Pflicht zur Personalverwaltung.

## Serverseitiger Ablauf

`src/simulation/building-staffing.ts` bündelt die idempotente Inbetriebnahme (`reconcileBuildingStaffing`), den Kapazitäts- und Qualifikationsplan (`buildingStaffingPlan`), die Migration (`migrateBuildingStaffing`) und die reduzierte Betriebsanzeige (`buildingStaffingStatus`). Die Engine ruft den Abgleich nach Bau, Fahrzeugkauf, Erweiterung, Verkauf, Standortwechsel und bei Simulationsschritten auf. Vor tatsächlichem Bauabschluss entsteht keine Besetzung. Noch nicht fertiggestellte oder nicht freigeschaltete Erweiterungen stellen keine vorgezogene Funktion bereit.

Die Fahrzeugdaten definieren nominelle Besatzung, Mindestbesatzung und erforderliche Qualifikation. Eine Wache erhält zunächst eine Grundbesatzung. Weitere konkrete Personen entstehen für tatsächlich gekaufte Fahrzeuge oder notwendige Vertretung, innerhalb der Kapazität des Standorts. Der Bestand wird nicht für jeden hypothetischen Stellplatz aufgefüllt. Die Obergrenze berücksichtigt alle zugelassenen Stellplätze und eine zusätzliche größte Besatzung als betriebliche Vertretung. Beispiel: eine Feuerwehr auf Ausbaustufe 1 bietet vier Stellplätze und maximal 45 interne Personen; die professionelle Ausbaustufe bietet acht Stellplätze und maximal 81. Krankenhäuser und Schulen betreiben ihre bestehenden eingebauten Dienste ohne alarmierbare Fahrzeugbesatzungen.

Bei Berufsfeuerwehr und regulären Wachen erfolgt die stationäre Zuordnung automatisch. Bei Freiwilligen Feuerwehren bleibt der reale, standortgebundene Pool vor dem Alarm ungebunden. Neue Feuerwehrwachen sind weiterhin FF; fehlende historische Organisationsprofile gelten weiterhin als BF. Ein neuer BF-Ausbau bleibt kostenpflichtig und an seine reguläre Fortschrittsfreigabe gebunden.

## Bereitschaft und geschützte Bindungen

Im neuen Besetzungsmodell führen gewöhnliche Schichten, Erreichbarkeit oder kalendarische Zufallswerte nicht mehr zu einer zufälligen Grundsperre. Die FF-Anreise selbst bleibt unverändert: reproduzierbare Reaktionszeiten, unterschiedliche tatsächlich geroutete Fahrten zur Wache, gespeicherte Wegpunkte und Ausrücken erst nach Ankunft der passenden Mindestbesatzung. Ein gemeinsamer Besatzungsallocator verhindert die Zusage derselben Person an mehrere Fahrzeuge. Explizite isolierte Labor-Störungsfixtures können weiterhin ausbleibende Quittierungen prüfen.

Verletzungen bleiben wirksam. Eine Vertretung kann nur am eigenen Standort in ein dort verfügbares Fahrzeug einsteigen. Besetzungen von alarmierten, fahrenden, eingesetzten, transportierenden, nachbereitenden oder zurückkehrenden Fahrzeugen werden beim Abgleich weder entfernt noch ausgetauscht. Patienten, Zuweisungskennungen, Fahrwege, aktuelle Positionen, Ankunftszeiten und echte betriebliche Sperren bleiben erhalten. Eine bereits besetzte verfügbare Rückfahrt bleibt während eines Wachenumbaus alarmierbar. Personal wandert nicht zwischen Gebäuden, Verletzungen werden nicht geheilt und gesperrte Funktionen nicht durch neue Personen umgangen.

Die Standardansichten zeigen das Betriebsprofil, „Betriebsbereit“ oder einen konkreten Ausnahmegrund. Es gibt dort keine private Dienstplanung oder manuelle Grundbesetzung. Der tatsächliche FF-Sammelvorgang und seine Zeit bis zum Ausrücken bleiben während eines Alarms sichtbar.

## Bestehende Daten und Migration

Die automatische Besetzung wird über `Save.staffing.version = 1` markiert. Die gemeinsame SQLite-Migration von Datenbankversion 13 auf 14 läuft mit der getrennt markierten Euro-Migration in einer gesicherten Transaktion. Der vorhandene Mechanismus erstellt vorher eine lesbare Sicherung. Der Migrationsplan arbeitet auf validierten Kopien und kann die unveränderte Datenbank vorab prüfen.

Historische Rekrutierung war im vorhandenen Code unmittelbar, es existiert keine Rekrutierungswarteschlange. Vorhandene bezahlte Ausbildungsaufträge (`training`, `ready`) werden einmalig unter Erhalt ihrer erworbenen Qualifikation abgeschlossen. Personenidentitäten, bestehende Bindungen, Verletzungen und fehlende historische BF-Profile bleiben erhalten. Der Personalabgleich selbst verändert keine Geldbeträge. Er ist auch nach erneutem Öffnen der Datenbank wirkungslos, sobald der Bestand vollständig versorgt ist. Es erfolgt kein Datenreset.

## Tatsächlich geprüfte Fälle

`tests/building-staffing.test.ts` prüft Bauabschluss, sofort nutzbare RTW, sämtliche legalen FF-Stellplätze, gemeinsame Alarmierung ohne doppelte Personen, verlässliche Grundverfügbarkeit, Erweiterungsqualifikationen, Ausbau, verletzte beziehungsweise gebundene Besatzungen, Rückfahrten bei Umbau, unveränderte Altidentitäten, einmalige Ausbildung, geklonten Dry-Run, fehlende Gebäude und wiederholte alte hire/assign-Aufrufe.

`tests/building-staffing-http.test.ts` benutzt echte HTTP-Sitzungen und SQLite. Eigentümer und berechtigtes Leitstellenmitglied kaufen und alarmieren gleichzeitig. Ein fremdes Konto wird abgewiesen; gleiche Request-ID kauft nur einmal. FF-Anfahrten, Besatzungsbindungen, Geld und Zuweisungen bleiben über einen tatsächlichen Serverneustart erhalten. Beide Fahrzeuge rücken nach ihren echten gestaffelten Ankunftszeiten jeweils genau einmal aus.

`tests/building-staffing-migration.test.ts` prüft eine tatsächliche alte SQLite-Datei: read-only Vorschau bytegleich, DB13-Sicherung mit Originaldatensatz, Migration auf DB14, exakte Rückfahrtgeometrie und Personenbindung, unveränderte Verletzung, einmalige bezahlte Ausbildung und zweites Öffnen ohne weitere Personen oder zweite Sicherung. Die bestehenden FF- und Deutschland-Client-Tests prüfen weiterhin Anfahrten, Sperren, Reserven und die Darstellung ohne privaten Geo-Provider.

Diese Prüfung ersetzt nicht die abschließende gemeinsame Release-Prüfung der gesamten Oberfläche und Wirtschaft; deren tatsächliche Ergebnisse werden separat dokumentiert.
