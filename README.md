# Leitstellen-Verbund · PC-Multiplayer

Leitstellen-Verbund ist ein deutschsprachiges Browser-Leitstellenspiel für PC mit Maus und Tastatur. Node.js 24 liefert Client, HTTP-API und Socket.IO aus; SQLite und die gesamte verbindliche Simulation laufen auf dem eigenen Server. **Kein aktiver Einzelspieler, keine Smartphone-/Tablet-Produktoberfläche, Echtzeit 1×.** Ein einzelner angemeldeter Spieler auf einem Multiplayer-Server ist zulässig.

## Version 2.14.0

Anmelden → **Spielen** → berechtigte Leitstelle betreten. Der verbundene Server wird mit seiner tatsächlichen Adresse angezeigt. **Leitstellen** öffnet gemeinsame Disponenten und ausdrückliche Nachbarhilfe. Unabhängige Leitstellen teilen neue Einsätze nicht automatisch.

Das Hauptmenü folgt der freigegebenen Referenz mit Regionshintergrund, Navigation links und Profil/Leitstellenwerten rechts. Im Spiel stehen Karte, schmale Statusleiste, kompakte Einsatzliste, rechte Disposition und untere Aktionsleiste im Mittelpunkt. Zielgrößen: 1920×1080, 2560×1440, 1366×768 und Ultrawide 3440×1440. Unter 1100×650 zeigt die Anwendung einen Desktop-Hinweis. Die echte Karte bleibt stilisiertes SVG, kein fotorealistisches Luftbild.

**Spielablauf:** Notruf aufnehmen, Informationen erfragen, AAO oder Fahrzeuge wählen, alarmieren, Ausrücken und FMS verfolgen, erste Lagemeldung bearbeiten, Kräfte nachfordern, Einsatz abschließen, Historie auswerten. Fahrzeuge, Personal, Gebäude, Ebenen, Funk und Archiv sind direkt über das HUD erreichbar.

## Bestandsschutz und Update

Vor einem Serverupdate stoppen und sichern. Alte Einzelspielerstände verbleiben unverändert in `solo_saves`; der Server simuliert sie nicht weiter. Alte HTTP-/Socket-Modusanforderungen werden abgewiesen. **Sicherungen → Alten Einzelspielerstand als Archiv exportieren** exportiert ausschließlich den eigenen Altbestand. Offline-Wartung: `node dist/server/cli.js archive-export --username NAME --file NEUE-DATEI.json`. Der Befehl überschreibt keine Datei. Archive können nicht in die Multiplayer-Wirtschaft importiert werden. Alte Browserkopien sind ebenfalls separat als Archiv exportierbar.

SQLite-Schema 11 und historische Migrationen bleiben erhalten; kein Datenreset. Level/XP, erworbene Fahrzeuge/Gebäude, 100×100-km-Welt, Straßengeschwindigkeiten, Routing, ETA und laufende Fahrten bleiben bestehen. Bei Verbindungsverlust sind Aktionen gesperrt; es beginnt keine lokale Ersatzsimulation. Der Server läuft auch ohne geöffneten Spielerbrowser weiter.

## Entwicklung direkt auf main

`main` ist der einzige reguläre Projektbranch. Geprüfte abgeschlossene Teilschritte werden direkt gepusht; keine automatische Produktionsbereitstellung. [Beitragsregeln](CONTRIBUTING.md) · [Sicherheit](SECURITY.md).

Installation und Build: `node scripts/amp-setup.mjs`. Entwicklungsansicht mit Hot Reload: `npm run dev` (Node.js 24). Sie verwendet localhost:5173, einen Backend-Port 4010 und ausschließlich das separate Verzeichnis `../leitstellen-verbund-development-data`. Dort ein normales Testkonto anlegen. Produktionsdaten werden nicht verwendet. `DEV_PORT` und `DEV_API_PORT` können freie lokale Ports auswählen. Clientänderungen erscheinen über Vite-Hot-Reload; Serveränderungen nach erneutem `node scripts/build-server.mjs`.

Prüfungen: `npm run test:quick`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e` und `npm run test:full`. Der vollständige Linux-Lauf bleibt für die Freigabe verpflichtend. Browser vorher mit Playwright installieren; unter Windows kann `PW_EDGE=1` das vorhandene Edge verwenden. [Testumfang und Laufzeiten](docs/TESTLAUFZEITEN.md).

[Fertiges Linux-Serverpaket und kontrollierter Release-Entwurf](docs/RUNTIME-PAKET.md). Ein Entwurf wird ausschließlich manuell aus einem erfolgreich geprüften main-Commit erzeugt; kein Push installiert einen Produktionsserver.

## Projekt und Hilfe

- [AMP-Betrieb, Sicherung und Wiederherstellung](docs/AMP.md)
- [Notruf/AAO/FMS](docs/PHASE-1.md), [Dynamik](docs/PHASE-2.md), [Organisationen und Nachbarhilfe](docs/PHASE-3.md), [Großlagen](docs/PHASE-4.md), [Auswertung](docs/PHASE-5.md)
- [Level, Freischaltungen und Straßenfahrzeiten](docs/PROGRESSION-KARTE.md)
- [Abnahme, Bildschirmaufnahmen und offene Einrichtungsschritte](docs/ABNAHME-PC-MULTIPLAYER.md)
- [Bestandsaufnahme und Umstellungsverlauf](docs/PC-MULTIPLAYER-UMSTELLUNG.md)
- [Roadmap/Auftrag](https://github.com/Philipp284868/Leitstellen-Verbund/issues/19) · [Fehler melden](https://github.com/Philipp284868/Leitstellen-Verbund/issues/new/choose) · [Community](https://github.com/Philipp284868/Leitstellen-Verbund/discussions) · [Releases](https://github.com/Philipp284868/Leitstellen-Verbund/releases)

Frühere Versionsdokumente beschreiben den damaligen Stand. Aussagen über Einzelspieler, Mobile oder dev in historischen Migrationsberichten sind keine aktuellen Produktvorgaben. Die Wiki ist aktiviert, benötigt derzeit noch ihre erste Seite zur Initialisierung; bis dahin gelten die Repository-Anleitungen.
