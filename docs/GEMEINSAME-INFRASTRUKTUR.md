# Gemeinsame Infrastruktur ab 2.29

## Spielablauf

Serverzeit und Wetter, Budget sowie Rang/Level/XP stehen in drei zusammenhängenden Statuskarten. Die aktive Einsatzliste bleibt darunter. Fachliche Entscheidungen, Patienten und Nachforderungen stehen weiterhin in den Einsatzdetails unter „Lage & Aufgaben“. Der separate Funk-/Ereignisbereich entfällt. Hinweise sind auf eine sichtbare Nachricht und eine kurze Warteschlange begrenzt, verschwinden nach 3000 ms ab Einblendung und quittieren keine Aufgaben. Offline bleibt im Leitstellenmenü erkennbar; dort liegen Wiederverbindung und Hilfe.

Maus, Mausrad und Karten-Tastatursteuerung bleiben erhalten. Suche und Filter sind unter „Suchen …“ erreichbar. Zusätzliche Spielmarker und deren Trefferflächen erscheinen nur, wenn der passive metrische Maßstab 200 m oder weniger anzeigt. Maßstab und Sichtbarkeit verwenden dieselbe Projektion und Bezugspixelbreite, unabhängig von Breitengrad und Fenstergröße. Routengeometrie und Basiskartenbeschriftung bleiben auch in der Übersicht sichtbar.

Ein kanonischer Wachstandort hat einen Eigentümer in der Serverwelt. Quellalias und Organisation gehören zur Identitätsprüfung; zwei Organisationen auf demselben Gelände können verschiedene Einrichtungen sein. Der Kauf beansprucht den Standort und bucht den bisherigen regulären Preis in derselben Transaktion ab. Ein zweiter Käufer verliert kein Geld. Öffentlich sind Standort, Organisation und der öffentliche Benutzername des Eigentümers. Besitz bleibt bei Logout und Neustart erhalten; daraus entstehen keine fremden Verwaltungs- oder Dispositionsrechte.

Krankenhäuser gehören dem Server. Sie sind weder kaufbar noch ausbaubar und zählen nicht als private Wachen oder Fahrzeugdepots. Standortsuche und Transportzielauswahl zeigen gemeinsame Kapazität, belegte und reservierte Plätze. Fehlende belastbare Kapazitätsdaten werden als stabile **Spielprofile** kenntlich gemacht; dies sind keine echten Krankenhausbelegungen. Laut Quelle fehlende Notaufnahme wird berücksichtigt. Geerbte Überbelegung bleibt ausdrücklich sichtbar und verhindert neue Aufnahmen, bis genügend Plätze frei sind.

Versorgte Patienten erhalten ein geeignetes erreichbares Ziel und einen verbindlichen Platz, steigen in ein passendes Fahrzeug und werden nach tatsächlicher Fahrt übergeben. Aufnahme wird einmalig gebucht; die bestehende Behandlungssimulation entlässt später nach Serverzeit. Reservierungen überstehen lange Anfahrt, Logout und Neustart ohne pauschales Zeitlimit. Zielwechsel tauscht Platz und Route atomar ab der aktuellen Fahrzeugposition. Bei fehlender Aufnahme bleiben Patienten versorgt vor Ort; die nächste begrenzte Alternativprüfung erfolgt nach 30 Sekunden. Die manuelle MANV-Zielwahl erhält Vorrang unter den geeigneten Zielen.

## Löschwasser und Datenqualität

Das unveränderliche Zusatzpaket unter `data/water/` enthält kartierte Hydranten und Saugstellen desselben OSM-Stands wie das Deutschlandpaket. Quell-IDs, Eigenschaften, Datenstand, Lizenz und Prüfsummen liegen bei. Hydrantenschilder und Einspeisungen werden nicht zu eigenständigen Entnahmestellen erklärt. Das mitgelieferte Paket enthält 919.518 Quellpunkte; 526 außerhalb der verwendeten Deutschlandgrenze werden beim Indexieren ausgeschlossen.

Unvollständige OSM-Erfassung bedeutet unbekannt. Versionierte deterministische Ergänzungen berücksichtigen Siedlung, tatsächliche Bebauung und geeignete Straßen. Innenstadt, Wohngebiet, Gewerbe, Dorf, Hof und unbebautes Land haben unterschiedliche Spieldichten. Reale Quellen haben Vorrang. Wasser-, Gebäude-, Schienen- und Autobahngeometrie verhindert ungeeignete simulierte Zugänge. Ergänzungen tragen ausdrücklich „Simulation“, unbekannte Förderwerte werden als endliche Spielwerte bezeichnet. Es gibt keine Aussage über gesetzliche Mindestabstände oder reale gemessene Wasserleistung.

