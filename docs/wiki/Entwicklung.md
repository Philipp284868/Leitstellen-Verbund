# Entwicklung, Tests und Release

main ist der einzige reguläre Entwicklungsbranch. Vor Änderungen Remote, Status und Worktree prüfen. Kleine abgeschlossene Schritte lokal testen, committen, regulär pushen und zugehörige CI-Ergebnisse prüfen. Kein Force-Push, keine ungesicherte Branchlöschung und keine automatischen Produktionsbereitstellungen. Externe Beiträge und Schutzregeln bleiben respektiert.

Setup: Node.js 24, `node scripts/amp-setup.mjs`. `npm run dev` startet standardmäßig Deutschland mit vorhandenen GEODATA_DIR und GRAPHHOPPER_URL. DEV_DATA_DIR bezeichnet einen eigenen lokalen Entwicklungsstand; Produktions-DATA_DIR wird nicht verwendet. Vite übernimmt UI-Änderungen, der dauerhafte esbuild-Kontext übersetzt Serveränderungen und startet das Backend geordnet neu. Es ist kein manueller Vollbuild pro Änderung erforderlich. Ausführliche Befehle und Grenzen: [Entwicklungsanleitung](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/ENTWICKLUNG.md).

Die verbindlichen Teststufen stehen in package.json und docs/TESTLAUFZEITEN.md. Ein Schnelltest ist keine volle Abnahme. Integration verwendet echte SQLite-Datenbanken und Serverkommunikation; jeder Browserworker besitzt isolierte Testdaten und Ports. Linux-Prozess-/Symlink-Prüfungen bleiben in CI verpflichtend.

Releases stammen nur aus konkret vollständig geprüften main-Commits. Runtimepakete benötigen Node.js 24 und Produktionsabhängigkeiten. Ein Quellcodearchiv ist keine fertig installierte Spielinstanz und es gibt keine Windows-EXE. Der Freigabeprozess erzeugt einen Entwurf mit Prüfsummen; stabile Veröffentlichung und Produktion sind separate Entscheidungen.
