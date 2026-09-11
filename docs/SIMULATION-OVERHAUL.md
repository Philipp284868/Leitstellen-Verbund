# Simulation Overhaul · 2.24.0

Der Entwicklungsauftrag vom 11.09.2026 ist im bestehenden Deutschland-Produkt umgesetzt. Die Node-/SQLite-Simulation bleibt maßgeblich. Private Einsätze werden weiterhin nur innerhalb derselben Leitstelle oder über ausdrücklich angenommene Nachbarhilfe geteilt. Die Übungswelt bleibt getrennt. Es gibt keinen Zeitsprung-Schalter im Spiel.

## Funktionen und Bedienung

| Auftragsbereich | Umsetzung und Bedienweg |
| --- | --- |
| Patienten, Transporte, Abschluss | Der Einsatz zeigt **Patienten am Einsatzort** getrennt von **Transporten und Übergaben**. Jeder Transport enthält eigene Kennung, konkrete Patienten, Fahrzeug, Eigentümer und Krankenhaus. Nach dem Einladen fehlt die Person am Einsatzort; nach Übergabe endet die Fahrzeugbindung. Ein lokaler RTW kehrt bei verbliebenen transportfähigen Patienten zurück. Abschluss und Vergütung verlangen abgeschlossene Aufgaben, Gefahren, Behandlung und sämtliche tatsächlichen Übergaben. Fremde RTW verwenden dieselben Auftrags-/Quittierungsfunktionen. |
| Mehr parallele Einsätze | Das alte Ein-/Zwei-Einsatz-Limit und die Generatorsperre durch gebundene Fahrzeuge sind entfernt. Fuhrpark, Zahl betriebsbereiter Wachen, offene Gespräche, Auslastung, Tageszeit und Wetter bestimmen variable Abstände. Der Generator zieht nicht bei jeder Wiederverbindung erneut. |
| Zufahrten und Erzeugung | Pro Standort werden bis zu drei reale Straßenpunkte geprüft. Weitere Orte und Vorlagen folgen innerhalb desselben Erzeugungsversuchs. Auch zusammenhängende Großlagen versuchen weitere Orte. Ein ausgefallener Router bleibt als technischer Ausfall unterscheidbar; Besitz und Zufallsstand werden nicht durch eine erfundene Luftlinienfahrt ersetzt. |
| Weltlage, Wetter, Tages-/Jahreszeit | Gemeinsamer persistenter Zufallszustand entwickelt Wetter, Lageintensität und Trend. Die fünf alten Phasen bleiben nur als kompatible Speicherdarstellung erhalten. Sturm, Regen, Hitze und Winter verändern Einsatzmix und Häufigkeit; Tageszeit und Jahreszeit gewichten passende Varianten. Obere Lageanzeige öffnet Verlauf und regionalen Geltungsbereich. |
| Folgeereignisse, Eskalation, Nachforderung | Bestehende Gefahren-, Patienten-, Aufgaben- und Funkmodule bleiben verbunden. Ausbreitung, neue Verletzte, Ressourcenmangel und geänderte Anforderungen lösen wirkliche Entwicklungen und Sprechwünsche aus. Unterschiedliche Folgeereignisse sind pro Haupteinsatz möglich; nicht erreichbare Kandidaten halten nicht alle anderen Elternereignisse auf. |
| Wasser und Schlauch | Nach Erkundung eines Brandeinsatzes zeigt die Einsatzansicht B-/C-Leitungslängen, Fluss, Verbrauch und Mangel. Wähle Tank, Hydrant, belegtes Gewässer oder Pendelverkehr. Fehlende Leitungslänge und leere Tanks senken die wirksame Brandbekämpfung. Tanker fahren über reguläre Straßenrouten zur eigenen Wache, füllen zeitabhängig nach und kehren gebunden zurück. Währenddessen stellen sie keine Löschleistung an der Einsatzstelle bereit. |
| Fahrzeugkonfiguration und Warenkorb | **Eigene Wache → Fahrzeuge kaufen**: Fahrzeug, Ausrüstung und Zielwache wählen, dem Warenkorb hinzufügen und Bestellung abschließen. Der Korb kann unterschiedliche Fahrzeugtypen und Wachen enthalten. Serverprüfung umfasst Gesamtpreis, Stellplätze, Freischaltung, Organisation und Beladung; ein ungültiger Posten verwirft die ganze Bestellung. Eine wiederholte Aktionskennung bucht nicht doppelt. |
| Darstellung, Sortierung und Zustand | Fahrzeugtypen haben eigene Kartensilhouetten. Der Fuhrpark lässt sich nach Typ, Wache, Status, Organisation, Entfernung, Bindung, Verfügbarkeit, FMS und Favorit sortieren. Kilometer, Tank, Beladung und Verschleiß sind sichtbar; ein freies Fahrzeug an seiner Wache kann einen kostenpflichtigen Werkstattauftrag erhalten. Währenddessen gilt FMS 6. |
| Spezialorganisationen | Ergänzt sind FLF, ULF, THW-Stromversorgung, THW-Pumpen, THW-Beleuchtung, KatS-Logistik und eine Taucheinheit. Der Katalog umfasst 57 Fahrzeugtypen. Spezialfahrzeuge beachten Organisation, Standort, Freischaltung, Stellplätze und Besatzung; der Typ allein ersetzt diese Voraussetzungen nicht. |
| Bereitschaft und externe Hilfe | Die KatS-Ansicht und Nachbarhilfe zeigen laufende Kosten. Reale Fahrzeuge, Personal, Spezialisierung und Bindung bestimmen die Rate. Abrechnung erfolgt nach 30 Minuten bzw. anteilig beim Ende. Bei fehlendem Guthaben bleiben offene Beträge gespeichert; es gibt weder negative Guthaben noch einen Simulationsabsturz. Bereits bestehende Hilfe bleibt eine ausdrücklich angefragte/angenommene Kooperation mit tatsächlicher An- und Rückfahrt. |
| Einsatzkatalog und Orte | 217 Themen mit 556 geprüften Varianten. Neue Varianten umfassen weitere Brand-, Medizin-, Technik-, Wetter- und Speziallagen. Schulen, Kliniken, Einkaufszentren, Parkhäuser, Autobahnen und Flughäfen werden anhand vorhandener Kartenmerkmale ausgewählt. Fehlende Merkmale werden nicht durch frei erfundene POIs ersetzt. |
| Kontoverwaltung | **Einstellungen → Hinweise & Hilfe → Konto & Sicherheit → Spielstand zurücksetzen oder Konto löschen**. Passwort, Vorschau, genauer Bestätigungstext und Checkbox sind erforderlich. Reset entfernt den eigenen Besitz/Fortschritt und stellt Startwerte her; Löschen entfernt zusätzlich den Zugang. Sitzungen und Mitgliedschaften werden widerrufen. Laufende gemeinsame Bindungen sperren den Vorgang, offene unangenommene Fremdanfragen werden beendet. Andere Leitstellen werden nicht zurückgesetzt. |
| Kartenfokus | Standortfilter stehen kompakt und standardmäßig eingeklappt am Kartenrand. Die Kartenmitte bleibt für Einsatzorte, Fahrzeuge und Fahrwege frei. |