Die Quellenübersicht prüft nicht vorsorglich jede einzelne Zufahrt. Erst Detailauswahl oder tatsächliche Nutzung prüft den Zugang; die Simulation verwendet geprüfte Quellen. Erreichbarer Leitungsweg, Schlauchbestand, Pumpe, Aufbauzeit, Liter pro Minute und Liter Tankinhalt wirken zusammen. Mehrere Verbraucher teilen die begrenzte Quellleistung. Tanker fahren zur geeigneten Nachfüllstelle und zurück; währenddessen löschen sie nicht am Einsatz. Eine Heimatwache ist keine automatische unbegrenzte Nachfüllquelle. Kleine Anfangsflotten erhalten nur hinsichtlich ihrer Wasserausstattung tragfähige Aufgaben.

Das Zusatzpaket ist etwa 17,4 MB groß. Es wird beim regulären AMP-Update mitgeliefert und einmalig pro Prüfsumme lokal indexiert. Der vollständige Deutschlandbestand wird nicht neu importiert. Abfragen verwenden begrenzte räumliche Caches; abgebrochene Kartenausschnitte stoppen ihre weitere Bearbeitung. Schutzbudgets, Anmeldung und bestehende Ratenlimits bleiben aktiv.

## Migration und Betrieb

Normale Updates verwenden den bestehenden AMP-Updateweg. Schema 28 ergänzt exklusiven Besitz und Quellenalias, gemeinsame Klinikplätze, dokumentierte einmalige Erstattungen und gemeinsamen Wasserverbrauch. Es gibt keine neue Instanz, Datenpfadänderung oder Rücksetzung.

Vor der fachlichen Übernahme entstehen eine konsistente SQLite-Sicherung und `infrastructure-migration-preview.json` im bestehenden privaten Datenbereich. Der Ablauf erfolgt vor Spielerfreigabe. Die Vorschau zählt Besitzfälle, Fahrzeuge/Personal, Patienten, Transporte und Betten. Der früheste eindeutig belegte ursprüngliche Kauf erhält bei Doppelbesitz Vorrang. Tatsächlich belegte Kauf-/Ausbaukosten anderer Kopien und bisheriger Privatkliniken werden einmal erstattet. Fehlende, widersprüchliche oder zeitlich gleichrangige Kaufbelege werden nicht durch erfundene Werte ersetzt.

Erhaltene Fahrzeuge, Ausstattung und Personal können zunächst an einer ausdrücklich nicht operativen Migrationsreserve hängen. Sie werden nicht gelöscht oder teleportiert. Die Reserve hat keine Eigentumsrechte am fremden Standort, erzeugt keine Einsätze und stellt keine neue Schattenwache dar. Eigene passende Kapazität über die vorhandene Fahrzeugverwaltung zuordnen. Laufende Patientenfahrten und ihre Reservierungen bleiben bestehen. Alte Klinikreferenzen werden zusammengeführt; eine kleinere neue Kapazität löscht keine übernommenen Patienten.

`INFRASTRUCTURE_MIGRATION_REQUIRED` bezeichnet einen belegpflichtigen Ausnahmefall. Der Server aktiviert die widersprüchliche Übernahme nicht. Der Paketstarter behält seinen bestehenden Sicherungs-/Rückfallweg. Zuerst die konkrete private Vorschau prüfen. Kein neuer Reset und kein Löschen von Datenbanken oder Reservierungen.

Für eine gezielte Betreiberprüfung bei gestoppter Spielinstanz stehen im installierten Anwendungspaket zur Verfügung:

```text
node dist/server/cli.js infrastructure-preview
node dist/server/cli.js infrastructure-preview --resolutions /absoluter/privater/belegentscheidungen.json
node dist/server/cli.js infrastructure-migrate --resolutions /absoluter/privater/belegentscheidungen.json --confirm
```

Der erste Befehl liest ausschließlich. Der dritte benötigt eine zuvor geprüfte widerspruchsfreie Vorschau und erstellt vor der Transaktion eine weitere verifizierte Sicherung. Eine belegte Entscheidung besteht aus `owner`, `building`, `purchasedAt` (Serversekunden), `paidCents` und einer konkreten `evidence`-Beschreibung. Diese Datei ist nur für tatsächliche Ausnahmefälle erforderlich, keine normale Updatekonfiguration. Keine IDs, Daten oder Beträge aus Beispielen übernehmen. Gleichbleibende Wiederholung erzeugt weder weitere Erstattung noch neue Besitzrechte. Falls bereits die reale Standortbindung ungeklärt ist, benennt die Vorschau den vorhandenen vorgeschalteten Standortprüfweg.

## Prüfungen und Messgrenzen

Lokaler Abnahmestand für 2.29: Typecheck, Lint, Struktur-/Formatprüfung und Release-Build erfolgreich; vollständiger Logiklauf mit der vorgesehenen Begrenzung auf zwei Prozesse: 1395 bestanden, 3 vorhandene Prüfungen übersprungen, 0 Fehler. Zusätzlich 14 Betriebstests bestanden. Der breite Edge-Lauf und gezielte Nachprüfungen decken sämtliche 121 aktuellen Chromium-Abläufe ab. Standort-/Klinikrennen und Menü-/Kartenmessung wurden anschließend nochmals gegen den abschließenden lokalen Build geprüft. Ein verzögerter Moduldownload prüft zusätzlich, dass der Schließen-Knopf des Notrufdialogs beim Laden nicht springt. Die genaue Freigabe in beiden Browsern und für die ausgelieferten Paketbytes erfolgt zusätzlich durch den bestehenden CI-/Releaseprozess am veröffentlichten Commit.

