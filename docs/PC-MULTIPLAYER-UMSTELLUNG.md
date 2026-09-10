# PC-Multiplayer-Umstellung

> Historischer Nachweis des im Dokument genannten Stands. Frühere Karten, Bedienwege und Prüfzahlen sind keine aktuelle Produktanleitung. Aktuell: [Deutschland](DEUTSCHLAND.md), [Entwicklung](ENTWICKLUNG.md), [Laufzeitmessungen](TESTLAUFZEITEN.md).

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

## Umgesetzter Produktabschnitt

Aktiver Einzelspieler aus Menü, Store-Umschaltung, HTTP-/Socket-Zugriff und Server-Ticks entfernt. Archivexport prüft Kontobesitz und wird weder gespielt noch importiert. Historische SQL-Migrationen bleiben erhalten; Schema 11 unverändert. Alte Browserkopien können separat exportiert werden. Dedizierte Smartphone-CSS-Blöcke entfernt; gemeinsame Desktop-Anpassungen und Pointer-Steuerung erhalten. Keine ungenutzte Abhängigkeit nachgewiesen: insbesondere Dexie bleibt für vorhandene freiwillige Sicherungen/Archivexport und Audio erhalten.

Lokal: 171 Tests (einschließlich neuem Shutdown-Test, ohne Linux-AMP-Prozesstest), Typecheck, Lint, Build; 37 Edge-Browserfälle mit zwei Workern in 2,2 Minuten. Der Linux-only-Betriebsteil ist separat in CI verpflichtend. Ein ausdrücklich ausgeführter Windows-Lauf der 16 Node-Betriebstests hatte 13 Erfolge, zwei EPERM-Fehler beim Anlegen von Dateisymlinks und einen Prozess-Timeout; er wird nicht als bestanden dargestellt.

Erster veröffentlichter Teilstand: 2650a13. Dessen CI 34211890063 meldete 73/74 Browserfälle erfolgreich; ein Firefox-Teardown hing an einer offenen HTTP-Verbindung. Korrektur e80ee67 begrenzt das Netzwerk-Drain, wartet laufende Anfragen ab, sichert den Bestand und ist idempotent. Ein gezielter Test mit unvollständigen HTTP-Headern besteht.

GitHub: dev unmittelbar vor Löschung erneut mit main verglichen (0 exklusive Commits), remote und lokal entfernt. Beide alten lokalen Feature-Branches waren integriert und remote bereits entfernt; ebenfalls gelöscht. Nur main bleibt. Issues #19–22 und sechs aussagekräftige Labels angelegt. Discussions #23 (Ankündigung), #24 (Hilfe), #25 (Ideen) veröffentlicht. Dependabot-Warnungen, privater Sicherheitsmeldeweg, Secret Scanning und Push Protection aktiviert; keine automatischen Update-Branches oder Major-Upgrades.
