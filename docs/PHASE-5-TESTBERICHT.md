# Prüfbericht Phase 5 – Version 2.11.0

Ausgangspunkt: `main` und `dev` auf `96e5ebcf748ef5e1075480bb457a450641577159` nach Phase 4. Keine vorhandenen lokalen Änderungen. Umsetzung auf dem vorgesehenen Entwicklungsbranch `dev`; Übernahme auf `main` erst nach erfolgreichem CI-Lauf über den normalen Pull Request. Kein Force-Push, Datenreset oder Produktionsdeployment.

## Tatsächlich lokal ausgeführte Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| Produktionsbuild mit Node.js 24 | Erfolgreich, einschließlich TypeScript-Prüfung |
| ESLint | Erfolgreich |
| Vollständige Windows-Vitest-Regression | 156 Tests in 19 Dateien bestanden |
| Neue Phase-5-Logik-/Integrationsprüfungen | 16 bestanden |
| Vollständige Edge-Browserregression | 30 Tests bestanden |
| Reproduzierbarer CLI-Balancing-Audit | Neun Szenarien erfolgreich; Zwischen- und Endzustände wiederholt |
| Sichtprüfung | Desktoparbeitsplatz, Mobilansicht und Bericht tatsächlich geöffnet und betrachtet; Kartenhöhe anschließend abgesichert |

Die Windows-Vitest-Ausführung schließt ausschließlich `tests/amp-autostart.test.ts` aus. Der Linux-Autostarttest und die separaten Node-Prozesstests werden durch die vollständige Linux-CI geprüft und hier nicht als unter Windows erneut ausgeführt angegeben. Maßgeblich für den Merge ist der erfolgreiche CI-Lauf am exakten PR-Kopf mit AMP-Setup bei `NODE_ENV=production`, Build, Typecheck, Lint, vollständiger Vitest-/Prozesssuite und Chromium/Firefox. Der Pull Request hält den geprüften Commit, Lauf und die endgültigen Endzahlen fest; ein gestarteter Lauf gilt nicht als erfolgreiche Prüfung.

## Neue gezielte Prüfungen

1. Vollständiger realer Notruf-/Alarmierungs-/Anfahrts-/Erkundungs-/Abschlussablauf erzeugt echte Zeitsegmente, Fahrzeugstrecken, Vergütung und XP. Abschluss, erneuter Tick und Migration zählen denselben Bericht nicht doppelt; Rückfahrten verändern nur die Gesamtfahrleistung.
2. Kilometer berücksichtigen Routenanteile, tatsächliches Ende, Standzeiten und Rückwege; wiederholte identische Zeit erzeugt keine Distanz.
3. Schema 9→10 migriert beide Modi, erhält Geld und Ereignisse, erzeugt korrekte Teilberichte, sichert den Originalstand und verändert beim zweiten Neustart nichts.
4. JSON/CSV-Berichte enthalten keine geheimen Szenariodaten. CSV-Formelanfänge werden entschärft. Lesen und Export verändern den Spielstand nicht.
5. Statistik bleibt nach Leitstelle und Modus getrennt. Clientaktionen zum Setzen von Statistiken, Wetter, Entwicklerzeit oder Generierung werden vom Server-Aktionsschema abgewiesen.
6. Labore erkennen veränderte Zwischenprüfsummen, manipulierte Endzustände, ungültige Aktionen und fremde Kennungen. Fehlgeschlagene Aktionen verändern ihre Ausgangsdatei nicht.
7. Tatsächliche CLI-Prozesse erzeugen, erweitern und prüfen Labore sowie Ereignisexporte. Ein vorhandenes Ausgabeziel wird bytegleich erhalten und mit Fehler abgewiesen.
8. Balancing spielt drei Einsatzarten mit drei Seeds vollständig und wiederholbar durch; positive Vergütung, sinnvolle Mindest-/Höchstdauer und vorhandene Fahrzeugfähigkeiten werden geprüft.
9. Arbeitsplatzdaten überstehen beschädigte lokale Einstellungen. Doppelbelegungen, Texteingabe und Modifikatortasten lösen keine unerwünschten Kurzbefehle aus.
10. Suche und Filter verwenden ausschließlich bekannte Informationen und verändern ihren Quellzustand nicht.
11. Alte Audioeinstellungen bekommen passende Standardkanäle. Dringender Funk erhält einmalig Vorrang vor gewöhnlichen Meldungen.
12. Audiodateien werden nach Größe, Kennung, Dauer und Signalwerten geprüft, im Pegel begrenzt, lokal gespeichert und je Kanal wieder entfernt.
13. Verwendete AAO und Nachforderungen werden einmalig aggregiert, einschließlich maximal langer AAO-Kennungen; wiederholte Alarmierung bereits gebundener Fahrzeuge erzeugt keine zusätzliche AAO-Auswertung.
14. Wetter, Uhrzeit, Eskalation, Fahrzeugdefekt/Reparatur, FMS und Patientenzustand funktionieren tatsächlich im Labor und lassen sich deterministisch wiederholen.
15. Der echte Server erzeugt nach einem Stillstand keinen Notrufstau. Abstände bleiben 90–210 Sekunden, und die Grenze von zwei offenen Einsätzen hält auch bei weiterer Zeitfortschreibung.
16. Die zusätzliche automatische Brandmeldung verrät den Fehlalarm nicht vor der Erkundung, erzeugt keinen fiktiven Brand und zählt erst nach bestätigter Lagemeldung als Fehlalarm.

