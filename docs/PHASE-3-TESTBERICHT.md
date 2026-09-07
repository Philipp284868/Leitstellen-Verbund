# Phase 3 / Version 2.9.0 – Abnahme

Stand: 07.09.2026. Ausgangspunkt: sauberer `dev` und `main` auf `1b264e35af7444af4df4b31726a3bdf587a09baf`, gemergter PR 13 / Version 2.8.0. Repository-Anweisungen und Organisations-/Nachbarleitstellen-Vorgaben der übergebenen Master-Spezifikation wurden geprüft. Die Entwicklung erfolgt auf dem vorhandenen `dev`; die Übernahme auf `main` erfolgt ausschließlich über den regulären Pull Request nach erfolgreichem CI.

## Lokale Prüfungen

| Prüfung | Tatsächlich ausgeführter Umfang |
| --- | --- |
| Ausgangsstand unter Windows | 101 Vitest-Tests bestanden |
| Typecheck, Lint und Produktionsbuild | Erfolgreich |
| Neue gezielte Phase-3-Tests | **20 bestanden**: Organisationen, Personal, Reserven, Aufträge, Krankenhäuser und Nachbarhilfe |
| Vollständige Vitest-Regression unter Windows | **121 Tests in 17 Dateien bestanden**; ohne den bestehenden Linux-AMP-Prozesstest |
| Vollständige Browserregression mit installiertem Edge | **24 Tests bestanden**, einschließlich der drei neuen Phase-3-Abläufe |
| Gezielte Browsernachprüfung | **Neun bestanden** nach den abschließenden Funk-, Reserve- und Testkorrekturen |
| Sichtprüfung | Tatsächlich erzeugte Desktop- und Mobilaufnahmen der neuen Oberflächen geprüft |

Die neue Abnahme umfasst:

- BF-Grundzeit, tatsächlichen Ausrücktermin und geschützte Änderung operativer Wacheneinstellungen; Reservefreigabe bleibt auch bei anderen laufenden Fahrzeugaufträgen möglich.
- Individuelle FF-Anreise, Mindestbesatzung, deterministische Quittierung, identische Fortsetzung nach Serialisierung, fehlende Quittierung und Ersatzmeldung.
- Rettungsdienstschicht, Bereitschaft, auslaufende Abwesenheit, echte Umbesetzung geeigneten Personals sowie Fahrzeug-/Gebietsreserve einschließlich Mehrfachauswahl.
- Polizeisicherung vor Patientenversorgung; beauftragte THW-/Rettungsdienstmaßnahmen benötigen echte Fähigkeiten und verhindern bis zum Abschluss den Einsatzabschluss.
- Fachbereichseignung von Krankenhäusern, Kinderaufnahme, reservierte Betten, bevorzugtes Ziel und geeignete Alternative.
- Private Entwürfe, gezielter Versand, Rückfragen, Teilannahme, Ablehnung, Rückruf, einmalige Aktionsverarbeitung und vollständiges Zurückrollen einer ungültigen Mehrfachzusage.
- Keine allgemeine Einsatzfreigabe, keine Einsichtsrechte für eine dritte Leitstelle und keine Nachbarhilfe im Einzelspieler; berechtigte Disponenten teilen dagegen den Bestand ihrer Leitstelle. Rechteentzug wird unmittelbar wirksam.
- Vollständiger dynamischer Brand ausschließlich mit Nachbarhilfe, erste Erkundung durch fremde Kräfte, Serverneustart und einmalige Kooperationsauszahlung ohne Helferbrowser.
- Individuelle Versorgung und Transport im fremden RTW, bestätigte Übergabe, Transportbindung gegen vorzeitiges Beenden und persistente Patientenhistorie.
- Defekt eines fremden Fahrzeugs mit Ersatzmeldung, FMS 6 und Fortsetzung desselben gültigen Unterstützungsauftrags nach Reparatur.
- Nachforderung und FMS-Sprechwunsch bei ausschließlich fremden ersten Kräften; später eintreffende Nachbarn werden in der AAO-Auswertung berücksichtigt. Mehrere FMS-Meldungen zwischen zwei Ticks bleiben im Einsatzverlauf erhalten.
- Tatsächliche CLI-Wiederherstellung einer aktiven Unterstützungsanfrage und identische weitere Simulation einschließlich Belohnungstabelle.
- Migration 7→8 für beide Spielmodi, Originalbackup, unveränderte laufende Alarmierung und historische Spielstände ohne Phase-3-Felder. Alte Einsätze erhalten keine zusätzlichen nachträglichen Pflichtaufträge.
- Kein Vorwissen über Organisationsaufträge in der Clientansicht vor der Erkundung.

## Browserabläufe

1. BF-Wache auf FF umstellen, Mindestbesatzung und Personalprofil speichern, Reservesperre setzen und freigeben, alarmieren und individuelle Besatzungsankünfte verfolgen.
2. Zwei echte Browserkonten: privaten Entwurf erstellen, gezielt senden, Rückfrage beantworten, HLF und TLF nacheinander zusagen, nur gebundene Fahrzeuge sehen, Helferbrowser schließen, Server neu starten, fremde Lagemeldung aufnehmen, Brand abschließen und Anfragehistorie ansehen.
3. Mobile Ansicht mit 390 × 844 Pixeln: Rettungsdienstmaßnahme beauftragen, Krankenhaus wählen, RTW alarmieren, wiederverbinden und individuelle Krankenhausübergabe bestätigen.