## Spielparameter

Diese Werte sind bewusst vereinfachte Spielregeln, keine technischen Garantien realer Einsatzmittel oder kommunaler Wassernetze.

- Notruf-Grundabstand: 90–180 Sekunden; nach Lage-/Lastgewichtung 20–360 Sekunden. Keine harte Grenze aktiver Einsätze. Nach einer Offlinepause wird kein ausgefallenes Notrufpensum als Stapel nachgeholt.
- Lageentwicklung: reproduzierbare Entscheidungen etwa alle 180–420 Sekunden. Intensität und Trend ändern sich ohne verpflichtende feste Phasenfolge.
- Beispiel LF 20: 2.000 l Tank, 300 m B und 240 m C. TSF-W: 500 l, 180 m B und 120 m C. Ländliche große Brandlagen können 500 m B-Leitung verlangen. Grundverbrauch: 6 l/s je wirksamer Feuer-Fähigkeit; die benötigte gesamte Leitungslänge muss vorhanden sein.
- Acht optionale Beladungen: 500-l-Zusatztank (6.000 €), Schlauchpaket 200 m B/120 m C (3.500 €), zwei Atemschutzgeräte (8.000 €), Lichtmast (5.000 €), Stromerzeuger (7.000 €), technischer Rettungssatz (15.000 €), Schaummittel (4.500 €), Zusatzlogistik (4.000 €). Die sechs Beladungsplätze begrenzen passende Kombinationen.
- Werkstatt: Verschleiß wächst über 2.000 km seit der letzten Wartung bis 100 %. Wartung kostet 250 € plus bis zu 2.500 € und dauert 120 bis 420 Sekunden. Verschleiß erhöht die bestehende deterministische Ausfallwahrscheinlichkeit. Alte Kilometer bleiben erhalten; das Update beginnt das erste neue Wartungsintervall ohne rückwirkende Strafe.
- KatS je halbe Stunde: 150 € pro Fahrzeug, 100 € für höherstufige Spezialfahrzeuge, 50 € für gebundene Fahrzeuge und 12 € pro Person. Externe Hilfe: 250 € je zugesagtem Fahrzeug, 15 € je Besatzungsplatz und 150 € für höherstufige Spezialfahrzeuge. Centgenaue zeitanteilige Rückstände bleiben gespeichert.

