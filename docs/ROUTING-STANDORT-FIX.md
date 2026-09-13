# Routing und Standortkäufe: Prüfung von 2.26.2

Ausgangsstand: 2.26.1, `b4c2dda49a1844ded263192680876a7af14bffb3`.
Messdatum: 13.09.2026, Windows, Node 24.19.0, Edge/Playwright und Produktionsbuild.
Kein Zugriff auf den privaten AMP-Server, keine Änderung dortiger Daten oder Konfiguration.

## Nachgewiesene Zusammenhänge

Die gemeldeten `ROUTE_UNAVAILABLE`-Zeilen entstehen bei als `no-route` eingeordneten
Routenfehlern. `repeated` zählt zusammengefasste Diagnosewiederholungen, nicht die
Anzahl betroffener Spieler oder gleichzeitiger Einsätze. Die alten Zeilen nennen
weder Endpunkte noch auslösende Aktionen; ihre einzelnen privaten Fälle sind daraus
nicht rekonstruierbar. Die folgenden Fehler wurden unabhängig reproduziert:

1. Negative Verbindungen waren nicht zwischengespeichert. 25 gleiche Fehlversuche
   erzeugten 25 HTTP-Anfragen zum Router. Jeder synchrone Warteabschnitt blockiert
   die Bearbeitung anderer HTTP-/Socket-Aufgaben im Serverprozess.
2. `routePlan` wandelte im automatischen Tick auch einen einzelnen fehlenden Weg
   in einen wartenden Fahrzeugplan um. Die Einsatzortprüfung interpretierte dessen
   Text als generellen Routingausfall. Dadurch wurden weitere Kandidaten nicht
   geprüft. Der neue Regressionstest scheiterte am unveränderten Ausgangsstand.
3. Beim Standortkauf lagen Land- und Uferzugangsprüfungen außerhalb der Behandlung
   alternativer Zufahrten. Ein `no-route` an dieser Stelle brach den gesamten Kauf
   ab. Auch dieser Regressionstest scheiterte vor dem Fix.
4. Die Katalogauswahl konnte alle drei Alternativen an dicht benachbarten Punkten
   derselben Zufahrt verbrauchen. Räumlich andere, bereits belegte Kandidaten werden
   nun bevorzugt; die erste Zufahrt bleibt erhalten.
5. Suchzeit-/Knotenlimits waren als fehlende Verbindung klassifiziert. Eine
   abgebrochene Suche beweist keine geografische Unerreichbarkeit. Fehlerhafte
   Projektionsantworten wurden zudem als weitere erfolglose Kandidaten verschluckt.

Standortkarte, Suche und Detailanzeige rufen den Router nicht auf. Die Anfrageflut
aus 2.26.0 ist in 2.26.1 bereits behoben. Der Zusammenhang mit langsamen Antworten
ist die gemeinsame Serververarbeitung, kein gemeinsamer Ratenzähler und keine
Ursache, die durch Abschalten der Ratenbegrenzung beseitigt werden sollte.

## Verhalten nach dem Fix

- Nur echte Fahrten erhalten weiterhin einen Warteplan. Standortverifikationen
  behalten den typisierten Fehler und versuchen weitere Kandidaten im selben Lauf.
- Land-, Ufer- und Hin-/Rückwegprüfungen verwenden denselben alternativen Zugangspfad.
  Routerausfälle und beschädigte Antworten bleiben Fehler. Es gibt keine erfundene
  Straße, Luftlinie oder automatische Kaufwiederholung.
- Bestätigte Fehlwege werden pro Datenstand und gerichteten Endpunkten für maximal
  30 Sekunden wiederverwendet, unabhängig von der Fahrzeughöchstgeschwindigkeit
  des festen Pkw-Routingprofils. Höchstens 512 Einträge, keine Verlängerung durch
  abgewiesene Lesezugriffe, keine dauerhafte Speicherung. Ausfälle, Sperrungen und
  Datenfehler werden nicht als fehlende Verbindungen gespeichert.
- Routingmeldungen nennen einen begrenzten Prüfbereich und Fehlercode. Rohantworten,
  Koordinaten, Spielerkennungen und Zugangsdaten werden nicht protokolliert.
- Die Detailanzeige erklärt den tatsächlichen Kaufhinderungsgrund. Eine fehlende
  Postadresse bleibt ein Quellenhinweis. Ein Kaufangebot mit belegter Zufahrt wird
  ausdrücklich erst bei Bestätigung auf den Fahrweg geprüft.

## Vergleichsmessungen

### Kontrollierter Router-Fehler mit echter HTTP-Verbindung

Gleiche 25 Aufrufe, synthetischer Router mit fest eingestellten 40 ms Antwortzeit,
produktiver Provider und Worker-Bridge. Keine Produktionslatenzbehauptung.

| Messgröße | Vorher | Nachher |
| --- | ---: | ---: |
| HTTP-Routeranfragen | 25 | 1 |
| Korrekt abgelehnte Fehlwege | 25 | 25 |
| Zeit für die Aufruffolge | 1.536,76 ms | 64,53 ms |
| Verzögerung eines gleichzeitig fälligen 10-ms-Timers | 1.527,02 ms | 54,61 ms |

