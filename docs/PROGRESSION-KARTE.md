# Progression, Freischaltungen und Fahrtsimulation · Version 2.21

## Historischer Hintergrund: bestätigte Ursachen der Korrektur 2.12

Der bisherige Ausdruck `Math.min(10, 1 + Math.floor(xp / 150))` begrenzte nur die berechnete Stufe. Einsatzabschlüsse schrieben weiterhin XP in den Spielstand. Die HUD-Anzeige verwendete unabhängig davon `xp % 150`. Es gab damit keinen belegten allgemeinen Verlust von XP oberhalb Stufe 10. Es werden keine vermuteten historischen Belohnungen erfunden.

Alle Straßenfahrzeugtypen hatten zuvor 60 km/h als Fahrzeugwert. Streckenlänge geteilt durch diesen Wert und pauschale Dringlichkeits-/Wetterfaktoren bestimmten die Reisezeit. Die Karte interpolierte die Gesamtstrecke linear über diese Zeit. Routing minimierte geometrische Länge. Unterschiedliche Straßenlimits und Beschleunigungsphasen konnten so weder Auswahl noch Bewegung korrekt beeinflussen.

## Gemeinsame Progression

`src/progression.ts` enthält kumulative, ganzzahlige XP-Schwellen. Die Kosten für den Übergang von Stufe L auf L+1 sind:

| Stufe L | Erforderliche XP für den nächsten Aufstieg |
| ------- | ------------------------------------------ |
| 1–5     | 150 + 35 × (L − 1)                         |
| 6–10    | 400 + 60 × (L − 6)                         |
| 11–25   | 850 + 35 × (L − 11)                        |
| 26–50   | 1.600 + 50 × (L − 26)                      |
| Ab 51   | 2.850 + 35 × (L − 51)                      |

Die letzte Formel läuft über die Freischalttabelle und Stufe 100 hinaus weiter. Die binäre Stufensuche arbeitet ohne Schleife über sämtliche verdienten Stufen. Rest-XP und größere Gutschriften bleiben erhalten. Der explizit validierte Speicherbereich beträgt 0 bis 1.000.000.000.000 XP; eine Überschreitung wird abgewiesen statt abgeschnitten. Server, HUD, Profil und Kaufbedingungen verwenden dieselbe Berechnung.

Eine erfolgreiche Mission verwendet `100 + min(60, floor(Grunddauer / 30) × 10) + min(100, Anzahl ursprünglicher Fähigkeitsarten × 15) + (ursprüngliche Szenariostufe − 1) × 35` als XP-Grundbetrag. Die unveränderliche Katalogdefinition ist maßgeblich, nicht absichtliche Eskalation, Wartezeit, Fahrzeuganzahl oder wiederholte Meldung. Euro werden getrennt nach der aktuellen Wirtschaftsregel berechnet; die bestehende Qualitätsbewertung kann die Abschlussvergütung einschließlich XP vermindern. Bestätigte externe Unterstützung erhält einmalig bis zu 60 XP, ebenfalls mit Qualitätsfaktor. Fortschritt gehört zum jeweiligen gespeicherten Leitstellenstand; mehrere Disponenten oder Tabs vervielfachen ihn nicht. PC-Multiplayer ist der einzige normale Spielmodus. Persönliche Übungen besitzen getrennten Fortschritt; alte Einzelspielerstände sind inaktive Archive.

## Aktuelle Freischaltungen und Preise

Die vollständige aus den aktuellen Katalogen erzeugte [Euro-Preisliste](EURO-PREISE.md) enthält alle **50 Fahrzeugtypen, acht Gebäudetypen und vier Erweiterungen**, ihre Freischaltstufen und Voraussetzungen. Sie ersetzt die frühere unvollständige 20-Fahrzeug-/Credit-Tabelle dieser Anleitung. Der Erzeuger `node scripts/economy-audit.mjs --write` schreibt zugleich [EURO-PREISE.json](EURO-PREISE.json).

Neukäufe benötigen ausreichend Euro, Spielerlevel, fertige passende Wache, Stellplatz und gegebenenfalls Erweiterung. Ab 2.21 stellt die fertiggestellte freigeschaltete Gebäudefunktion passende Besetzung und Qualifikation automatisch bereit. Ein Ausbildungszentrum ist kein zusätzlicher Pflichtkauf für jede Fahrzeugbesatzung. Verletzungen, aktive Bindungen und tatsächliche FF-Anreise bleiben wirksam. [Automatische Wachbesetzung](GEBAEUDEBESETZUNG-2.21.md).

