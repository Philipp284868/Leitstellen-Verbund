# Tatsächliche Prüfung der Einsatzlogik 2.20

Stand: 09.09.2026. Getestet wird ausschließlich mit isolierten Testkonten, temporären SQLite-Verzeichnissen und lokalen Diensten. Kein Produktionsserver wurde aktualisiert oder zurückgesetzt. Dieser Bericht dokumentiert die lokalen Prüfnachweise; den verbindlichen CI-Status liefert der zum jeweiligen Commit gehörende GitHub-Actions-Lauf.

## Nachweisstand

| Prüfung | Tatsächliches Ergebnis |
|---|---|
| Produktionsbuild beider vorhandenen Welten | Erfolgreich; bestehende Größenwarnung des Deutschland-Vendor-Chunks bleibt |
| TypeScript | Erfolgreich |
| ESLint | Erfolgreich |
| Vollständige lokale Vitest-Regression | 1.077 Fälle: 1.075 bestanden, 1 fehlgeschlagen, 1 übersprungen |
| Node-Betriebsprüfung unter Windows | 16 Fälle: 13 bestanden, 2 Symlink-Fehler, 1 Prozessfall mit Zeitüberschreitung |
| Abschließende gezielte Logik-/HTTP-/Migrationsprüfungen | 74/74 bestanden in elf betroffenen Dateien |
| Abschließende Aufgabenanzeige und Wissensprojektion | 10/10 bestanden, davon vier neue Fortschrittsfälle |
| Vollständiger lokaler Edge-Erstlauf | 52/60 bestanden, acht veraltete Browsererwartungen fehlgeschlagen; beide Lasttests bestanden |
| Nachprüfung der vier betroffenen Browserdateien | 17/17 bestanden nach Anpassung an die neuen Spielregeln |
| Zusätzliche Referenzprüfung des finalen Meldetitels | 6/6 bestanden, darunter vier Desktopgrößen |
| Zusammenhängende echte Deutschlandabnahme | Erfolgreich mit zwei authentifizierten Disponenten, echtem Router, Neustart und Wiederverbindung |

Die vollständige Vitest-Prüfung ist `.tools/test-runs/2.20-final-vitest.json` zugeordnet. Der lokale Fehlfall ist `amp-autostart`: Nach dem Windows-Prozessstopp bleibt die Sperre erhalten. Der übersprungene Test betrifft DEM-Symlinks. `.tools/test-runs/2.20-node.log` hält zwei `EPERM`-Fehler beim Erstellen von Symlinks und den echten Prozessfall fest, der nach 30 Sekunden abbrach. Diese Ergebnisse werden nicht als Erfolge umgedeutet. Die vorhandene Linux-CI muss dieselben Betriebsprüfungen erfolgreich ausführen.

## Fachliche Nachweise

Die Notruf-Belastungsmessung umfasst sechs einstündige Abläufe auf der historischen lokalen Falkenried-Testkarte: drei Seeds, jeweils mit einem TSF beziehungsweise HLF und TLF. Sie vergleicht den vorherigen Stand mit der integrierten 2.20-Fassung einschließlich geänderter Fähigkeiten und Fahrzeugbereitschaft; der alleinige Effekt der Notrufdrossel wird nicht isoliert. „Maximal offen“ und „mittlere offene Zahl“ zählen Einsatzvorgänge. Die gemessene Fahrzeugbindung bezeichnet den Zeitanteil außerhalb des Status `ready`, einschließlich bereits wieder alarmierbarer Rückfahrten. Die erreichten 654–824 EP der TSF-Reihe stammen von einem idealisierten Disponenten und belegen keine garantierte Fortschrittszeit für beliebige Spieler oder Deutschlandregionen. Die spätere Deutschlandabnahme ist ein eigener Nachweis.

