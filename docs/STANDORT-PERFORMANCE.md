# Standortabfragen: Fehlernachweis und Prüfung von 2.26.1

Ausgangsstand: `d697cefdb4a0a15b35348c6c12403d45a9cf9ec0`, Version 2.26.0.
Messungen am 13.09.2026 lokal unter Windows, Node 24.19.0, Edge über Playwright,
Produktionsbuild mit MapLibre 6.8.0. Keine Messung auf dem privaten AMP-Server.
Das dort laufende Spiel und seine Daten wurden nicht verändert.

## Nachgewiesene Ursachen

- Eine Ziehbewegung mit 300 Pointerbewegungen löste im gebauten Spiel 301
  Standortanfragen aus. Der eigene `panBy(duration: 0)`-Pfad endet bei jedem Schritt;
  der bisher unmittelbar an `moveend` gebundene Abruf lief entsprechend oft.
  Das gemeinsame Standortbudget von 240/min war aufgebraucht, einschließlich
  der anschließend geöffneten Suche. 61 Antworten waren HTTP 429.
- Abbrüche verhinderten die bereits gestartete Serverarbeit nicht zuverlässig.
  Sehr genaue Bounds und ungerundeter Zoom lieferten kaum wiederverwendbare Schlüssel.
- Cluster benötigten bisher `viewForActor` und damit eine Gesamtansicht einschließlich
  Spielständen. Der neue HTTP-Regressionstest verbietet `Game.view` ausdrücklich:
  Cluster, Suche und Details bleiben trotzdem erreichbar.
- Alte allgemeine Kartenfehler konnten bei Cachetreffern stehen bleiben.
- Die SQL-Detailcluster begrenzten bei hoher Dichte auf 2.000 Zeilen. Die Lastfixture
  enthielt im dichten Ausschnitt 20.027 Einrichtungen; vorher wurden nur 2.000
  repräsentiert. Nachher sind alle 20.027 in diesem Ausschnitt enthalten.

Authentifizierung, Spielaktionen und Standortabfragen hatten bereits getrennte
Schlüssel. Die bestehenden RTree-/FTS-Indizes sowie der Canvas-Layer waren vorhanden
und bleiben erhalten. Es wurde kein vollständiger Deutschlanddownload pro Login gefunden.

## Änderungen und Grenzen

Der gemeinsame Leser bündelt nach 250 ms, holt bei fortgesetzten neuen Anforderungen
spätestens nach einer Sekunde einen Zwischenstand und startet höchstens alle 500 ms.
Ein aktiver Abruf und eine jüngste Anforderung ersetzen parallele Abbruchsserien.
Ein räumlicher Randpuffer und ganzzahlige Zoomgruppen vermeiden weitere Abrufe im
bereits abgedeckten Gebiet. Der Layer hält 24 Ausschnitte; neue Katalogstände leeren
seinen Cache. Private Angebote werden nicht gemeinsam gecacht. Ausblendung und
Demontage stoppen anstehende Arbeit. Alte Antworten überschreiben keine neuere Auswahl.

Der Server hält höchstens 32 statische Clusterausschnitte pro geöffnetem Katalog und
32 Statementformen. Kleine Ausschnitte verwenden den vorhandenen räumlichen Index.
Überfüllte Detailausschnitte werden räumlich zusammengefasst statt abgeschnitten.
Listen liefern bis zu 80 kompakte Angebote und eine nächste Seitenposition; erst
die Einzelansicht lädt Quellen und Zufahrtdetails. Geld-/XP-Änderungen lösen erst
beim Wechsel relevanter Kaufgrenzen oder des Besitzes eine neue Angebotsabfrage aus.
Käufe bleiben unveränderte autoritative, atomare Aktionen.

| Arbeitsbereich pro Benutzer | Budget pro Minute |
| --- | ---: |
| Standortkarte | 240 |
| Standortsuche | 120 |
| Standortdetails | 120 |
| Standortlesen insgesamt | 480 |

Die Kartenobergrenze bleibt auf dem bisherigen Wert: Der Leser benötigt selbst bei
fortgesetztem Wechsel höchstens 120 Starts/min pro Layer; normale gepufferte Bewegung
liegt erheblich darunter. Zwei gleichzeitig aktiv bediente Karten-Tabs teilen das
Benutzerbudget. Such-/Detailarbeit bleibt separat begrenzt. Beliebig viele aktiv
automatisierte Tabs sind keine unbegrenzte Freistellung. Authentifizierungs-, Konto-,
Schreib-, Chat- und Präsenzbudgets bleiben bestehen.