Die bestehenden Browserprüfungen für Registrierung, getrennte Konten und Modi, gemeinsame Leitstelle, Rechte, mehrere Tabs, Wiederverbindung, Offline-Sperre, Export, Klartextchat, mobile/helle Ansicht, Karte, Fahrzeiten, Audio sowie Phase 1 und 2 bleiben erhalten. Neue Browserfälle prüfen JavaScript-Fehlerfreiheit.

## Gefundene und behobene Integrationspunkte

- Die alte Langzeit-Browserprüfung wartete bei einem tatsächlich aufgetretenen Zufallsdefekt auf automatischen Einsatzabschluss. Die betroffenen Abläufe erteilen jetzt einen regulären serverseitigen Reparaturauftrag und verfolgen die Simulation in kurzen Schritten. Defekte wurden nicht aus der Produktionssimulation entfernt.
- Der neue Verbundbereich ersetzt den früheren Phase-3-Platzhalter; die klare Aussage zur ausbleibenden automatischen Freigabe bleibt sichtbar.
- Fremde Fähigkeiten zählen in der Bedarfsanzeige, bei Rückfragen und AAO. Eine Nachforderung benötigt kein zusätzliches eigenes Fahrzeug, wenn bereits eine unterstützende Einheit erkundet hat.
- Ein repariertes Nachbarfahrzeug wurde im bisherigen lokalen Reparaturpfad als fremder Auftrag zurückgerufen. Gültige Unterstützungsbindung und Fahrtziel bleiben nun erhalten; der Server prüft weiterhin zentral, ob der Auftrag noch autorisiert ist. Auch Nachbarfahrzeuge nehmen an den regulären Defektprüfungen teil.
- Wiederholte Statusänderungen werden aus dem gespeicherten FMS-Verlauf übernommen und anhand eines Cursors nicht doppelt eingetragen. Funkgespräche der Einsatzleitung spiegeln sich im FMS der fremden Einheit.
- Reservefreigabe ist während eines Einsatzes möglich, ohne Organisation oder Ausrückregel gebundener Fahrzeuge nachträglich zu ändern.

## Windows-Grenzen und verbindlicher CI-Lauf

Der erste Linux-CI-Lauf bestand 121 von 122 Vitest-Prüfungen. Der bestehende kombinierte HTTP-/Socket-Test überschritt sein allgemeines Fünf-Sekunden-Limit, während parallel die umfangreichen Karten-/Routingprüfungen liefen. Für diesen Integrationstest mit echten Passwort-Hashes, mehreren HTTP-/Socket-Austauschen und einer absichtlichen Ratenbegrenzungswartezeit gilt jetzt ein eigenes Limit von 30 Sekunden. Sämtliche fachlichen und Sicherheitsassertionen bleiben erhalten; der folgende vollständige CI-Lauf entscheidet über die Abnahme.

Im zweiten Linux-Lauf bestanden alle 122 Vitest- und 16 Node-Prozesstests sowie 47 von 48 Browserabläufen. Der FF-Test in Chromium erwartete mit `check()` eine unmittelbar synchrone DOM-Änderung am servergesteuerten Reservefeld. Er klickt jetzt einmal und wartet ausdrücklich auf den bestätigten Checkboxzustand; auch die anschließende Freigabe wird in Oberfläche und Datenbank geprüft. Die Serverentscheidung und ihr Zustand werden nicht vorweggenommen oder umgangen.

Ein lokaler Vitest-Durchlauf traf zufällig den von Windows ausgeschlossenen Port `28385` (`listen EACCES`). `netsh interface ipv4 show excludedportrange protocol=tcp` bestätigte diesen Ausschluss. Ein anschließender vollständiger Durchlauf bestand. Dies war kein abgeschalteter Sicherheitstest und keine Änderung der Server-Portprüfung.

Die vorhandenen 16 Node-Prozesstests wurden ebenfalls lokal angestoßen: 13 bestanden, zwei scheiterten beim Erstellen von Datei-Symlinks mit Windows-`EPERM`, ein vollständiger Reset-/Neustart-Prozessfall lief in sein 30-Sekunden-Zeitlimit. Diese Reihe gilt damit **nicht als unter Windows bestanden**. Der gesonderte AMP-Autostarttest ist für Linux vorgesehen und wird aus dem Windows-Vitest-Aufruf ausgeschlossen. Die unveränderte GitHub-Actions-Pipeline führt beide Bereiche unter Ubuntu mit Node 24 vollständig aus.

Maßgeblich für die Übernahme ist der erfolgreiche CI-Lauf am exakten PR-Kopf: AMP-Setup bei `NODE_ENV=production`, Typecheck, Lint, vollständige Vitest- und Node-Prozesstests sowie sämtliche Browserabläufe in Chromium und Firefox. Erfolgreiche Einzelprüfungen ersetzen diesen vollständigen Lauf nicht. Der PR hält die tatsächlich ermittelten Endzahlen, Commitkennung und den Link zum CI-Lauf fest.

Es wurde kein privater AMP-Produktionsserver aktualisiert. Der Build weist weiterhin auf das bereits bestehende Hauptbundle über 500 kB hin; diese Optimierung bleibt im UI-/Performance-Feinschliff der Roadmap. Die fachlichen Vereinfachungen und verbleibenden Phasen sind in [PHASE-3.md](PHASE-3.md) ausdrücklich beschrieben.
