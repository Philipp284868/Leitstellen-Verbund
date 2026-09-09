# Leitstellen-Verbund · PC-Multiplayer

Leitstellen-Verbund ist ein deutschsprachiges Browser-Leitstellenspiel für PC mit Maus und Tastatur. Node.js 24 liefert Client, HTTP-API und Socket.IO aus; SQLite und die gesamte verbindliche Simulation laufen auf dem eigenen Server. **Kein aktiver Einzelspieler, keine Smartphone-/Tablet-Produktoberfläche, Echtzeit 1×.** Ein einzelner angemeldeter Spieler auf einem Multiplayer-Server ist zulässig.

## Version 2.21.0 · Bedienung, Tutorial, automatische Wachbesetzung und Euro-Wirtschaft

Hauptmenü und Spiel verwenden gemeinsame Einstellungen mit Vorschau, **Übernehmen** und **Verwerfen**. Formulare behalten Eingaben bei Serverfehlern, schützen offene Entwürfe und zeigen tatsächliche Kaufkosten. Die persönliche serverseitige Übungswelt führt durch 16 Tutorialkapitel einschließlich technischem Einsatz, Brand und echter Nachforderung. Ihr Budget, Besitz, XP und Archiv bleiben von der normalen Leitstelle getrennt; Fortsetzung und Wiederholung sind auch nach einem Neustart möglich.

Fertige Wachen stellen passende Besetzung und Qualifikationen automatisch bereit. Zusätzliche Rekrutierungs-/Ausbildungskäufe entfallen; echte FF-Anreise, Mindestbesatzung, Verletzungen und laufende Bindungen bleiben wirksam. Alle Geldbeträge werden centgenau als Euro geführt. Neue Leitstellen starten mit **1.400.000,00 €**; die normale Welt erhält automatisch **30.000,00 € je 15 Minuten** bis zur Grundreserve von **2.500.000,00 €**. Kein wiederholbarer Förderklick, keine laufenden Personalrechnungen. Die zwei eigenen Musikarrangements und getrennten Kommunikations-/Alarmgruppen unterstützen parallele Signale und lokale Soundprofile.

[Spielanleitung](docs/SPIELANLEITUNG.md) · [Menüinventur](docs/MENUE-MATRIX-2.21.md) · [Tutorial und Isolation](docs/TUTORIAL-2.21.md) · [Automatische Wachbesetzung](docs/GEBAEUDEBESETZUNG-2.21.md) · [Euro, Quellen, sechs Wirtschaftsszenarien und Migration](docs/EURO-WIRTSCHAFT.md) · [Vollständige Preisliste](docs/EURO-PREISE.md) · [Audio und lokale Sicherung](docs/AUDIO.md) · [Änderungen 2.21](CHANGELOG.md) · [Tatsächliche Abnahme 2.21](docs/ABNAHME-2.21.md).

### Weiterhin gültige Einsatzregeln aus 2.20

Bereite Rückkehrer lassen sich sofort vom tatsächlichen Straßenabschnitt erneut alarmieren. Der Generator berücksichtigt offene Gespräche, gebundene Fahrzeuge und die Größe der Leitstelle; technische Hilfe bildet den Schwerpunkt. Unbekannte Anrufe bleiben auch in den übertragenen Daten neutral. Geeignete Fähigkeiten entscheiden über die Bearbeitung, erledigte Aufgaben bleiben erledigt. Die neue Brandanzeige zeigt den gespeicherten Serverzustand; überzählige Fahrzeuge können einzeln oder gemeinsam zurückgeschickt werden. Medizinische Marker bleiben grün, gewöhnliche Fahrzeugstörungen enden automatisch. [Spielregeln und Migrationen](docs/EINSATZLOGIK-2.20.md) · [Notrufmessung](docs/NOTRUFE-2.20.md) · [Tatsächlicher Testbericht](docs/EINSATZLOGIK-TESTBERICHT-2.20.md).

### Bestehende Oberfläche