Gebäudeausbau benötigt mindestens die Gebäudefreischaltung und das Doppelte der bisherigen Gebäudestufe. Die maximale Gebäudestufe 10 ist unabhängig vom unbegrenzten Spielerfortschritt. Bestehende Fahrzeuge werden nicht durch spätere Stufengrenzen eingezogen.

Die [sechs aktuellen Finanzierungsszenarien](EURO-WIRTSCHAFT.md#sechs-transparente-wirtschaftsszenarien) verwenden tatsächliche Europreise, automatische Grundfinanzierung und ausdrücklich begrenzte Annahmen zu Einsatzerlösen. Sie sind Geldmodelle, keine gemessenen Fahr- oder Aufstiegszeiten. Neue normale Leitstellen beginnen mit 1.400.000,00 €; Feuerwache und TSF-W lassen 570.000,00 € übrig. Die folgende ältere Zeitstudie wird nicht als aktuelle Deutschlandmessung ausgegeben.

## Aktuelle Migration und Karte

Schema 14 übernimmt die Euro-/Preisumstellung und automatische Wachbesetzung mit Vorabsicherung, read-only Vorschau und Summenprüfung. Bereits vorhandene XP, Fahrzeugbindungen und Wege bleiben dabei geschützt. [Konkreter Ablauf](AMP.md#update-und-migration-auf-schema-14) · [Bestandsschutz](EURO-WIRTSCHAFT.md). Die ältere Progressionsmigration wird bei entsprechend alten kompatiblen Beständen weiterhin nur einmal angewendet.

Deutschland verwendet reale lokale OSM-Geometrie und Straßenrouting; aktuelle Karte, Limits und ETA stehen in [DEUTSCHLAND.md](DEUTSCHLAND.md) und [DEUTSCHLAND-ROUTING.md](DEUTSCHLAND-ROUTING.md). Die folgenden Flächen-, Knoten- und Fahrzeitwerte betreffen ausdrücklich die frühere fiktive Falkenried-Erweiterung aus Version 2.12. Sie sind kein aktueller Deutschlandumfang und keine erneute Migrationsanweisung.

## Historische Studie und Weltmigration aus Version 2.12

Die folgenden Abschnitte bleiben als damals dokumentiertes Modell und technische Herleitung erhalten. Aussagen über zwei aktive Fälle, getrennte Spielmodi, Schema 11 oder die fiktive 100-km-Region beschreiben diesen früheren Stand. Für heutigen Betrieb gelten die aktuellen Abschnitte oben.

## Balancing: reproduzierbare Modellschätzung

Ausführen mit `node scripts/progression-audit.mjs`. Vollständige Annahmen, Szenarienmischungen, Fahrzeuglisten, Fahrzeiten, Meilensteine und Messwerte stehen in [PROGRESSION-AUDIT.json](PROGRESSION-AUDIT.json).

Die Schätzung verwendet 48 deterministisch ausgewählte lokale Fahrziele je Spielphase, echte Straßenrouten mit Beschleunigung/Bremsen, einen kleinen bis mittleren Fuhrpark und 1–1,7 effektiv parallel bearbeitete Einsätze bei höchstens zwei offenen Missionen. Die mittlere Anrufpause wird mit 150 Sekunden angesetzt. Die Rechnung enthält Hin- und Rückfahrt, 40 Sekunden für Notruf/Disposition/Ausrücken, ursprüngliche Einsatzarbeit, 30 Sekunden Erkundung sowie bei Patienten 150 Sekunden für Versorgung/Übergabe. Individuelle Patientenverläufe, vollständige taktische Fehlentscheidungen und das Wetter sind keine Vorhersagegrößen dieses Modells. Die Referenzbedingungen sind frei; reale Schlechtwetterlagen benötigen mehr Zeit.

Die Fahrzeuge sind keine Vollausstattung aller Organisationen. Frühe Missionsorte liegen innerhalb von 2,16 km Luftlinie um geeignete Wachen, bei mehr als vier Fahrzeugen innerhalb von 4,8 km. Die tatsächlich gefahrene Straße kann länger sein. Eine Startwache übernimmt keine zufälligen 100-km-Anfahrten. Grundsätzlich vorhandene Fähigkeiten zählen auch bei vorübergehender Bindung oder einem reparierbaren Defekt.

| Beispielstufe | Ø XP je erreichbarem Szenario | Erwartete Minuten je Aufstieg | Ø Straßenanfahrt |
| ------------: | ----------------------------: | ----------------------------: | ---------------: |
|             1 |                         126.7 |                           7.7 |          1.98 km |
|             5 |                         137.5 |                          10.9 |          1.98 km |
|            10 |                         151.2 |                          20.8 |          1.98 km |
|            20 |                         154.3 |                          48.8 |          3.63 km |
|            35 |                         158.8 |                          80.3 |          3.63 km |
|            60 |                         158.8 |                         124.0 |          3.63 km |

Diese Werte sind ausdrücklich Simulationen, keine gemessenen Spielerzeiten und keine Garantie. Stufe 11 liegt in der konservativen Übergangsrechnung noch knapp unter 30 Minuten; danach wachsen die Zeiten gleichmäßig in den Zielbereich. Nach Stufe 50 wächst die Kurve weiter, ohne Sprung auf eine neue starre Obergrenze. Das Modell schätzt Stufe 10 nach rund 2,1 Stunden, Stufe 20 nach 7,3 Stunden und die Luftrettung auf Stufe 30 nach 17,2 Stunden. Die JSON-Datei enthält die vollständige Rechnung. Der Vergleich mit den alten 60–80 XP verwendet dieselbe neue Routenbasis, um den isolierten Fortschrittseffekt zu zeigen; historische Spielzeiten auf der alten Karte werden nicht als gemessen behauptet. Oberhalb Stufe 10 war der alte sichtbare Fortschritt blockiert.

## Migration und Betrieb

SQLite-Schema **11** folgt auf Schema 10. Vor einer vorhandenen älteren Datenbank wird automatisch eine konsistente `pre-migration-v2-<Zeit>-<ID>.sqlite` angelegt. Der historische Dateipräfix bleibt aus Kompatibilitätsgründen bestehen. `.env`, Konten, Besitz, Geld und Standorte werden nicht zurückgesetzt. Die beiden Spielmodi werden getrennt migriert.

Offline-Vorschau nach Serverstopp mit derselben `.env`/`DATA_DIR`:

```text
node dist/server/cli.js migration-preview
```

Die Vorschau öffnet SQLite lesend und zeigt pro gespeichertem Stand alte/neue XP, Ausgleich, Stufe und aktive Fahrten. Sie besitzt keine Freigabe zum Schreiben von Spieldaten. Ein vorhandenes Server-Lock verhindert gleichzeitige Wartung. `node dist/server/cli.js backup` und die bestehende dokumentierte CLI-Wiederherstellung bleiben nutzbar. Erst der folgende reguläre Serverstart führt die versionierte Migration aus.

`progression.version = 1` protokolliert ursprüngliche XP, ursprüngliche Stufe und den einmaligen Ausgleich. Beispiel: alte 1.350 XP bedeuteten Stufe 10; die neue Schwelle für Stufe 10 beträgt 3.060 XP, daher werden einmalig 1.710 Migrations-XP separat vermerkt. Höhere schon gespeicherte XP bleiben erhalten. Wiederholtes Laden oder Migrieren zahlt den Ausgleich nicht erneut aus.

Der bisherige Weltbezeichner `falkenried-2` bleibt die Identität der Basiswelt. `regionVersion = 3` und `worldSeed = 71493` kennzeichnen die neue deterministische Erweiterung. Die ältere, bereits vorhandene Umstellung der historischen Rasterwelt `falkenried-1` bleibt als vorgelagerte Migration erhalten. Diese neue Erweiterung verschiebt keine Standorte der bisherigen organischen Welt.

Aktive alte Fahrten werden anhand ihrer bisher gültigen zeitlichen Streckeninterpolation an der tatsächlichen gespeicherten Position übernommen. Verbleibende Strecke und ETA werden neu geplant. Bei noch laufender Alarmierung bleibt die restliche Ausrückzeit erhalten. Pannen bleiben am Pannenort und setzen nach Reparatur mit dem neuen Profil fort. IDs, Aufträge, FMS-Verlauf und Belohnungsbelege bleiben erhalten; die Migration löst keine zweite Ankunft oder Belohnung aus. Der etablierte Server-Neustart setzt an der gespeicherten Simulationszeit fort; abgeschaltete Server rechnen ihre Ausfallzeit nicht ein zweites Mal an.

## Welt und Bedienung

Die Fläche misst exakt **100.000 × 100.000 Meter = 10.000 km²**. Eine unveränderte Welteinheit entspricht 12 Metern; jede Achse reicht von 0 bis 100.000/12. Zoom verändert nur die Darstellung. Alle 1.959 bisherigen Straßenknoten bleiben einschließlich Reihenfolge und Koordinaten unverändert. Ihr SHA-256 über die ursprüngliche JSON-Liste lautet `18994f4732e0236739b7f2ac91d88a35ce2f1d20a3c772a8c14506a8dd866aa0` und wird geprüft.

Die Region enthält jetzt 6.527 Knoten, 250 benannte Straßen und 6.718 Abschnitte. 28 zusätzliche Orte ergänzen die bisherigen zehn Regionalorte und Falkenried. Verbindungsstraßen, alternative Schnellstraßen, unregelmäßige Ortsstraßen, Gewerbezufahrten, Felder, Waldflächen und straßenorientierte Gebäude füllen die Erweiterung. Es werden keine Kilometer durch Hochskalieren alter Straßen erzeugt. Neue Anschlüsse verbinden sich an festgelegten gemeinsamen Knoten. 107 geometrische Kreuzungen ohne gemeinsamen Knoten werden ausdrücklich als Überführungen gezeichnet; bloßes Überkreuzen verbindet dort keine Straßen.

Die Karte bietet Objekt- und Ortssuche über die tatsächlichen Daten, Organisations-/Objekt-/Statusfilter, Filterrücksetzung, Gesamtübersicht, eigene Wachen, Auswahlzentrierung, bewussten Fahrzeug-Folgemodus mit Abbruch bei manueller Bewegung, zoombereinigten Maßstab, markierte Gebietsgrenzen, gesonderte Fahrtdetails und hervorgehobene ausgewählte Routen. Fahrzeuggruppen werden bei kleiner Übersicht zusammengefasst und beim Vergrößern aufgelöst. Die Fuhrparkliste kann Fahrzeuge auf der Karte auswählen. Bauplätze erfordern Vorschau und Bestätigung; Stufe, Geld, Hafenlage, Belegung, Gebiet und Straßenanschluss werden in Oberfläche und Server geprüft. Verbindungsverlust zeigt den letzten bestätigten Stand und sperrt Käufe.

Statische Geometrie entsteht einmal beim Laden. Straßen-/Objektsuche verwendet räumliche Indizes, Häuser werden nur im relevanten Ausschnitt und Detailgrad gerendert. Die Suche lädt keine fremden Leitstellendaten nach. Das Backend simuliert auch außerhalb des sichtbaren Ausschnitts. Eine ausgeblendete mobile Karte mit Größe null löst keine unbeschränkte Indexabfrage aus.

## Straßen, Fahrzeugprofile und Zeit

Abschnitte besitzen stabile Knotenpaar-IDs, Geometrie, Meterlänge, Straßenart, Richtung, Zugangsart und numerische Limits. Die fiktiven Weltregeln sind 30 km/h auf Wohnwegen, 50 km/h auf Stadtstraßen, 80 km/h auf Landstraßen und 100 km/h auf Schnellstraßen. Das sind gekennzeichnete Spielwerte, keine verifizierten Realwelt-Schilder. Die Welt verwendet beidseitig befahrbare Straßen; der gerichtete Routingkern prüft auch einseitige Testgraphen und nicht erlaubte Kanten. Es werden keine nicht vorhandenen Abbiegeverbote behauptet.

Straßenfahrzeuge besitzen Höchstgeschwindigkeiten von 90 km/h (schwere Fahrzeuge), 110 km/h (RTW/KTW und entsprechende Transportfahrzeuge) oder 120 km/h (NEF, Funkstreife, ELW). Schwere Fahrzeuge beschleunigen mit 0,9 m/s², leichte mit 1,5 m/s²; die modellierte Bremsverzögerung beträgt 2 m/s². Diese Werte sind zentrale Simulationsannahmen. Die Zielgeschwindigkeit ist das Minimum aus Straße und Fahrzeug, vermindert durch konkret modellierte Wetter-/Verkehrsbedingungen. Normalfahrt und Sonderfahrt ignorieren standardmäßig keine Straßenlimits. Ein freier 80er-Abschnitt wird nach der Beschleunigung mit 80 km/h gefahren.

Der Routingkern minimiert Abschnittsfahrzeiten und bekannte Verzögerungen. Ein binärer Heap, räumliche Projektion auf angebrochene Abschnitte und ein begrenzter Cache ersetzen die bisherige wiederholte Sortierung nach kürzester Geometrie. Cache-Schlüssel enthalten Endpunkte, Fahrzeuggrenze, Bewegungsart, Wetter-/Verkehrsfaktor, gesperrte Richtungen und Verzögerungen. Nicht erreichbare Verbindungen werden nicht durch Luftlinienfahrten ersetzt. Bei zeitweiligen Sperren wird am bisherigen Ort auf die nächste mögliche Freigabe gewartet.

`motionVersion = 1` speichert analytische Beschleunigungs-, Konstantfahrt-, Brems- und Wartephasen. Geschwindigkeitswechsel werden vorausberechnet; das Fahrzeug bremst vor niedrigeren Limits. Technische Segmentgrenzen erzeugen keinen unnötigen Halt. Gemeldete Wartezeiten liegen am betreffenden Straßenabschnitt. Die früheren versteckten zufälligen Verzögerungsaufschläge entfallen. ETA, Wegstrecke, Kilometerzähler, FMS-Ankunft und Kartenposition benutzen dasselbe Profil. Die Simulationsschritte berücksichtigen Ankunft innerhalb eines Updates; verbleibende Updatezeit geht nicht verloren. Numerische Referenztests verwenden eine Toleranz von 10⁻⁸ Sekunden beziehungsweise Metern, Integrationsstrecken tolerieren kleine Gleitkommaabweichungen bis 10⁻⁵ Meter.

AAO-Vorschläge berücksichtigen Fahrzeit und geschätztes Ausrücken. Die Oberfläche weist diese Zeiten getrennt aus. Die spätere Quittierung einzelner FF-Mitglieder bleibt naturgemäß Teil der Simulation. Krankenhausvorschläge rechnen über Straßen; ohne konkretes Transportfahrzeug dient ein RTW-Profil als Schätzung. Private Pkw-Anreise der FF verwendet ebenfalls das leichte Straßenprofil; Fahrrad und Fußweg behalten passende eigene Geschwindigkeiten. RTH und Boot behalten ihre getrennten Luft-/Wasserwege. Die Betriebszeit bleibt 1×; der Browser glättet nur bestätigte Fahrten.

## Nachweise und Grenzen

Automatisierte Prüfungen decken Referenzfahrzeiten 30/50/60/80/100/120 km/h, die gemischten 864 Sekunden, echte 80 km/h, vorausgehendes Bremsen, Segment- und Tickgrößen, gerichtete schnelle Umwege, Sperren, Wartephasen, Migration, Pannen, persistente Käufe und Levelübergänge ab. Bestehende Logik-, Server-, Sicherheits-, Wiederverbindungs-, Kooperations-, CLI- und Browserprüfungen werden weiter ausgeführt. Den final tatsächlich ausgeführten Stand dokumentiert [ABNAHME-2.12.md](ABNAHME-2.12.md).

Der zusätzliche Rechnerbenchmark verwendet 500 Fahrzeuge, davon 120 lange Fahrten, 120 Routensuchen und 100 Positionsläufe. Der Browserbenchmark verwendet 100 Wachen, 500 Fahrzeuge, 100 aktive Fahrten und 40 Einsätze. Messungen sind lokale Ergebnisse eines Windows-Rechners mit i7-13700K und Node 24.19.0, keine Zusicherung für beliebige AMP-Hardware. Große vollständige Zustandsnachrichten bleiben umfangreich; WebSocket-Kompression ist aktiviert, eine komplette Umstellung des bestehenden Übertragungsprotokolls auf Delta-Nachrichten ist nicht Bestandteil dieser Änderung.

Die Welt bleibt fiktiv und prozedural; es gibt keine echte Hausnummern-Geodatenbank, keine externen Kartenkonten und keine erfundenen Suchergebnisse. Wetter-/Verkehrswerte, Beschleunigung und Tempolimits sind Spielannahmen. Die Basiskarte enthält keine gesonderten Einbahn- oder Abbiegeverbotsdaten. Auf extreme Last durch sehr viele gleichzeitig verbundene Leitstellen wurde nicht geschlossen. Produktionsdaten, AMP-Port, Reverse Proxy und laufende Produktionsbereitstellung werden durch diesen Auftrag nicht verändert.
