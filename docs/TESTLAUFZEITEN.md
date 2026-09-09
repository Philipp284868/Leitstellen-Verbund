# Teststufen und Laufzeitmessung

Die aktuellen Befehle, dynamisch vollständigen Testgruppen und Cachegrenzen stehen in [Entwicklung und Qualitätsprüfung](ENTWICKLUNG.md). `check:quick` enthält Typ-/Lint-/Strukturprüfungen; `test:quick` ist die gezielte schnelle Regression. `test:full` umfasst Produktionsbuild, Typen, Struktur, Lint, vollständige Logik-/Betriebstests, Audit und beide Desktopbrowser. Die folgenden früheren Laufzeitmessungen behalten ihren ausdrücklich historischen Umfang.

Alle vollständigen Stufen enthalten weiterhin Berechtigungen, doppelte Aktionen, Archive, Migrationen, Neustart, deterministische Simulation und Linux-Betriebstests. Der kurze Entwicklungscheck ersetzt keine Endabnahme. Echte Linux-Signal- und Symlinktests benötigen Linux; ein Windows-Lauf wird bei fehlenden Rechten nicht künstlich grün geschaltet.

CI baut einmal auf Ubuntu/Node 24 und verwendet das Artefakt ausschließlich für Browserjobs desselben Commits. Kaltes AMP-Setup bleibt bewusst ungecacht, damit eine leere Installation geprüft wird. Nur Browserdownloads werden gecacht; Cachetreffer ersetzen weder Tests noch die Installation von Systembibliotheken. Chromium und Firefox laufen getrennt. Normale Abläufe verwenden je zwei isolierte Worker. Der markierte @load-Fall läuft anschließend allein auf demselben Runner mit unveränderter 10-Sekunden-Grenze; seine Resultate werden zur vollständigen Browseranzahl addiert. Datenbanken/Server pro Testdatei bleiben getrennt. Tests einer Datei bleiben seriell. Laufzeitberichte und Fehlerbilder werden als Actions-Artefakte aufbewahrt. Lokale Messungen schreiben ausschließlich in .tools/test-runs; Standard-Browsertests verändern keine Dokumentationsbilder.

## Messbedingungen und bisherige Befunde

Ausgangs-CI 34207512025 auf Ubuntu: 171 Vitest-Fälle 31,65 s, 16 Node-Fälle 2,49 s, 74 Browserfälle in 12,0 Minuten bei einem Worker. Das ist die alte Version, daher kein isolierter Beweis für Parallelisierung. Ein neuer Vergleich mit identischem Build, Browser, Rechner und Tests wird separat angegeben.

Windows/Node 24.19.0: Quick-Check 5,554 s (Typecheck 3,949 s, reine Tests 1,605 s, 18 Fälle). Das zuvor vollständig bestandene Desktoppaket mit 37 Edge-Fällen und zwei Workern dauerte 2,2 Minuten. Die abschließenden Vergleichsläufe und die tatsächlichen CI-Ergebnisse werden nach ihrer Ausführung ergänzt.

Gefundener Engpass: Ein offener HTTP-Teardown konnte 200 Sekunden blockieren. Der Server begrenzt nun das Drain, wartet laufende Arbeit ab und sichert vor Datenbankabschluss; ein echter TCP-Test reproduziert diesen Randfall. Ein künstlicher 350-ms-Test-Delay wurde durch ein steuerbares Antworttor ersetzt: zuerst gesperrte laufende Aktion prüfen, dann Antwort freigeben und bestätigten Zustand prüfen. Keine Produktwartezeit wurde verkürzt.


Die erste parallele CI 34215402209 zeigte im Chromium-Lasttest 17,395 s und in Firefox 24,854 s statt erlaubter <10 s, während ein zweiter Browserworker gleichzeitig lief. Diese Messung wird als Fehlschlag dokumentiert. Der Lasttest ist deshalb anschließend separat verpflichtend, ohne vergrößerte Zeitgrenze und ohne Wiederholungen. Die übrigen 37 Fälle bleiben parallel. Einzelne Lastmessungen konkurrieren damit nicht mit unabhängigen Testbrowsern um die CPU.

## Abschließender Vergleich auf demselben PC

Windows, Node 24.19.0, installiertes Edge, identischer Produktionsbuild (Client index-BM6b3BF-.js), dieselben 38 Fälle, frische isolierte Testwelten je Lauf. Warm bedeutet bereits vorhandene Abhängigkeiten und Browser; Build/Installation sind nicht in der Browserzeit enthalten. Während dieses abschließenden Vergleichspaars liefen keine weiteren lokalen Tests. Pro Variante ein vollständiger Lauf, daher Orientierungswerte und keine statistische Garantie.

