# Entwicklung, Tests und Release

main ist der einzige reguläre Entwicklungsbranch. Vor Änderungen Remote, Status und Worktree prüfen. Kleine abgeschlossene Schritte lokal testen, committen, regulär pushen und zugehörige CI-Ergebnisse prüfen. Kein Force-Push, keine ungesicherte Branchlöschung und keine automatischen Produktionsbereitstellungen. Externe Beiträge und Schutzregeln bleiben respektiert.

Setup: Node.js 24, `node scripts/amp-setup.mjs`. `npm run dev` startet Vite-Hot-Reload und einen separaten lokalen Backendprozess. Die lokale Entwicklung verwendet ../leitstellen-verbund-rivermere-development-data, niemals die Produktionsdaten. Der Client aktualisiert automatisch; serverseitige Änderungen mit `node scripts/build-server.mjs` neu bauen.

Die verbindlichen Teststufen stehen in package.json und docs/TESTLAUFZEITEN.md. Ein Schnelltest ist keine volle Abnahme. Integration verwendet echte SQLite-Datenbanken und Serverkommunikation; jeder Browserworker besitzt isolierte Testdaten und Ports. Linux-Prozess-/Symlink-Prüfungen bleiben in CI verpflichtend.

Releases stammen nur aus konkret vollständig geprüften main-Commits. Runtimepakete benötigen Node.js 24 und Produktionsabhängigkeiten. Ein Quellcodearchiv ist keine fertig installierte Spielinstanz und es gibt keine Windows-EXE. Der Freigabeprozess erzeugt einen Entwurf mit Prüfsummen; stabile Veröffentlichung und Produktion sind separate Entscheidungen.