`RateLimitError` liefert begrenzten öffentlichen Scope, `RATE_LIMITED`, Ablauf und
`Retry-After`. Abgewiesene Anfragen verlängern das Fenster nicht. Nur die jüngste
Leseabsicht wird höchstens zweimal nach Wartezeit plus 100–300 ms Versatz wiederholt;
es gibt keine automatische Schreibwiederholung. Eine Standortdrosselung meldet den
Spieler nicht ab und trennt den Socket nicht. Gedrosselte Logs enthalten einen
prozessbezogen pseudonymisierten Bucket, Scope, Budget, Wartezeit und Korrelations-ID.
IP-Adressen, Cookies, Tokens und Spielstände werden nicht protokolliert.

`X-Real-IP` wird ausschließlich von exakt vertrauten unmittelbaren Proxyadressen
übernommen. IPv4, IPv6 und IPv4-mapped IPv6 werden normalisiert; Listen, beliebiger
Text und Zonenangaben werden verworfen. Keine privaten Netzbereiche wurden pauschal
freigegeben. Es gibt keinen Anlass, die funktionierende private Konfiguration auf
Verdacht zu ändern.

Clusterantworten verwenden private 30-Sekunden-Caches und ETags; Angebote bleiben
`no-store`, ebenso Fehlerantworten. Größere Standortantworten werden bei akzeptiertem
Gzip asynchron komprimiert. Dafür ist keine Änderung einer bestehenden Caddy-Datei
nötig. Die AMP-Abnahme prüft diese Antwort einschließlich 304 und Gzip durch den
kontrollierten echten Caddy; ebenso weiterhin TLS, Cookies und WebSocket/Polling.

## Vergleich im gebauten Browser

Identische Folge: Anmeldung, Spieleinstieg, 300 Mausbewegungen mit 16-ms-Pausen,
Loslassen, Standortliste öffnen und nach Berlin suchen. Die reale Anwendung bedient
HTTP und MapLibre; es werden keine erfolgreichen API-Antworten gemockt.
Für die größere Messung wurde allein der Standortkatalog durch 50.000 deterministische
synthetische Einrichtungen ersetzt. Basiskarte/Routing bleiben begrenzte Testdaten.

| Messgröße, Katalog mit 50.000 Einrichtungen | 2.26.0 | Fix |
| --- | ---: | ---: |
| Gestartete Standortanfragen | 301 | 2 |
| Abgebrochene Anfragen | 1 | 0 |
| Erfolgreiche HTTP-Antworten | 239 | 2 |
| HTTP 429 | 61 | 0 |
| Gelesene JSON-Antwortbytes, dekomprimiert | 1.269.050 | 28.115 |
| HUD sichtbar, ab Navigation | 891 ms | 1.043 ms |
| Kartenkamera verfügbar | 1.133 ms | 1.055 ms |
| Erste erfolgreiche Clusterantwort | 1.125 ms | 1.437 ms |
| Suche nach der Ziehfolge erfolgreich | nein, 429 | ja |
| API P50 / P95 bis Antwortkopf | 1 / 2 ms | 17 / 17 ms |
| Lange Browseraufgaben / Gesamtdauer | 4 / 355 ms | 5 / 416 ms |
| Canvas-Anzahl | 3 | 3 |
| DOM-Änderungsereignisse | 4.481 | 3.808 |
| JS-Heap am Ende, einzelne Stichprobe | 34,99 MB | 29,59 MB |
| `db.all`-Aufrufe im gesamten Lauf, einschließlich Simulation | 308 | 32 |

Die Verbesserung ist die verhinderte Anfrageflut und funktionierende Suche. Diese
Einzelmessung belegt **keine allgemeine Beschleunigung jeder Antwort oder des ersten
Bildes**: Das anfängliche Bündeln benötigt absichtlich etwas Zeit. P50/P95 über zwei
Antworten ist nicht statistisch mit 301 Abfragen vergleichbar. Die alte Suche zeigte
einen Fehler statt einer Ergebnisliste; End-DOM und Heap sind deshalb ebenfalls nicht
gleichartige Inhalte. Die Long-Task-Werte zeigen hier keine Verbesserung. Keine
unbelegten Aussagen über React-Commitzeiten oder Produktionslatenzen.

