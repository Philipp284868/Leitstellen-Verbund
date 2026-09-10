# Laufzeitmessung des Deutschland-Produkts

## Frisch gemessener Ausgangsstand

Commit `03e9878217292f1879d71a01a7722e87dc14eb1d`, [vollständiger Actions-Lauf 34464694146](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34464694146), Ubuntu und Node 24. Der Lauf dauerte von 10:10:55 bis 10:28:00 UTC: **17 min 05 s**, ohne eine vorherige Warteschlange. Geplant waren 93 normale und zwei Lastfälle je Browser: 190 Fälle, davon tatsächlich 189 bestanden und ein Chromium-spezifischer CDP-Fall in Firefox übersprungen. Der neue Prüfplan weist diese Enginegrenze ausdrücklich aus, statt einen Skip als erfolgreichen Test mitzuzählen.

| Job        | Gesamtdauer | Normale Browserphase | Nachgeschaltete Lastphase |
| ---------- | ----------: | -------------------: | ------------------------: |
| Chromium 1 |       473 s | 387,387 s (47 Fälle) |                   33,55 s |
| Chromium 2 |       556 s | 427,311 s (46 Fälle) |                   33,84 s |
| Firefox 1  |       720 s | 630,896 s (47 Fälle) |                   52,13 s |
| Firefox 2  |       974 s | 875,488 s (46 Fälle) |                   57,92 s |

Einzeltestzeiten und Zuordnung bilden die Anfangsgewichte in `scripts/browser-costs.json`. Die Lastphase enthielt je Start rund 14–20 s Vorbereitung über die eigentliche Testzeit hinaus. Buildjob 44 s, Geodatenjob 38 s, Logik-/Paketjob 369 s. Download, Installation und Artefakttransport sind in den Jobzeiten enthalten, nicht in den Browserphasen. Die parallel laufenden Jobs dürfen nicht zur verstrichenen Gesamtdauer addiert werden.

Windows, Node 24.19.0, derselbe Rechner und vorhandene Abhängigkeiten: alter Doppelbuild kalt 9,647 s, warmer inkrementeller Build 2,339 s, `check:quick` 22,796 s. Kalt bezeichnet hier fehlende Buildausgaben, keinen leeren Paketmanagercache.

## Neues Messverfahren

`docs`, `fast`, `full` und `deep` sind getrennte Profile. `fast` ist ausdrücklich keine vollständige Abnahme. Normale Browserdateien laufen genau einmal je Engine; der isolierte Kartenlastfall gehört zu `deep`. Zwei frühere Lastabläufe sind zu einer gemeinsamen Deutschland-Lastprüfung mit denselben Interaktionsanforderungen zusammengeführt. Der alte Rivermere-Spielablauf ist durch aktuelle Deutschland-Kartensteuerung ersetzt. Deshalb ist der Vergleich ein Vergleich erhaltener Anforderungen, keine Behauptung identischer alter Testschritte.

Jeder Lauf speichert erwartete/ausgeführte Dateien, tatsächliche Fallzahlen und Laufzeiten. Ein Testprozess, fehlende Pflichtdatei, übersprungener Fall oder verlorener Shard erzeugt einen Fehler. Zwei Worker pro normalem Browserjob; Dateien bleiben intern seriell. Die Gewichte werden aus ausgeführten Berichten gepflegt. Installation und Build geschehen einmal; Folgejobs prüfen die Provenienz des weitergereichten Artefakts.

Ziele: lokale Standardrückmeldung unter einer Minute, begrenzte GitHub-Prüfung etwa 2–5 Minuten, vollständige Abnahme deutlich unter dem neu gemessenen 17-Minuten-Ausgangsstand. Das sind Budgets, keine zugesicherten Ergebnisse. Keine Perzentile aus einzelnen Läufen.

## Tatsächlich ausgeführte neue GitHub-Läufe