## Geodaten und Migration

Der neu erzeugte, komprimiert mitgelieferte Standortkatalog verwendet dieselben Quelldaten und dieselbe Datensatzidentität. Alle 40.034 IDs, Namen, Grundkategorien und Darstellungskoordinaten wurden mit dem vorherigen Katalog verglichen; sie bleiben erhalten. 16.790 Einrichtungen besitzen zusätzliche Zugangskandidaten (insgesamt 28.186 Alternativen). 22.445 Einrichtungen haben einen grundsätzlich verwendbaren Zugangskandidaten, der beim Erwerb weiterhin den Laufzeittest bestehen muss. Bestehende Eigentumsrechte und laufende Fahrzeugpositionen werden nicht versetzt.

Zusätzlich zu belegten Eingängen und Straßen auf dem Gelände berücksichtigt der Katalog kartierte **Service-Straßen innerhalb von 40 m**. Gesperrte/private Straßen werden für diese Näherung ausgeschlossen. Dieser Kandidat ist ausdrücklich als `nearby-service-road` gekennzeichnet; er behauptet keinen vermessenen Eingang. Beim Kauf werden Landlage und beide Fahrtrichtungen geprüft. Drei explizit gekennzeichnete Flughafen- und drei Betriebsfeuerwehren besitzen damit solche verwendbaren Kandidaten. Unzureichend dokumentierte oder tatsächlich nicht erreichbare Standorte bleiben gesperrt.