Die neuen Prüfungen decken konkurrierenden Standortkauf, Aliaswechsel, fremde Verwaltung, gemeinsamen letzten Klinikplatz, Zielwechsel ab laufender Position, Mehrpatiententransporte, Neustart, Entlassung, Kontolöschung mit belegtem Bett, Migration zweimal, Geometriehindernisse und deterministische Wasserverteilung ab. Die Browserabnahme verwendet das tatsächlich gebaute Produkt und kleine ausdrücklich synthetische Geografie-/Routingfixtures. Diese zeigen Bedienung und Zustandsübergänge; sie sind kein Beleg für jede reale deutsche Zufahrt.

Lokale Vergleichsmessung derselben Standort-Panning-Sequenz mit anschließender Suche:

| Beobachtung                                                   | Vorher (2.28) |    Nachher |
| ------------------------------------------------------------- | ------------: | ---------: |
| Standortabfragen                                              |             2 |          1 |
| Dekodierte Standortantworten insgesamt                        |      20.101 B |   19.956 B |
| HUD sichtbar                                                  |       1291 ms |    1051 ms |
| Kartenfläche bereit                                           |       1375 ms |    1108 ms |
| DOM-Knoten                                                    |           875 |        737 |
| Lange Browseraufgaben, Dauer insgesamt                        |    5 / 435 ms | 3 / 183 ms |
| Alle gelesenen HTTP-Antworten einschließlich Anwendungspakete |            38 |         40 |

Die zusätzliche Markerübersicht fordert oberhalb der 200-m-Schwelle keine Standort-/Hydrantendetails an. Die gemessene einzelne Standortabfrage ist die ausdrücklich ausgelöste Suche. Diese lokalen Einzelmessungen sind keine garantierten Ladezeiten; Browsercache, Dateisystemcache und gleichzeitig laufende Prüfungen beeinflussen sie. Die Erhöhung der gesamten Anwendungsladevorgänge ist ausdrücklich getrennt von Marker-Polling ausgewiesen. Getestete echte 429-Antworten behalten ihre Wartezeit und blockieren nicht die Sitzung.

Bei einer ergänzenden schreibfreien Messung gegen den vollständigen lokalen Deutschlandbestand sank die erste Wasserquellenübersicht um Berlin mit 1 km Radius von 57.357 ms auf 200 ms. Sie lieferte 338 Punkte (335 kartierte Quellen), 202.213 dekodierte Bytes; aus Cache rund 0,7 ms. Bei 4 km: 3892 Punkte, 2.337.315 dekodierte Bytes, rund 2500 ms verteilt auf abbrechbare Arbeitsschritte, aus Cache rund 14 ms. Der vorherige Ablauf prüfte alle Einzelzugänge; der neue Überblick verschiebt diese Prüfung an die Detail-/Nutzungsstelle. Der reine Vergleich bedeutet deshalb nicht, dass 338 Zufahrten in 200 ms geprüft wurden. Er verhindert, dass der Überblick die Simulation dafür lange blockiert. Erstindexierung des Zusatzpakets lokal 10,7 s, geprüfte Wiederverwendung 17 ms.

Die private AMP-Instanz, dortige Hardware und alle realen Zufahrten wurden durch diese lokalen Prüfungen nicht verändert oder vollständig geprüft. Veröffentlichung eines Releases ist kein Nachweis, dass der Betreiber es bereits installiert hat.

Die gemeinsame Klinikabnahme in zwei angemeldeten Browserfenstern einschließlich erneuter Öffnung nach Serverrestart las insgesamt 14 Standort-/Klinikantworten mit 128.866 dekodierten Bytes; die langsamste einzelne Antwort benötigte lokal 98 ms. Die Sequenz enthält gezielte Suche, Detailöffnung und zwei ausdrückliche Kontrollabfragen. Sie ist keine automatische Dauerschleife. Der Maßstabstest mit drei geografischen Breiten und echten Mausbewegungen erzeugte bei 1366 Pixeln 11 gebündelte Markerabfragen (70.361 B), bei 2560 Pixeln 9 (70.760 B); oberhalb der Schwelle wird nicht nachgeladen.

Eine weitere schreibfreie 4-km-Messung gegen den vollständigen Deutschlandbestand unter gleichzeitiger Testlast dauerte 3991 ms und lieferte dieselben 3892 Quellen. Die JSON-Antwort war 2.337.327 B groß, bei gzip 149.794 B. Ein parallel laufender 10-ms-Timer wurde 282-mal bedient; größter gemessener Abstand 44 ms, 95. Perzentil 21 ms. Das misst die Unterbrechbarkeit des lokalen Datenproviders, weder eine HTTP-Health-Antwort noch die Reaktionszeit des privaten AMP-Servers.
