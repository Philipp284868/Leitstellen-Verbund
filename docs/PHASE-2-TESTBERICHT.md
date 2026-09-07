# Phase 2 / Version 2.8.0 – lokale Abnahme

Stand: 07.09.2026. Ausgangspunkt war der saubere Branch `dev` auf `8cbe4a92ed48713e81412a9dd1156b4de7b60add` (Version 2.7.0, gemergter PR 12). Vor Beginn wurden Repository-Anweisungen, vorhandene Module und der Phase-2-Umfang der übergebenen Master-Spezifikation geprüft.

## Tatsächlich ausgeführt

| Prüfung | Ergebnis |
| --- | --- |
| Ausgangsstand: vollständige unter Windows ausführbare Vitest-Reihe | 86 Tests bestanden |
| Typecheck und Lint des neuen Stands | Erfolgreich |
| Produktionsbuild einschließlich TypeScript | Erfolgreich |
| Vollständige lokale Vitest-Reihe ohne Linux-Autostarttest | **100 Tests bestanden, 16 Dateien** |
| Vollständige Browserregression mit installiertem Edge (`PW_EDGE=1`, Chromium-Projekt) | **21 Tests bestanden** |
| Zusätzliche gezielte Prüfung nach Ausfall-/Funkkorrekturen: Phase 1, Phase 2 und HTTP | **26 Tests bestanden, drei Dateien** |
| Erneute Prüfung der zwei Phase-2-Browserabläufe nach letzten Historien-/Dynamikkorrekturen | **2 Tests bestanden** |
| Zusätzliche Prüfung von Dynamik und Fahrten nach Präzisierung der Sperrenanzeige | **19 Tests bestanden, zwei Dateien** |
| Visuelle Prüfung | Desktop-Gefahrenansicht und mobile Patientenansicht anhand tatsächlich erzeugter Screenshots geprüft |

Die 15 neuen Systemtests prüfen vollständigen dynamischen Brandabschluss, begrenzte Eskalation/Brandübersprung, Rücknahme des erhöhten Bedarfs, Wetter-/Anfahrtsfaktoren, Umleitung beziehungsweise Warten an Sperren, Positionskontinuität bei Stau und Wetterwechsel, echte Fahrzeugpanne mit Reparatur, Patientendynamik und Transport, Reanimation/ROSC/Tod, wirksame Versorgungsschwerpunkte und Priorisierung, begrenzte Folgeaufträge, deterministische SQLite-Fortsetzung, Migration von Schema 6 samt Originalsicherung sowie fremde/doppelte Aktionen. Der vorhandene HTTP-/Socket-Test wurde um die Geheimhaltung neuer dynamischer Zustände vor Erkundung erweitert.

Der neue Desktop-Browserfall durchläuft Notruf, Notfallfahrt, HLF-Alarmierung, Motorschaden, Reparaturauftrag, Serverneustart während der Reparatur, wiederaufgenommene Anfahrt, erste Lagemeldung, defensive Taktik, TLF-Nachforderung und abgeschlossenen Brand. Der mobile Fall prüft Notruf, RTW, Lagemeldung, individuelle Vital-/Versorgungsanzeige, Versorgungsschwerpunkt, Priorisierung, Wiederverbindung und bestätigte Krankenhausübergabe. Beide prüfen auch JavaScript-Fehlerfreiheit.

Die bestehende Regression deckt weiter Phase 1, getrennte Spielstände, autorisierte gemeinsame Leitstellen, Konto-/Sitzungsschutz, Offline-Sperre, mehrere Tabs, Audio, Karte, Fahrzeiten, Migrationen, Prozessneustarts und echte CLI-Wiederherstellung ab. Erwartungswerte älterer Migrationsprüfungen wurden um die ausdrücklich neu eingeführten Metadaten erweitert; Besitz, Bestände, Fahrten und Originalsicherungen werden weiterhin geprüft.

## Relevante Absicherungen aus der Integration

- Bei einer ausgesetzten Fahrt benennt die Oberfläche die früheste Freigabe, nicht eine vermeintliche Ankunft am Ziel.
- Eine Vollsperrung darf weder einen geraden Ersatzweg erzeugen noch ein Fahrzeug am Ziel erscheinen lassen. Ohne erreichbare Alternative bleibt es am Ausgangspunkt der verbleibenden Strecke stehen.
- Bei einer Neuberechnung der laufenden Fahrt wird die bereits gefahrene Strecke berücksichtigt und die tatsächliche aktuelle Position als Ursprung benutzt.
- Erneute tatsächliche Defekte können nach erledigter Meldung erneut Funk auslösen; unveränderte Defizite erzeugen weiterhin keine Meldung pro Tick. Ein defekter RTW erhält keinen neuen Patienten.
- Fahrzeugdefekte erhalten Bindung und gegebenenfalls Patienten; Fähigkeiten und reguläre Ankunft sind bis zur Reparatur gesperrt. Wiederholte Reparaturaufträge erzeugen keinen zweiten Termin.
- Aufgehobene Eskalationsanforderungen dürfen einen beherrschten Einsatz nicht dauerhaft blockieren.
- Stabilisierte Patienten belegen nicht mehr die gesamte knappe Versorgungskapazität. Aufträge ohne reale Kräfte erzeugen keine Behandlung.
- Auch erfolglose Zufallsprüfungen schreiben die Ereignisfolge fort; ein bereits verbrauchter Zufallswert wird nicht unbegrenzt wiederholt.
- Interne Entwicklungen vor Erkundung bleiben auf dem Server nachvollziehbar und werden aus der noch unaufgeklärten Clientansicht entfernt. Reguläre Exporte enthalten keine zukünftigen Folgepläne oder internen Zufallsparameter.

## CI und Betriebsgrenzen

Vor der Übernahme muss die vorhandene Linux-CI am tatsächlichen PR-Kopf erfolgreich laufen: AMP-Setup ohne Abhängigkeiten unter `NODE_ENV=production`, Typecheck, Lint, vollständige Vitest- und Node-Prozessreihe sowie sämtliche Browserfälle in Chromium und Firefox. Die vollständigen Linux-Autostart-/SIGTERM- und Prozesstests werden hier nicht als lokal unter Windows bestanden ausgewiesen. Der verifizierte CI-Lauf und der geprüfte Commit werden im PR und Abschlussbericht verlinkt.

Die bestehende Buildwarnung zum Clientbundle über 500 kB bleibt bestehen (neuer Stand etwa 544 kB unkomprimiert, 170 kB gzip). Es wurden keine produktiven Daten zurückgesetzt, keine Installation auf dem privaten AMP-Server ausgeführt und keine zusätzlichen Dienste eingerichtet. Phase 3 bis 5 und die vollständige Umsetzung aller spezialisierten Masterkatalog-Fälle bleiben Roadmap; siehe [Funktionsumfang und Grenzen](PHASE-2.md).