## Browserabnahme und Messungen

Die neuen Browserabläufe prüfen tatsächliche JSON-/CSV-Downloads, Ereignis-Replay ohne Zustandsänderung, Statistik, Wiederverbindungszusammenfassung nach einem Neustart unter derselben Adresse, Layoutposition und -breite, eine nutzbare Kartenhöhe, mobile Darstellung, Filter, umbelegte Tastenkürzel und deren Fortbestand nach Reload. Eigene Audiodateien werden dekodiert und über einen echten AudioBufferSource abgespielt; der Test prüft die normalisierten Audiodaten sowie Erhalt und Rücksetzen nach Reload. Der vorhandene OfflineAudioContext-Test prüft zusätzlich den neuen Prioritätston gemeinsam mit Musik und allen bisherigen Effekten auf messbare Ausgabe und Clipping.

Der gesonderte Druckmedienlauf prüft die lesbare schwarze Berichtsschrift, ausgeblendete Spielnavigation und eine sichtbare Berichtsausgabe. Screenshots und Fehlertraces werden wie bisher im Playwright-Bericht abgelegt.

Der Produktionsbuild trennt etwa 202 kB Spielcode, 399 kB Bibliotheken und 11 kB nachladbare Berichtsoberfläche (jeweils unkomprimiertes, minimiertes JavaScript; geringe Änderungen durch spätere Builds möglich). Es gibt keine unterdrückte Warnung über zu große Einzeldateien.

Der reproduzierbare [Balancing-Datensatz](PHASE-5-BALANCING.json) dokumentiert die neun ausgeführten Szenarien und ihre Prüfsummen. Die kleinen Ausgangslagen wurden in 140–160 simulierten Sekunden abgeschlossen. Das Labor verwendet zwei einsatzbereite Fahrzeuge und kurze echte Straßenrouten; diese Zahlen sind kein allgemeines Versprechen für beliebige Standorte oder Personalkonfigurationen.

## Bewusste Grenzen

- Replay ist ein lesender Ereigniszeitstrahl mit ableitbarem Funkstatus, keine vollständige historische Kartensimulation.
- Layout verändert vorhandene Bereiche; separate Mehrmonitorfenster und frei schwebende Panels sind nicht implementiert.
- Alte, nie erfasste Kilometer, Vergütung und Zeitpunkte werden nicht nachträglich erfunden. Das Detailarchiv bleibt auf 500 Einsätze begrenzt.
- Eigene Audiodateien sind geräte-/browserlokal und nicht Bestandteil des Serverbackups.
- Das Entwicklerlabor ist nur über lokale Projektdateien verfügbar und kann den privaten Spielserver nicht steuern.
- Der Balancing-Audit deckt kleine Fälle ab; laufendes Spielertesting bleibt für langfristige Wirtschaft und seltene Großlagen sinnvoll.
- Die private AMP-Installation, ihre Portzuordnung und HTTPS-Konfiguration wurden nicht verändert oder als geprüft ausgegeben.