Der erste bisher unbekannte Fehlweg benötigt weiterhin den Router. Diese Messung
belegt keine allgemeine Beseitigung aller synchronen Wartezeiten. Die Bridge und
die autoritativen SQLite-Transaktionen werden nicht ersetzt.

### Gebautes Spiel mit 50.000 synthetischen Standorten

Anmelden, Spieleinstieg, 300 Pointerbewegungen, Standortliste und Suche.
Die Standortlast ist synthetisch; MapLibre und HTTP laufen in der echten Anwendung.

| Messgröße | 2.26.1 | Fix |
| --- | ---: | ---: |
| Standortanfragen | 2 | 2 |
| HTTP 429 / Abbrüche | 0 / 0 | 0 / 0 |
| Gelesene Antwortbytes, dekomprimiert | 28.115 | 28.115 |
| HUD sichtbar | 1.171 ms | 775 ms |
| Kartenkamera verfügbar | 1.213 ms | 794 ms |
| Erste Standortantwort | 1.588 ms | 1.142 ms |
| Suche anschließend erfolgreich | ja | ja |
| Antwortkopf P50 / P95 | 3 / 3 ms | 4 / 4 ms |
| Lange Browseraufgaben | 5 / 402 ms | 0 / 0 ms |
| JS-Heap, Einzelstichprobe | 30.493.362 Bytes | 48.533.958 Bytes |

Einzelmessungen unterliegen Cache-, Start- und GC-Schwankungen. Es werden keine
garantierten Ladezeiten, kein bewiesener allgemeiner Speichergewinn und keine
statistisch belastbaren Perzentile aus zwei Anfragen behauptet.

### Echte Berliner Einrichtungen und GraphHopper 11

Lokaler vollständiger OSM-Index und Routinggraph, Datenfingerabdruck
`155596c0041a76f05d3b5fb03a36f2b9e26540b517fde8b4b9884c62c4fc1a90`.
Verglichen wurde der tatsächlich mit 2.26.1 ausgelieferte Standortkatalog.
Aus derselben Abfrage wurden zwölf Feuerwachen und zwölf Krankenhäuser geprüft.
Die Kaufaktion lief mit isolierten Spielständen und Testbudget; doppelte Aufrufe
veränderten weder Geld noch Gebäudezahl erneut.

- Ausgangsstand: 19 von 24 Käufen erfolgreich.
- Nur korrigierte Laufzeitbehandlung: 21 von 24 erfolgreich.
- Zusätzlich überarbeitete Alternativenauswahl: 22 von 24 erfolgreich.
- Neu erfolgreich: Alexianer St. Joseph Krankenhaus Berlin-Weißensee,
  DRK Kliniken Berlin – Köpenick und Charité Campus Virchow Klinikum.
- Weiterhin ohne nachgewiesenen Fahrweg: `osm:way:1278502314` und
  DRK Kliniken Berlin Westend (`osm:way:53038853`). Diese zwei Fälle bleiben gesperrt.

Dies ist keine Prüfung jeder Einrichtung Deutschlands. Standorte ohne belegte
Zufahrt benötigen ergänzte geografische Quellen; sie werden nicht pauschal
freigeschaltet. Eine bloße fehlende Postadresse sperrt den Kauf nicht.

## Paket, Bestandsschutz und Regressionen

Der mitgelieferte kleine Standortkatalog wird über den bestehenden Paketprozess
aktualisiert. Alle 40.034 IDs, Quellreferenzen, Namen, Positionen, Typen,
Aktivitätszustände und Hauptzufahrten wurden gegen den alten Katalog geprüft.
6.158 Alternativensätze ändern sich; kein vorhandener Standort wird versetzt.
Alle 28.186 bisherigen Alternativzugänge bleiben zusätzlich erhalten. Pro Kauf
werden höchstens fünf Zugänge versucht: die Hauptzufahrt und bis zu vier
Alternativen. Neue Kandidaten verdrängen keinen bisher hinterlegten Rückfallweg.
Katalogrevision: `2026-09-07-access-2026-09-13`. Der ursprüngliche OSM-Datenstand
bleibt derselbe. Der neue Katalog hat eine geprüfte Integrität und neue Prüfsummen.

Keine Spielstandmigration, kein Reset und kein erneuter Deutschlanddownload.
SQLite-Spielstandschema 26, Konten und laufende Einsätze bleiben erhalten.

Gezielte Regressionen prüfen negative Caches, Ablauf, Begrenzung, andere Richtungen
und Fahrzeugprofile, tatsächliche HTTP-Abfragen, Suchlimits, defekte Antworten,
automatische alternative Einsatzorte und Zugangsausfälle beim Kauf einschließlich
atomarem Bestandsschutz. Importtests prüfen die räumliche Alternativenauswahl.
Die Browserprüfung kontrolliert getrennte Käufer, Bestätigung, Wiederverbindung,
Neustart, Ratenlimit-Erholung und Patientenübergabe.

Die vollständige Release-Abnahme prüft zusätzlich Simulation, Sicherheit, Geodaten,
Linux-/AMP-Paket und kontrollierten TLS-/WebSocket-Betrieb. Maßgeblich sind die
tatsächlichen Ergebnisse im `acceptance.json` des veröffentlichten Releases.