Auf demselben Windows-Rechner mit Node 24.19.0 wurden ohne nebenläufige Browsertests gemessen: Neubuild ohne vorhandenes `dist` **7,163 s**, warmer inkrementeller Build **3,088 s**, warme Struktur-/Format-/Lint-/Typprüfung **5,908 s**. Abhängigkeiten und Betriebssystemcache waren vorhanden. Entwicklungsanmeldung mit echtem lokalen Deutschlandrouter: **2,840 s**, HMR ohne Neuladen: **88 ms**. Der warme Build ist gegenüber 2,339 s im einzelnen Ausgangslauf etwas langsamer; es wird kein pauschaler Gewinn behauptet. [Umgebung und vollständige Einzelwerte](abnahme-deutschland/local-messung.json).

| Lauf                                                                                                                     | Commit                                     | Profil und Umfang                                                                                                                                  | Verstrichene Zeit |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------: |
| [Vollabnahme 34475766884](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34475766884)                 | `207f9b885aba90fa17b74185c8dcd2451976b6d2` | deep: 1210 Logik-, 16 Node-, 92 Chromium-, 91 Firefoxfälle; zwei Kartenlastfälle; Geodaten, Audit, reproduzierbares Linux-Paket mit Start/Neustart |    **6 min 46 s** |
| [Begrenzte Audioteständerung 34476510590](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34476510590) | `b115785`                                  | fast: 24 Logikfälle, je sechs echte Kernabläufe in beiden Browsern, Struktur/Lint/Typen/Build                                                      |    **3 min 20 s** |

Beide Läufe wurden am 10.09.2026 auf normalen Ubuntu-GitHub-Runnern mit Node 24 ausgeführt, ohne größere Runner oder zusätzliche Retries. Der vollständige Lauf liegt 619 s beziehungsweise rund 60 % unter der frisch gemessenen Baseline. Erhaltene Anforderungen werden auf dem aktuellen Produkt geprüft; es handelt sich wegen der entfernten Altwelt und zusammengeführter Lastabläufe ausdrücklich nicht um identische alte Testschritte. Der Schnelllauf hat einen kleineren Umfang und ist keine Vollabnahme.

Der vollständige Vorbereitungsjob brauchte 60 s: 5 s Installation, 15 s Struktur/Lint, 13 s Typen/Build, 9 s Archivierung und 3 s Buildartefakt-Upload; restliche Zeit entfiel auf Checkout, Planung und Jobverwaltung. Der Logik-/Paketjob brauchte 290 s, davon 246 s Logik, 3 s Node, 26 s Paketprüfung und 4 s Download/Entpacken. Browserjobs einschließlich Einrichtung/Transport dauerten 291–326 s; ihre eigentlichen Aufrufe 243–292 s. Der isolierte Lastjob brauchte 94 s, davon rund 50 s Prüfaufrufe für beide Engines. Der abschließende Gesamtstatus brauchte 12 s. Die Jobs laufen parallel und werden nicht zur Gesamtdauer addiert.

Die Messung enthält auch Test-/Hookzeiten pro Datei. Deren Summen aus diesem erfolgreichen Deutschlandlauf ersetzen jetzt die früheren Altweltgewichte in `scripts/browser-costs.json`. Das derzeitige Budget für eine vollständige normale GitHub-Abnahme beträgt acht Minuten; Überschreitungen werden anhand der Einzelphasen untersucht und nicht durch fehlende Tests kaschiert. Job-Time-outs bleiben als harte Schutzgrenzen großzügiger.

[Maschinenlesbare Messung mit Einzelphasen und Shards](abnahme-deutschland/ci-messung.json). Die früheren Messreihen bleiben [am unveränderlichen Ausgangscommit](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/TESTLAUFZEITEN.md) einsehbar. Diese Links belegen die genannten Messcommits. Eine Releasefreigabe verlangt zusätzlich den erfolgreichen vollständigen Lauf des exakten vorgesehenen finalen main-Commits.
