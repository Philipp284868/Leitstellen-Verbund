# Teststufen und Laufzeitmessung

`node .tools/pnpm-11.19.0/bin/pnpm.cjs test:quick`: Typecheck und reine Logiktests ohne Server/Browser. `test:unit`: reine Logik. `test:integration`: alle übrigen Vitest-Dateien sowie echte Node-Betriebstests. Neue Dateien landen standardmäßig in Integration und werden nicht stillschweigend ausgelassen. `test:e2e`: sämtliche Browserabläufe. `test:ci`: vollständige Vitest- und Node-Suite. `test:full`: Build einschließlich Typecheck, Lint, vollständige Logik-/Betriebs- und Browserprüfungen. `test:security`: Audit der Produktionsabhängigkeiten ab hohem Schweregrad.

Alle vollständigen Stufen enthalten weiterhin Berechtigungen, doppelte Aktionen, Archive, Migrationen, Neustart, deterministische Simulation und Linux-Betriebstests. Der kurze Entwicklungscheck ersetzt keine Endabnahme. Echte Linux-Signal- und Symlinktests benötigen Linux; ein Windows-Lauf wird bei fehlenden Rechten nicht künstlich grün geschaltet.

CI baut einmal auf Ubuntu/Node 24 und verwendet das Artefakt ausschließlich für Browserjobs desselben Commits. Kaltes AMP-Setup bleibt bewusst ungecacht, damit eine leere Installation geprüft wird. Nur Browserdownloads werden gecacht; Cachetreffer ersetzen weder Tests noch die Installation von Systembibliotheken. Chromium und Firefox laufen getrennt mit je zwei isolierten Workern. Datenbanken/Server pro Testdatei bleiben getrennt. Tests einer Datei bleiben seriell. Laufzeitberichte und Fehlerbilder werden als Actions-Artefakte aufbewahrt. Lokale Messungen schreiben ausschließlich in .tools/test-runs; Standard-Browsertests verändern keine Dokumentationsbilder.

## Messbedingungen und bisherige Befunde

Ausgangs-CI 34207512025 auf Ubuntu: 171 Vitest-Fälle 31,65 s, 16 Node-Fälle 2,49 s, 74 Browserfälle in 12,0 Minuten bei einem Worker. Das ist die alte Version, daher kein isolierter Beweis für Parallelisierung. Ein neuer Vergleich mit identischem Build, Browser, Rechner und Tests wird separat angegeben.

Windows/Node 24.19.0: Quick-Check 5,554 s (Typecheck 3,949 s, reine Tests 1,605 s, 18 Fälle). Das zuvor vollständig bestandene Desktoppaket mit 37 Edge-Fällen und zwei Workern dauerte 2,2 Minuten. Die abschließenden Vergleichsläufe und die tatsächlichen CI-Ergebnisse werden nach ihrer Ausführung ergänzt.

Gefundener Engpass: Ein offener HTTP-Teardown konnte 200 Sekunden blockieren. Der Server begrenzt nun das Drain, wartet laufende Arbeit ab und sichert vor Datenbankabschluss; ein echter TCP-Test reproduziert diesen Randfall. Ein künstlicher 350-ms-Test-Delay wurde durch ein steuerbares Antworttor ersetzt: zuerst gesperrte laufende Aktion prüfen, dann Antwort freigeben und bestätigten Zustand prüfen. Keine Produktwartezeit wurde verkürzt.