- Rückfahrt: verschiedene Feuerwehr-/Transporttypen und NEF, aktuelle gerichtete Reststrecke, keine neue Ausrückezeit, erhaltene Besatzung, FMS, ungültig gewordene alte Ankunft, echte Transport-/Nachbereitungssperren, SQLite-/Provider-Neustart. Echte parallele HTTP-Aktionen zweier Disponenten ergeben genau einen Zuschlag; Replay bleibt idempotent.
- Notruflast: kontrollierte Stunde über drei Seeds und zwei Ausbaustände, 10.000 Kategoriezüge, Unabhängigkeit von Templateanzahl, echte HTTP-/Socket-Sitzungen mit mehreren Tabs, gemeinsamen Disponenten, Wiederverbindung und Serverneustart. [Messung und Grenzen](NOTRUFE-2.20.md).
- Fähigkeiten: TSF-W, TLF und HLF schließen jeweils einfachen Behälter- und Fahrzeugbrand allein ab; ungeeignete Fahrzeuge bleiben ungeeignet. Besondere Löschwasserversorgung, getrennte Crew-Arbeit, echte Restaufgaben und Nachkontrolle sind wirksam.
- Informationen: neutrale öffentliche Daten, generische beobachtete Einordnung, gemeinsame berechtigte Lagekenntnis und keine Freigabe an unabhängige Leitstellen. Komponentenprüfung schließt Brandbalken und Flammensymbol vor entsprechender Kenntnis aus.
- Darstellung: medizinische Einzel-/Gruppenmarker bleiben auch bei Auswahl und hoher Priorität grün; gemischte Cluster erhalten mehrere Kategorien. Bestätigter Brand mit Patienten wird nicht zum rein medizinischen Einsatz.
- Störungen: automatischer Fristablauf, FMS 6, gespeicherte Fahrt-/Patientenbindung, Neustart und Wiederverbindung, Wiederherstellung des richtigen Zustands und Schonfrist.
- Abzug: Gesamtprüfung einer Mehrfachauswahl, Fremdschutz, erneute Transaktionsprüfung durch Disponenten, alter Rückrufweg, Nachbar-Unterstützungsabschluss, Restaufgaben, Abschnittsleitung, Fehler erst bei zweiter Rückroute ohne Teilmutation, einmalige Historie/Belohnung und Abschluss einer leeren erledigten Einsatzstelle.

Die neuen Tests liegen insbesondere in `return-faults`, `return-http`, `notruf-2.20`, `notruf-http`, `notruf-measurement`, `capability-tasks`, `withdrawal-server`, `aid-withdrawal` und `incident-presentation`. Frühere Tests mit inzwischen ausdrücklich ersetzten Regeln wurden angepasst: keine sofortige Startwelle, keine pauschale Rückfahrtsperre, keine manuell notwendige Defektbehebung und keine festen Fahrzeugtypwörter im Fähigkeitsbedarf. Ihre übrigen Rechte-, Persistenz- und Abschlussprüfungen bleiben erhalten.

## Browser und visuelle Abnahme

Die neue versionierte Abnahme verwendet `scripts/incident-acceptance.mjs` mit `tests/fixtures/incident-real-server.ts`. Sie startet einen echten lokalen Deutschlandserver, zwei authentifizierte Disponenten und den vorhandenen GraphHopper-11-Router gegen das lokale Deutschlandpaket. Ausschließlich das Testprozess-IPC steuert Zeit, Neustart und vorbereitete Störungsfixtures; Benutzereingaben erfolgen durch die tatsächliche Browseroberfläche.

Der Ablauf führt vom neutralen Notruf über Gespräch, TLF-Alarmierung, echte Straßenanfahrt und erste Lagemeldung zur endgültigen Brandlöschung. Eine separate technische Restaufgabe bleibt offen. Das TLF wird zurückgeschickt und während der Rückfahrt ohne neue Ausrückezeit erneut alarmiert. Ein kritischer medizinischer Einsatz bleibt grün. Eine kurze Störung wird automatisch behoben; Serverneustart und Wiederverbindung erhalten ihre Frist und Zuordnung.