| Ausführung | Umfang | Zeit | Ergebnis |
|---|---:|---:|---|
| Seriell, ein Worker | 38 | 210.574 s | 38 bestanden, 0 übersprungen |
| 37 Fälle mit zwei Workern, Lastfall anschließend mit einem Worker | 38 | 140.377 s | 38 bestanden, 0 übersprungen |

Gemessene Verkürzung: 33.3 %. Kein Teil dieses Vergleichsgewinns entsteht durch entfernte Produktmodi oder gelöschte Tests. Die zweite Zeit enthält zusätzlich den Start beider Testprozesse und das Zusammenführen der Berichte.

Langsamste Fälle im seriellen Vergleich:

- 18.97 s: Gemeinsame Leitstelle läuft ohne zweiten Disponentenbrowser weiter; Neustart und Wiederherstellung erhalten Besitz.
- 18.89 s: Musik und alle Effekte erzeugen messbaren Stereo-Ton ohne Clipping.
- 11.01 s: Freie Registrierung, getrennte Spielerkonten, Einsatz mit einem Disponenten, Belohnung, Rückkehr und Reload.
- 8.93 s: Notruf, gespeicherte AAO, HLF, FMS, Neustart, Lagemeldung, Nachforderung und Abschluss.
- 7.55 s: Serverchat bleibt Klartext; Abmeldung entfernt private Daten und widerruft die Sitzung.

Separates Setup-Profil, drei Durchläufe, Median auf demselben PC:

- Leere SQLite-Datenbank, Migrationen und Serverobjekt: 10.57 ms.
- Vorhandene kleine Datenbank wieder öffnen: 4.01 ms.
- Konto einschließlich unverändertem scrypt-Hash: 94.74 ms.
- Headless-Edge starten: 172.22 ms.
- Isolierten Browserkontext und Seite erstellen: 112.30 ms.
- Lokalen Listener öffnen: 0.75 ms.

Die Datenbankwerte beschreiben kleine Testwelten, keine Obergrenze für große Produktionsbestände. Browserstart und Datenbankaufbau sind hier keine dominierenden Engpässe. Aufwendiger bleiben echte Audioanalyse, Mehrbenutzer-/Neustartabläufe und große Karten. Sicherheitsrelevante Passwortkosten bleiben erhalten.

Warmer Quick-Check nach Korrektur: 5,866 s, darin Typecheck 4,092 s und 18 reine Tests 1,775 s. Projektbudgets als Optimierungsziele: warmes Quick-Feedback ≤10 s, vollständige lokale Desktopabläufe ≤180 s auf diesem PC, kalte vollständige CI möglichst ≤8 min ohne Warteschlange. Runnerlast und Browserupdates können Werte verändern; Budgetüberschreitungen rechtfertigen keine schwächeren Assertions.

CI-Linux verwendet aktuell Node 24.20.0 und ist mit den Windowszeiten nicht direkt vergleichbar. Im ersten neuen CI-Aufbau: 174 Vitest-Fälle 33,63 s, 16 Node-Fälle 2,507 s; beide Verpackungen ergaben dieselbe SHA256, anschließend bestand der echte Runtime-Neustarttest. Browserdownload-Caches waren in diesem ersten Lauf kalt. Ein warmer CI-Cachelauf wurde nicht als eigener Vergleich gemessen. Die Browserkorrektur und der finale main-Stand werden anhand der jeweiligen tatsächlichen Actions-Ausführung freigegeben.


## Nachgewiesene vollständige CI nach Lastisolierung

Commit 01ebfc3, [Actions 34216504365](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34216504365): vollständiger Lauf erfolgreich, 174 Vitest-, 16 Node- und 76 Browserfälle. Chromium 242,420 s, Firefox 240,568 s (je 37 parallele Fälle plus ein isolierter Lastfall). Lauf von 10:38:18 bis 10:44:47 UTC einschließlich Bereitstellung/Artefakten: 6 min 29 s. Beide Browsercaches waren nachweislich kalt. Die Browserzweige laufen gleichzeitig, ihre Zeiten werden nicht zur verstrichenen Gesamtdauer addiert. Die unveränderte <10-s-Interaktionsgrenze bestand in beiden isolierten Lastfällen. CodeQL 34216504535 ebenfalls erfolgreich. Gegenüber der alten Browserphase mit 12 min ist das schneller; der belastbare Vergleich bei exakt gleichem Umfang bleibt die obige lokale 38/38-Messung.

Anschließend wurde der Windows-Entwicklungsstart durch einen IPC-basierten sauberen Backend-Neustart ergänzt. Ein zusätzlicher echter Prozess-/Persistenztest erhöht die Vitest-Anzahl auf 175; dessen endgültiger main-Lauf wird separat geprüft. Der Produktionsclient bleibt bytegleich (index-BM6b3BF-.js).