Eine einzige 62-Pixel-Leiste erschließt die Spielbereiche. Arbeitslisten und Details öffnen bei Bedarf; die untere Toolbar und globale Personalstatistik entfallen. Alle 50 Fahrzeugtypen nutzen zentrale Vektorsymbole. Reale Einrichtungen erscheinen nach Zoom und Kategorie, Mitspieler an ihrer zugeordneten Leitstelle. Öffentliche Anwesenheit überträgt keine privaten Spielstände oder Einsatzrechte. Die Simulation prüft gemeinsame Besatzungen, bestätigte Lagemeldungen, Klinikprofile und offene Abschlussbedingungen konsequenter. [Systemaudit und neue Bedienwege](docs/QUALITAET-2.19.md) · [Symbolzuordnung und Datenabdeckung](docs/QUALITAET-KARTENSYMBOLE.md) · [Präsenz und Rechte](docs/QUALITAET-PRAESENZ.md) · [Tatsächliche Prüfungen und Aufnahmen](docs/QUALITAET-TESTBERICHT.md).

### Bestehender Einsatzbetrieb

**653 Einsatzvorlagen, 50 Fahrzeugtypen:** Der vorhandene Ablauf umfasst konkrete Lagevarianten, echte FF-Anreisen, späteren BF-Ausbau, getrennte Fahrzeugbereitschaft und zustandsabhängige Nachbereitung. Vorhandene aktive Einsätze bleiben erhalten; neue Erzeugung wird anhand der aktuellen Belastung begrenzt. Prioritäten, verständliche Fähigkeitsanforderungen und seitenweise Listen helfen bei parallelen Lagen. Eigene WAV-, MP3- und OGG-Signale bleiben im Browser. Das dauerhafte SQLite-Archiv enthält alle seit Einführung des Archivs gespeicherten Abschlüsse. [Historischer Stand 2.18](docs/EINSATZBETRIEB-2.18.md) · [Vollständige Katalogzuordnung](docs/EINSATZKATALOG.md).

## Deutschland komplett aus GitHub installieren

**Neue AMP-Instanz:** Setup-Befehl `node scripts/install-germany.mjs`, App Name `scripts/start-germany.mjs`, Node.js 24, Git-Branch `main`. Die Einrichtung baut das Spiel, lädt das vollständige Deutschlandpaket automatisch aus einem festgelegten GitHub-Release und installiert die passenden Routingwerkzeuge. Kein manueller Geodatentransfer und kein eigener OSM-Import erforderlich. Rund **8 GB Download**, **15,6 GB fertige Geodaten**; mindestens **25 GB freien Speicher** für Einrichtung und Werkzeuge vorsehen. [Vollständige AMP-Neuinstallation](docs/AMP-NEUINSTALLATION.md).

Die neue `.env.germany` erhält eigene externe Spiel- und Geodatenpfade. Bestehende `.env` und frühere Spielstände bleiben erhalten. Netzwerkwerte werden übernommen; bei einer vollständig frischen AMP-Instanz müssen die tatsächliche Portzuweisung und Browseradresse noch eingetragen werden. Unterbrochene Downloads lassen sich fortsetzen, vollständige Dateien werden anhand ihrer Prüfsummen wiederverwendet.

Die neue Deutschlandwelt verwendet vollständige, lokal aufbereitete OpenStreetMap-Daten für Vektorkarte, Orts-/Adresssuche und Straßenrouting. Fahrzeuge fahren auf der gespeicherten realen Straßengeometrie; Entfernungen, Abschnittslimits und ETA gehören zum selben Modell. Copernicus-Höhendaten ergänzen die Landschaft. Keine kostenpflichtige Karten-API, kein externes Pflichtkonto und kein öffentlicher Demo-Router. [Deutschland einrichten und spielen](docs/DEUTSCHLAND.md) · [Geodaten und Lizenzen](docs/DEUTSCHLAND-DATEN.md) · [Routing](docs/DEUTSCHLAND-ROUTING.md).

Anmelden → **Spielen** → berechtigte Leitstelle betreten. Der verbundene Server wird mit seiner tatsächlichen Adresse angezeigt. **Leitstellen** öffnet gemeinsame Disponenten und ausdrückliche Nachbarhilfe. Unabhängige Leitstellen teilen neue Einsätze nicht automatisch.

