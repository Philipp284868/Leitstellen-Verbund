# Technischer Umbau nach Phase 0

Die ursprüngliche Phase-0-Bestandsaufnahme ist [im damaligen Commit unverändert archiviert](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/PHASE-0.md).

Der aktuelle Produktvertrag und die verbindlichen Befehle stehen in [Entwicklung](ENTWICKLUNG.md). Deutschland ist das einzige Buildziel; allgemeine Tests benötigen keinen Falkenried-/Rivermere-Generator. [Testmigration](TESTMIGRATION.json) ordnet die erhaltenen Anforderungen ihren aktuellen Prüfungen zu. [Datenbrücken](KOMPATIBILITAET.md) sichern den Altbestand ohne alten Spielbetrieb.

Die damaligen Verbesserungen bleiben erhalten und sind weitergeführt: getrennte Unit-/Integrationsgruppen aus tatsächlichen Importen, geprüfte Buildcache-Ausgaben, Hot Reload, inkrementeller Serverbuild, kleine Workerzahl und einmalige Vorbereitung pro Commit. Neue CI-Profile und der geschlossene Gesamtstatus ersetzen die alte feste Schnellliste und den pauschalen Browser-/Last-Doppelstart.

[Laufzeitmessungen und Grenzen](TESTLAUFZEITEN.md) · [Historische Berichte und Bilder](HISTORIE.md).
