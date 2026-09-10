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

Neue vollständige Zeiten und der abschließend geprüfte Commit werden erst nach tatsächlich beendeten Läufen ergänzt. Die früheren Messreihen bleiben [am unveränderlichen Ausgangscommit](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/TESTLAUFZEITEN.md) einsehbar.