Das Hauptmenü folgt der freigegebenen Referenz mit Regionshintergrund, Navigation links und Profil/Leitstellenwerten rechts. Im Spiel ist nur die 62px-Topbar dauerhaft geöffnet. Einsatzliste, Disposition und Kartenwerkzeuge erscheinen bei Bedarf; eine untere Toolbar existiert nicht mehr. Zielgrößen: 1920×1080, 2560×1440, 1366×768 und Ultrawide 3440×1440. Unter 1100×650 zeigt die Anwendung einen Desktop-Hinweis. Deutschland wird als interaktive, nach Zoom gegliederte Vektorkarte dargestellt.

**Spielablauf:** Notruf aufnehmen, Informationen erfragen, AAO oder Fahrzeuge wählen, alarmieren, Ausrücken und FMS verfolgen, erste Lagemeldung bearbeiten, Kräfte nachfordern, Einsatz abschließen, Historie auswerten. Fahrzeuge, Gebäude, Karte, Funk und Spieler sind oben erreichbar; AAO und Archiv im Einsatzbereich. Wachen- und Fahrzeugdetails zeigen Betriebsbereitschaft, automatische Besetzung und konkrete Ausnahmegründe.

## Bestandsschutz und Update

Vor einem Serverupdate stoppen und sichern. Alte Einzelspielerstände bleiben als inaktiver Bestand in `solo_saves`; der Server simuliert sie nicht weiter. Ihre Geldfelder nehmen an der bestandsschützenden Euro-Migration teil. Alte HTTP-/Socket-Modusanforderungen werden abgewiesen. **Sicherungen → Alten Einzelspielerstand als Archiv exportieren** exportiert ausschließlich den eigenen Altbestand. Offline-Wartung für Rivermere: `node dist/server/cli.js archive-export --username NAME --file NEUE-DATEI.json`; für Deutschland denselben Befehl mit `dist/germany/server/cli.js` verwenden. Der Befehl überschreibt keine Datei. Archive können nicht in die Multiplayer-Wirtschaft importiert werden. Alte Browserkopien sind ebenfalls separat als Archiv exportierbar.

