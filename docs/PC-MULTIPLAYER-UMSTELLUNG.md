# PC-Multiplayer-Umstellung

## Bestandsaufnahme 08.09.2026

Ausgangscommit 4d1c170 (2.13.0). main und dev lokal/remote identisch, ein Worktree, keine uncommittete Arbeit. Zwei ältere lokale Feature-Branches sind vollständig in main enthalten und remote bereits entfernt. Keine offenen PRs. Standardbranch main. Ein aktiver Workflow: Prüfung; kein Deployment-, Restart- oder Migrationsworkflow. Keine Releases, keine eigenständigen Issues vor Auftrag #19. Wiki, Discussions und Projects sind in den Repository-Einstellungen aktiviert; tatsächliche Inhalte und Zugriff werden separat geprüft.

Einzelspieler läuft bislang ebenfalls auf dem Server: separater solo_saves-Bestand, Modusheader und Socket-Authentifizierung, UI-Moduswechsel. Keine neue lokale Ersatzsimulation erforderlich. Entfernt werden aktive Einzelspieler-Einstiege, Laufzeitpfade und Smartphone-Anordnungen. Die bisherigen SQL-Migrationen und ein read-only Archivexport bleiben für Bestandsschutz nötig. Gemeinsame Simulations-/Routing-/Audio-/Auth-Komponenten bleiben erhalten.

Ausgangsmessung: geprüfter CI-Lauf 34207512025, 171 Vitest-Tests 31,65 s, 16 Node-Tests 2,49 s, 74 Browsertests 12,0 min, ein Browserworker. Kaltes Setup/Build und Browserinstallation sind separat im CI-Protokoll ausgewiesen. Optimierung und Vergleich werden auf gleicher Runnerklasse und für erhaltene Tests dokumentiert.

## Prüfschritte

1. main-only-Regeln, Branchbereinigung und Projektaufgaben.
2. Multiplayer-only-Laufzeit, Altbestandsarchiv, Desktopmenü und HUD.
3. Isolierte parallele Testausführung, Teststufen und Vorher-/Nachhermessung.
4. Tatsächliche Wiki-/Project-/Community-Einrichtung und geprüfter Release-Entwurf.

Kein automatisches Produktionsdeployment. Noch nicht abgeschlossene Schritte sind keine zugesicherte Produkteigenschaft.