Mit dem üblichen kleineren Browser-Testkatalog ergab die gleiche Folge ebenfalls
301 → 2 Anfragen und 61 → 0 Sperrantworten. Der Test kontrolliert zusätzlich, dass
der zuletzt geladene Ausschnitt die endgültig sichtbaren Bounds abdeckt.

## Separate SQL-Lastmessung

50.000 synthetische Einrichtungen, davon 20.000 dicht in Berlin. Je 50 identische
Deutschland-/Stadtabfragen, danach 100 unterschiedliche kleine Ausschnitte. Die
Wiederholungen prüfen ausdrücklich den Cache; sie sind keine kalten Einzelabfragen.

| SQL-/Cache-Messgröße | Vorher | Nachher |
| --- | ---: | ---: |
| Deutschland, P50 / P95 | 128,97 / 143,48 ms | 0,0005 / 0,0106 ms |
| Dichter Ausschnitt, P50 / P95 | 13,57 / 15,77 ms | 0,0005 / 0,0034 ms |
| Unterschiedliche kleine Ausschnitte, P50 / P95 | 0,206 / 0,379 ms | 0,175 / 0,263 ms |
| Einzelne FTS-Suche, 80 Ergebnisse | 8,42 ms | 8,78 ms |
| Im dichten Ausschnitt repräsentierte Einrichtungen | 2.000 | 20.027 |
| Dichte Clusterantwort, unkomprimiert | 238.804 Bytes | 2.519 Bytes |

`EXPLAIN QUERY PLAN` bestätigt RTree `VIRTUAL TABLE INDEX 2:B0D1B2D3`, danach den
Primärschlüsselzugriff auf `facilities`; die Suche nutzt FTS `INDEX 0:M3` und ebenfalls
Primärschlüsselzugriffe. Gruppierung/Sortierung verwenden temporäre B-Bäume. Bei dem
absichtlich ohne Pausen ausgeführten synchronen Messburst sank die maximale beobachtete
Event-Loop-Verzögerung von 7.399 auf 178 ms. Das ist ein Batch-Benchmark und keine
gemessene Verzögerung eines normalen Spielers. Der kalte Deutschlandabruf bleibt eine
räumliche Aggregation; sein Aufwand wird nicht als Cachetreffer ausgegeben.

## Reproduzierbare Prüfungen und Lieferung

- `tests/facility-reads.test.ts`: Scope-/Benutzertrennung, Ablauf ohne Verlängerung,
  Proxyprüfung, Kaufkontext, Serialisierung, veraltete Antworten, Retry-After und Abbruch.
- `tests/facility-http.test.ts`: echte HTTP-Antworten, verbotene Gesamtansicht,
  getrennte Benutzer hinter derselben Adresse, ETag, Gzip, 429 und unveränderte Kaufsperre.
- `tests/facility-catalog-load.test.ts`: 6.000 Einrichtungen in CI, vollständige
  Clusterzahlen auch über der bisherigen Grenze und disjunkte Folgeseiten.
- `tests/e2e/facility-performance.spec.ts`: echte Pointerfolge und echte kurzzeitig
  ausgeschöpfte Serverbegrenzung, Wartezeit, erfolgreiche Erholung, unveränderte Sitzung.
- Bestehende Standort-/Kartenprüfungen kontrollieren zwei unabhängige Käufer,
  Bestätigung, Besitz, Wiederverbindung, Neustart, Markerdrag und Pixeldichte.
- Die vollständige Freigabepipeline prüft daneben Simulation, Transporte, Buchungen,
  Sicherheitsregeln und das echte Linux-/AMP-Laufzeitpaket. Maßgeblich ist der
  tatsächliche erfolgreiche Lauf für den veröffentlichten Commit, nicht dieses Dokument.

Die größere Browserprobe ist gezielt über `PERF_FACILITIES=50000` zuschaltbar;
der Vergleichsbuild über `PERF_BUILD_DIR`, die reine Vorhermessung über
`FACILITY_BASELINE=1`. Ergebnisse liegen lokal unter `.tools/facility-*.json`.
Diese Schalter gehören ausschließlich zu Testdateien und sind kein Produktmodus.

Es ist keine Datenmigration erforderlich; Datenbankschema 26 bleibt unverändert.
Auslieferung als neue Patchversion 2.26.1 über die vorhandene Release-/AMP-Updatekette.
Version 2.26.0 wird nicht überschrieben. Kein Reset, keine zweite Installation und
kein automatisches Update des privaten Servers durch einen Git-Push.