SQLite migriert mit Vorabsicherung und geprüften Summen auf **Schema 14**. Die Offline-CLI `migration-preview` liest die bestehende Datenbank unverändert. Währung und neue Preise werden getrennt markiert: Als Designentscheidung entspricht ein alter Credit zehn Spiel-Euro; zusätzlich erhält freies Altguthaben einmalig 60 % Kaufkraftausgleich. Laufende Vergütungszusagen werden übernommen; XP, Konten, Fahrzeugbindungen, Orte und Wege bleiben geschützt. Bereits bezahlte alte Qualifikationen gehen ohne neue Gebühr in die automatische Wachbesetzung über. Persönliche Tutorial-/Übungsdaten stehen in getrennten Tabellen. [Konkreter Ablauf und Beispielrechnung](docs/EURO-WIRTSCHAFT.md#centmodell-und-getrennte-migration).

Historisch bereits gelöschte Berichte können nicht wiederhergestellt werden. Bestehende Rivermere-Installationen verwenden weiter ihren bisherigen Startpfad und ihre ursprüngliche Welt. Für Deutschland sind ausdrücklich getrennte Spiel- und Geodatenordner erforderlich. Alte Gebäude und laufende Fahrten werden nicht in reale Deutschlandkoordinaten umgedeutet. Welt- und Datensatzkennung verhindern eine versehentliche Vermischung. Bei Verbindungsverlust sind Aktionen gesperrt; es beginnt keine lokale Ersatzsimulation. Der Server läuft auch ohne geöffneten Spielerbrowser weiter.

## Entwicklung direkt auf main

`main` ist der einzige reguläre Projektbranch. Geprüfte abgeschlossene Teilschritte werden direkt gepusht; keine automatische Produktionsbereitstellung. [Beitragsregeln](CONTRIBUTING.md) · [Sicherheit](SECURITY.md).

Installation und Build: `node scripts/amp-setup.mjs`. Danach bleibt `npm run dev` mit Vite-Hot-Reload und inkrementeller Serverübersetzung aktiv. Deutschland verwendet vorhandene lokale Geodaten, einen lokalen Router und einen eigenen Entwicklungsstand. Einrichtung, schnelle/vollständige Prüfungen und Cachegrenzen stehen in der [Entwicklungsanleitung](docs/ENTWICKLUNG.md).

Prüfungen: `npm run test:quick`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e` und `npm run test:full`. Der vollständige Linux-Lauf bleibt für die Freigabe verpflichtend. Browser vorher mit Playwright installieren; unter Windows kann `PW_EDGE=1` das vorhandene Edge verwenden. [Testumfang und Laufzeiten](docs/TESTLAUFZEITEN.md).

[Fertiges Linux-Serverpaket und kontrollierter Release-Entwurf](docs/RUNTIME-PAKET.md). Ein Entwurf wird ausschließlich manuell aus einem erfolgreich geprüften main-Commit erzeugt; kein Push installiert einen Produktionsserver.

## Projekt und Hilfe

- [Entwicklungsboard](https://github.com/users/Philipp284868/projects/1) (privat, für berechtigte Personen) · [Status, Ansichten und Aufgabenpflege](docs/PROJECT-EINRICHTUNG.md)
- [AMP-Betrieb, Sicherung und Wiederherstellung](docs/AMP.md)
- [Neue Deutschland-Instanz vollständig aus GitHub installieren](docs/AMP-NEUINSTALLATION.md)
- [Deutschland: Start, Spielintegration und kontrollierter Weltwechsel](docs/DEUTSCHLAND.md)
- [Deutschland: tatsächliche Daten- und Spielprüfungen](docs/DEUTSCHLAND-TESTBERICHT.md)
- [Notruf/AAO/FMS](docs/PHASE-1.md), [Dynamik](docs/PHASE-2.md), [Organisationen und Nachbarhilfe](docs/PHASE-3.md), [Großlagen](docs/PHASE-4.md), [Auswertung](docs/PHASE-5.md)
- [Level, Freischaltungen und Straßenfahrzeiten](docs/PROGRESSION-KARTE.md)
- [Rivermere: neue Serverwelt, Kartensteuerung und geschützter Betrieb](docs/RIVERMERE.md)
- [Abnahme, Bildschirmaufnahmen und offene Einrichtungsschritte](docs/ABNAHME-PC-MULTIPLAYER.md)
- [Bestandsaufnahme und Umstellungsverlauf](docs/PC-MULTIPLAYER-UMSTELLUNG.md)
- [Roadmap/Auftrag](https://github.com/Philipp284868/Leitstellen-Verbund/issues/19) · [Fehler melden](https://github.com/Philipp284868/Leitstellen-Verbund/issues/new/choose) · [Community](https://github.com/Philipp284868/Leitstellen-Verbund/discussions) · [Releases](https://github.com/Philipp284868/Leitstellen-Verbund/releases)

Frühere Versionsdokumente beschreiben den damaligen Stand. Aussagen über Einzelspieler, Mobile oder dev in historischen Migrationsberichten sind keine aktuellen Produktvorgaben. Die [deutsche Wiki](https://github.com/Philipp284868/Leitstellen-Verbund/wiki) ist veröffentlicht und enthält Einstieg, Bedienung, Einsatzablauf, Rivermere und Serverbetrieb. Ihre verbindlichen Quellen liegen unter `docs/wiki`; das [Veröffentlichungsverfahren](docs/WIKI-VEROEFFENTLICHUNG.md) schützt vorhandene Inhalte.

Der Build liefert den Deutschland-Server in `dist/germany/` und den bisherigen Rivermere-Server als bestandsgeschützten Einstieg. `node scripts/start-germany.mjs` startet die eingerichtete Deutschlandwelt einschließlich lokalem Router. `npm start` und `dist/server/index.js` bleiben für Bestandsinstallationen erhalten. Der ausdrücklich gewählte neue Setup-Befehl installiert die Geodaten; ein Git-Push schaltet keinen privaten Server um und setzt keinen Spielstand zurück.