Der [strukturierte Deutschland-Messbeleg](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/quality-evidence/incident-real-2.20.json) enthält die tatsächlich gemessenen Routen, den Intensitätsverlauf bis null, identische Ausgangskoordinaten beim Folgealarm, null Sekunden erneute Ausrückezeit, sichtbare Notfallpriorität bei grünem Marker sowie die über den Serverneustart erhaltene 60-Sekunden-Störungsfrist. Es traten keine Browser-`pageerror`-Ereignisse auf. Das ist eine gezielt vorbereitete Einsatzfolge auf echten Geodaten; die Restaufgabe wird bewusst offen gelassen und ihr späterer Gesamtabschluss in getrennten Logik- und Browserfällen geprüft.

Der ursprüngliche breite Edge-Lauf und seine Fehlschläge bleiben dokumentiert: Zwei Fälle warteten auf einen inzwischen absichtlich verzögerten ersten Anruf; zwei erwarteten die abgeschaffte Rückfahrtsperre beziehungsweise einen manuellen Reparaturauftrag; vier Referenzgrößen suchten den nun vor Erkundung verborgenen echten Einsatznamen. Der anschließende Lauf aller vier betroffenen Dateien bestand mit 17/17 Fällen. Eine weitere Referenzprüfung bestand mit 6/6 Fällen. Die lokalen Läufe ersetzen keine vollständige grüne Prüfung eines einzelnen finalen Commits in der Linux-CI.

Die Sichtprüfung korrigierte zusätzlich einen veralteten Cache der Ausrückevorschau, die versehentliche Ausblendung einer ausdrücklich gesetzten Priorität und die bisherige Fortschrittsanzeige trotz offener Einzelaufgabe. Die Abnahme prüft die sichtbare Null-Ausrückezeit und das NOTFALL-Symbol ausdrücklich. Vor dem Anfahrtsscreenshot wartet sie auf den bestätigten Socket-Stand FMS 3.

### Aufnahmen aus der gestarteten Anwendung

![Bestätigte Brandentwicklung mit tatsächlichen Serverwerten](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.20/04-bestaetigte-brandentwicklung.png)

![Gelöschter Brand mit noch offener unabhängiger Restaufgabe](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.20/05-feuer-geloescht-restaufgaben.png)

![Wieder alarmierbares TLF und weiter gebundene Drehleiter](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.20/06-tlf-frei-restarbeiten-bleiben.png)

![Grüner medizinischer Marker mit gesonderter Notfallkennzeichnung](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.20/08-medizinischer-einsatz-gruen.png)

Die vollständige Folge aus zehn Bildern liegt unter [screenshots/2.20](https://github.com/Philipp284868/Leitstellen-Verbund/tree/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.20). Die Dateien stammen vom tatsächlichen lokalen Deutschland-Client; sie sind keine Entwürfe oder nachgezeichneten UI-Bilder.

## Bestand und Veröffentlichung

Es gibt keine neue Datenbankschemaversion: optionale `callPacing.version=1` und `mission.tasks.version=1` werden additiv ergänzt; alte Defektfristen aus dem ursprünglichen Beginn abgeleitet. Konten, Besitz, Fortschritt, Einsätze, Koordinaten und bestehende Transportaufgaben bleiben erhalten. Einzelheiten: [Migrationen und Spielregeln](EINSATZLOGIK-2.20.md).

Die Arbeit erfolgt direkt auf `main` ohne Featurebranch oder Force-Push. Lokal geprüfte Zwischenstände werden regulär übertragen; die zugehörige [vollständige Prüfung](https://github.com/Philipp284868/Leitstellen-Verbund/actions/workflows/ci.yml) und CodeQL laufen anschließend. Die Übertragung des Codes ist keine Produktionsbereitstellung. Der tatsächliche finale Commit-/Push-/CI-Status wird anhand des entfernten Repositorys im Abschlussbericht und in den aktualisierten GitHub-Issues genannt.
