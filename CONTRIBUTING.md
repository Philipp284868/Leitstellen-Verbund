# Mitwirken

Leitstellen-Verbund wird als PC-Multiplayer-Browserspiel weiterentwickelt. Die Umstellung wird in [Aufgabe #19](https://github.com/Philipp284868/Leitstellen-Verbund/issues/19) verfolgt.

## Direkte Entwicklung auf main

Vor Änderungen Status, Worktrees und Remote prüfen. main ist der einzige reguläre Entwicklungsbranch. Keine neuen internen dev-/Feature-Branches. Fremde Beiträge und geltende Schutzregeln bleiben respektiert. Kleine abgeschlossene Schritte lokal prüfen, committen und regulär nach main pushen; danach den tatsächlichen Actions-Status prüfen. Kein Force-Push und kein Datenreset. Ein Push führt nur Prüfungen aus, keine Produktionsinstallation.

Node.js 24 verwenden. Installation/Build: `node scripts/amp-setup.mjs`. Danach lokale .env mit eigener Test-Datenablage und freiem Port setzen; `npm run dev` startet den lokalen Server. Niemals Produktionsdaten für Tests nutzen. Aktuelle Befehle stehen in package.json; umfangreiche Serveränderungen benötigen vollständige Integrations- und Browserprüfungen.

Die zentrale SQLite-Simulation, Berechtigungen und reproduzierbaren Seeds bleiben serverseitig. Alte Spielstände nur bestandsschützend migrieren. Oberfläche für Maus/Tastatur und Desktopfenster prüfen. Keine erfundenen Spielwerte oder unverbundenen Schaltflächen.

Veröffentlichungen erfolgen nur aus konkret geprüften main-Commits. Release-Entwürfe sind keine stabile Freigabe. Produktion wird separat vom Betreiber aktualisiert.

Ein erfolgreicher CodeQL-Job bestätigt die Ausführung der Analyse, nicht die Abwesenheit offener Befunde. Bei Sicherheitskorrekturen zusätzlich die Code-Scanning-Alerts für den tatsächlich geprüften main-Commit kontrollieren; behobene Befunde müssen vom neuen Scan als `fixed` erkannt werden. Testdateien gehören ebenfalls zum automatisch gescannten Änderungsumfang.

## Verbindliche Pflege bei Folgeänderungen

Die [Entwicklungsanleitung](docs/ENTWICKLUNG.md) enthält die acht Schritte von der Aufrufprüfung bis zur tatsächlichen UI-Abnahme. Bestehende Implementierungen zuerst finden, gültige Aufrufer migrieren und nur belegte Altlasten entfernen. Neue Abhängigkeiten, Assets und Konfigurationsvarianten begründen. Keine temporären Prüfdateien committen. `check:quick` und gezielte Regressionen vor jedem Push; vollständige relevante Prüfungen am endgültigen Stand. Buildartefakte und Testresultate haben getrennte Gültigkeit: ein Buildcache ist kein Testnachweis.
