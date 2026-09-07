# Lokale Abnahme Phase 1 / Version 2.7

Stand 07.09.2026. Ausgangspunkt: `c5f28eed0b28210a2f5df9639998aa66b1a6e050` (2.6.0), sauberer Entwicklungsbranch `dev`.

## Tatsächlich lokal ausgeführt

| Prüfung | Ergebnis |
| --- | --- |
| Ausgangsstand: Produktionsbuild, Typprüfung, Lint | Erfolgreich |
| Ausgangsstand: unter Windows ausführbare Vitest-Reihe | 75 bestanden |
| Neuer Stand: `pnpm build` inklusive TypeScript | Erfolgreich |
| Neuer Stand: `pnpm typecheck`, `pnpm lint`, `git diff --check` | Erfolgreich |
| Neue vollständige lokale Vitest-Reihe ohne Linux-Prozesstest `amp-autostart.test.ts` | 86 bestanden, 15 Dateien |
| Gezielte Wiederprüfung nach letzten Backendkorrekturen: Phase 1, HTTP, Server, Kartenmigration/Restore | 27 bestanden, vier Dateien |
| Browser mit `PW_EDGE=1`, Chromium-Projekt über installiertes Edge | Alle 19 Szenarien erfolgreich geprüft; im Gesamtlauf 18 bestanden, ein zusätzlicher Konfigurationstest zunächst mit mehrdeutigem Testselektor. Nach Eingrenzung auf den Dialog alle drei Phase-1-Browserfälle bestanden. |

Der vollständige neue Browserablauf umfasst Notrufabfrage, gespeicherte AAO, HLF, Ausrückzeit/FMS 3, Serverneustart, Ankunft/FMS 4 in der Historie, erste Lagemeldung, Löschwasser-Nachforderung, TLF, Abschluss und Archiv. Der zweite Fall prüft freie Disposition auf 390 Pixel Breite. Der dritte prüft FMS-Definitionen, manuelle Nichtverfügbarkeit, Reload und wirksames Wachenprofil.

Die übrigen Browserfälle prüfen unter anderem gemeinsame Leitstellenmitgliedschaft und Disposition ohne zweiten offenen Browser, tatsächliche Offline-CLI-Wiederherstellung, getrennte Einzelspielerstände, Offline-Sperre, Chat und Sitzung, echten Nicht-Loopback-HTTP-Ursprung, Karte/Wege sowie messbare Audioausgabe. Die vier neuen Klänge sind auch Teil der Stereo-/Clipping-Prüfung.

## Gefundene und behobene Fehler

- Erstes reproduzierbares ID-Format kollidierte mit alten Remote-Zuweisungen; IDs verwenden nun ein kompatibles Format. Alte Kooperation und aktive Patiententransporte bestehen die Integrations-/Migrationsprüfung.
- Ein nach Reload wieder geladener AAO-Vorschlag markierte ein bereits gebundenes HLF. Ein Alarm verbraucht den Vorschlag; die Oberfläche verwendet ausschließlich aktuell verfügbare ausgewählte Fahrzeuge.
- Ein vor dem Ausrücken zurückgerufenes Fahrzeug durfte nicht vom Einsatzort zurückfahren. Die Rückfahrt beginnt jetzt an seiner tatsächlichen Ausgangsposition.
- Gesprächsabbruch ohne Rückruf, wiederholte Bearbeitung sowie gegensätzliche Angaben mehrerer Anrufer haben eigene Regressionstests.
- Alte Tests mit automatischer Freigabe wurden auf die ausdrücklich geänderte Produktregel umgestellt. Bestehende Migrationsprüfungen vergleichen weiterhin den vollständigen erwarteten Zustand einschließlich der neuen Migrationsmetadaten und die unveränderte Originalsicherung.

## Vollständige Linux-/CI-Abnahme vor Übernahme

Die Repository-CI bleibt unverändert verpflichtender Prüfschritt vor dem Merge. Sie führt das AMP-Setup unter `NODE_ENV=production`, Typecheck, Lint, die vollständige Vitest- und Node-Prozessreihe sowie sämtliche Browserfälle in Chromium und Firefox aus. Der Linux-SIGTERM-/Autostart-Test und die vollständige Prozessreihe werden hier nicht als lokal unter Windows bestanden ausgewiesen. Maßgeblich für deren Ergebnis ist der erfolgreiche CI-Lauf des tatsächlichen PR-Kopfs; dieser wird im PR und im Abschlussbericht verlinkt.

Es gab keinen Produktionsdatenreset und keine Installation auf dem privaten AMP-Server. Die bestehende Buildwarnung zu einem Clientbundle über 500 kB besteht weiterhin (ca. 527 kB unkomprimiert); Build und Tests brechen deshalb nicht ab. Phase 2 bis 5 bleiben die dokumentierte Roadmap.