Die Zuordnung des OSM-Werts `fire_station:type=concern` zur Betriebsfeuerwehr folgt der [OSM-Schlüsseldokumentation](https://wiki.openstreetmap.org/wiki/Key:fire_station:type). Eine Einrichtung wird weiterhin nicht allein aufgrund ihres Namens als Spezialwache eingestuft.

SQLite **19 → 20** ist eine additive Speichergrenze: Vorher wird über den vorhandenen Sicherungsweg eine vollständige Datenbankkopie angelegt. Die Migration ersetzt keine Save-JSON-Daten, Konten, Budgets, Standorte oder Geodatenidentitäten. Neue optionale Felder werden beim Validieren bzw. Simulieren ergänzt. Notrufplanung Version 3 übernimmt Sequenz und Seed und begrenzt zu lange verbleibende alte Fristen. Transportreferenzen werden anhand der vorhandenen Fahrzeug-/Patientenbelege ergänzt; ein bloßer Zähler erzeugt keine erfundene Übergabe. Die erneute Migration ist wirkungslos. Ältere Server müssen Schema 20 ablehnen, damit neue Informationen nicht verloren gehen.

Kontolöschung betrifft die aktive Datenbank. Bereits angelegte Betreiberbackups sind eigenständige Sicherungen und werden nicht heimlich verändert; bei einer späteren Wiederherstellung muss der Betreiber zwischenzeitliche Löschungen berücksichtigen. Die Historie anderer Leitstellen wird nicht durch Löschen des eigenen Kontos entfernt.

## Geänderte Zuständigkeiten

- `src/simulation/patient-transport.ts`, `patients.ts`, `engine.ts`, `server/game.ts`: Transportidentitäten, Belegung, Übergabe und Abschluss.
- `pacing.ts`, `world-situation.ts`, `weather.ts`, `dynamics.ts`, `major-incidents.ts`: Erzeugung, Weltentwicklung und Folgeereignisse.
- `location-reachability.ts`, `incident-location.ts`, `server/germany/geography-sites.ts`, `src/facilities/*`, `scripts/geodata/facility-*`, `data/facilities/*`: echte Orts-/Zufahrtsdaten und Katalog.
- `vehicle-equipment.ts`, `water-supply.ts`, `trip-start.ts`, `vehicle-maintenance.ts`, `operating-costs.ts` mit getrennten Schemas: Betriebsmittel, Reisen und Kosten.
- `Resources.tsx`, `VehicleConfiguration.tsx`, `WaterSupplyControls.tsx`, `Dynamics.tsx`, `CivilProtection.tsx`, `NeighborDesk.tsx`, `fleet-sort.ts`, `map-icons.tsx`: nutzbare Verwaltungs-/Einsatzoberflächen.
- `server/account-lifecycle.ts`, `server/index.ts`, `AccountLifecycle.tsx`, `server/database.ts`, `scripts/installation-storage.mjs`: Kontovorgänge und Speicherschutz.

## Tatsächliche Prüfungen

Lokale Prüfungen vom 11.09.2026 unter Windows mit Node.js 24.19.0. Die ergänzenden Linux-Ergebnisse für den veröffentlichten Programmstand stehen anschließend separat.

- Typecheck, ESLint, Format-/Projektprüfung bestanden; Produktionsbuild einschließlich bestehender Bundlebudgets bestanden.
- Vitest: über den breiten Lauf und die erfolgreichen Nachprüfungen sind 1.310 aktuelle Testfälle abgedeckt; drei vorhandene Linux-Dateirechte-/Symlinkfälle werden unter Windows übersprungen. Der breite Lauf bestand zunächst mit 1.295 erfolgreichen Fällen und zwei Fehlern. Die sechs einstündigen Notrufmessungen wurden bei unveränderter Gesamtdauer in getrennte Tests mit eigenem Zeitlimit aufgeteilt; die Kostenprüfung erwartet jetzt die tatsächlich eingeführte anteilige Bereitschaftsabrechnung. Beide betroffenen Dateien bestehen mit 14 Tests. Die abschließende Zusatzprüfung für Großlagen, alternative Zufahrten und zehn parallele Einsätze besteht mit 33 Tests.
- Welt-/Balancing-Messung: sieben Tests bestanden, 22 simulierte Stunden, sechs Kombinationen aus Seed und Fuhrpark. Die gesamte Dauer blieb erhalten; unabhängige Messungen erhielten jeweils ein eigenes Zeitlimit.
- Edge/Chromium: alle 99 Abläufe über Voll- und Nachlauf bestanden (zunächst 95/99, anschließend die vier angepassten Bedienprüfungen 4/4). Geprüft sind auch der standardmäßig eingeklappte Standortfilter, die dynamische Lageanzeige, Tastaturbedienung beider Fahrzeug-Disclosures und der Doppelklick-/Bestätigungsschutz beim gescrollten Fahrzeugkauf.
- Beide Patientenabläufe (ein Patient/ein RTW und drei Patienten/zwei RTW) im Browser mit Einladen, Anzeige, Serverneustart, Übergabe und Archiv erfolgreich. Der Neustart darf einen bereits kurzen Transport tatsächlich abschließen; die Prüfung kontrolliert deshalb den wirklichen Patienten- und Archivzustand statt eine künstliche Mindestdauer zu verlangen.
- Kontoreset/-löschung, Passwortschutz, CSRF-Abweisung, widerrufene Sitzungen und atomarer Warenkorb im Browser erfolgreich.
- Produktionsabhängigkeiten: `pnpm audit --prod --audit-level=high` ohne bekannte Schwachstellen.
- Node-Dateisystemtests unter Windows: 14 bestanden; zwei Dateisymlink-Tests scheitern beim Anlegen des Testlinks an Windows `EPERM`. Im anschließenden Linux-Lauf bestehen alle 16 einschließlich beider Symlink-Schutzfälle. Es wurde keine Schutzprüfung deaktiviert.
- Lokaler Firefox-Download scheiterte an Netzwerkzeitüberschreitungen. Der vollständige Firefox-Nachweis wurde anschließend auf Linux erbracht.

### GitHub Actions auf Linux

Programmstand: [`199479d`](https://github.com/Philipp284868/Leitstellen-Verbund/commit/199479dc614ba781687b05a1b5275694bd57110f), [erfolgreiche vollständige Produktabnahme im Profil `deep`](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34638209966). Alle elf geplanten Prüfgruppen sind erfolgreich. Die heruntergeladene `acceptance.json` bestätigt für jede Gruppe null Fehler, null übersprungene Fälle und null instabile Wiederholungen. Nachfolgende Änderungen an diesem Bericht verändern den geprüften Programmcode nicht.

| Prüfgruppe | Tatsächliches Ergebnis |
| --- | --- |
| Struktur, Format, Lint, Typecheck, Produktionsbuild und Bundlebudgets | Erfolgreich |
| Logik und Integration | 1.313 bestanden, vollständiger gemeinsamer Lauf in 605 Sekunden |
| Node-Dateisystemtests | 16 bestanden, einschließlich Symlink- und Wiederherstellungsschutz |
| Reguläre Chromium-Browserabläufe | 99 bestanden (49 + 50), beide Jobs erfolgreich |
| Reguläre Firefox-Browserabläufe | 98 bestanden (50 + 48), beide Jobs erfolgreich |
| Zusätzliche Lastprüfung | 2 bestanden: Chromium und Firefox mit 100 Wachen, 500 Fahrzeugen, 40 Einsätzen und 100 Fahrten |
| Geodatenprüfung | 5 Prüfungen erfolgreich |
| AMP-Abnahme unter Debian 13 / Node 24.19.0 | Erfolgreich: frisches und wiederholtes Setup, Caddy-Konfiguration, tatsächliches TLS-Login, Cookies/Origin/WebSocket/Polling, Datei-/Geodatenisolation, verlorene Konfiguration, sauberer Stopp und persistenter Neustart |
| Linux-Serverpaket | Erstellung, Prüfung und Paketstart erfolgreich; geprüfter Kandidat als CI-Artefakt vorhanden |
| Produktionsabhängigkeiten | Audit erfolgreich, keine bekannten Schwachstellen gemeldet |

Die AMP-Prüfung verwendet einen kleinen überprüften Deutschland-Testdatensatz und einen kontrollierten externen Routingvertrag. Sie führt Setup, Build, Server und Caddy/TLS tatsächlich aus; sie prüft weder öffentliches ACME noch die private AMP-Installation des Betreibers.

Der [CodeQL-Lauf](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34638210013) ist erfolgreich. Zusätzlich wurde die Analyse für genau `199479d` kontrolliert: `results_count=0`, kein Analysefehler und keine offenen Code-Scanning-Befunde auf `main`.

## Betrieb

Keine Produktionsdaten, AMP-Instanz oder `.env` wurden geändert. Das normale Repository-Update enthält Programmcode und den komprimierten Standortkatalog; ein vollständiger Deutschland-Neuimport ist dafür nicht erforderlich. Der Betreiber aktualisiert und startet AMP separat nach Prüfung des veröffentlichten Stands. Kontorücksetzung ist eine neue freiwillige Funktion und kein notwendiger Update-Schritt.
