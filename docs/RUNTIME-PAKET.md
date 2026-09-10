# Fertiges Deutschland-Serverpaket

Das Linux-Runtime-Archiv enthält genau einen Deutschland-Client in `dist/client/`, Server und CLI in `dist/server/`, Produktionsabhängigkeiten, Start-/Geodatenwerkzeuge und aktive Betriebsanleitungen. Konten, Zugangsdaten, Datenbanken und das große Geodatenpaket gehören nicht ins Programmarchiv.

## Installation

Node.js 24 auf dem Linux-Server verwenden. `SHA256SUMS` prüfen und das Archiv in ein neues leeres Programmverzeichnis entpacken. Bestehende Datenordner nicht überschreiben. In `.env` tatsächliche Adresse, Port, Proxy und getrennte externe Spiel-/Geodatenpfade konfigurieren. `node scripts/start-germany.mjs` startet genau das Deutschlandprodukt. Es benötigt keinen Build und kein npm-Install.

Das externe Geodatenpaket muss zum gespeicherten Datensatz passen. Für eine neue Installation aus einem Git-Checkout übernimmt `node scripts/install-germany.mjs` die vollständige Einrichtung. Im bereits gebauten Runtime-Paket nach ausdrücklicher Wahl der eigenen Datenpfade `node --env-file=.env scripts/geodata/download-package.mjs` und anschließend `node --env-file=.env scripts/geodata/pipeline.mjs tools` verwenden. [AMP-Anleitung](AMP.md) · [Deutschlanddaten](DEUTSCHLAND-DATEN.md).

Die CLI `node dist/server/cli.js` verwendet denselben Konfigurationsvertrag. Fehlende Daten oder alte Weltkennung sind Fehler; es wird keine andere Spielwelt gestartet. Alte Bestände sind über die [Datenbrücke](KOMPATIBILITAET.md) unverändert exportierbar.

## Herstellung und Abnahme

Nur ein sauberer main-Checkout mit passendem Node-/Plattformstand und gültigem Buildhash kann ein Paket erzeugen. Die CI baut einmal und reicht dieses Commit-Artefakt weiter. Zwei Verpackungen müssen bytegleich sein. Maschinenabhängige Paketmanager-Metadaten und erzeugte Bin-Wrapper werden ausschließlich im temporären Paketordner bereinigt; Bibliotheken und Paketverknüpfungen bleiben erhalten.

`scripts/runtime-smoke.mjs` entpackt das tatsächliche Archiv in ein temporäres Verzeichnis. Mit ausdrücklich kleinen externen Testgeodaten prüft es Website, Registrierung, Straßen-/Ortsabfrage, einen autorisierten Kauf, Wiederholung ohne Doppelkauf, persistente Konten/Besitz und echten SIGTERM-Stopp mit Neustart. Diese Testdaten werden nicht mit dem Spiel ausgeliefert.

Der maschinenlesbare Abnahmevertrag bindet alle Pflichtgruppen, Dateiabdeckung, Commit, Buildhash und Archivhash. Ein grüner Schnelllauf reicht nicht. Der manuelle Releaseworkflow prüft zusätzlich den aktuellen main-Stand und den erfolgreichen Sicherheitsworkflow desselben Commits und lädt das **bereits abgenommene** Runtime-Artefakt. Er führt keinen erneuten Paketbuild aus. Workflow-Anzeigenamen erteilen keine Freigabe.

Ein Release bleibt ein manueller Entwurf. Bestehende Tags/Releases werden nicht überschrieben; kein Push erzeugt ein Produktionsupdate. Abgelaufene Abnahmeartefakte erfordern eine neue vollständige Prüfung des betreffenden aktuellen main-Commits.
