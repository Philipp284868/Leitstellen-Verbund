# UI-Abnahme 2.13.0

> Historischer Nachweis des im Dokument genannten Stands. Frühere Karten, Bedienwege und Prüfzahlen sind keine aktuelle Produktanleitung. Aktuell: [Deutschland](DEUTSCHLAND.md), [Entwicklung](ENTWICKLUNG.md), [Laufzeitmessungen](TESTLAUFZEITEN.md).

## Auftrag und Ausgangslage

Die zwei bereitgestellten Referenzen bestimmen die Komposition: große Regionskarte, linke Menüaktionen/rechte Statuskarten im Hauptmenü; im Spiel schmale Kopf- und Fußleiste, kompakte Einsatzliste und rechte Kontextdisposition. Zuvor beanspruchten Verwaltungsnavigation, Wachenstreifen und ständig offene Kartenwerkzeuge einen erheblichen Teil der Karte; die Einsatzdisposition öffnete sich als großes modales Fenster.

## Neue Struktur

- `MainMenu.tsx` / `MainMenu.css`: sechs Hauptaktionen, eigene Welt als Hintergrund, echte Profil-/XP-/Budget-/Bestandsdaten, Spielstandvorschau, Versionsnachrichten und Footer.
- `GameHud.tsx` / `Hud.css`: Randanordnung, zusammenklappbare Einsatzliste, Organisationsfilter, bedarfsweise Kartenwerkzeuge, Statusleiste und gruppierte Schnellzugriffe. Großlagenübersicht erscheint bei Bedarf direkt in der Einsatzspalte.
- `IncidentDock.tsx`: zugängliche rechte Einsatzleiste mit Details/Fahrzeuge/FMS/Anfahrt als Abschnittsnavigation. Sie enthält die vorhandene echte Disposition aus `Desk.tsx`. Abgeschlossene Gespräche sind eingeklappt, ihr Verlauf bleibt erreichbar. FMS führt bei fehlenden offenen Sprechwünschen zu den FMS-Angaben der eingesetzten Fahrzeuge.
- `HudTheme.css` und `MapTheme.css`: gemeinsame Schrift, Panel-, Zustands-, Fokus- und Kartenfarben. `BrandMark.tsx` und `HudIcons.tsx` verwenden lokale SVG-Formen/Lucide-Icons.
- `RegionScene.tsx` und `MapTerrain.tsx`: dieselbe Weltgeometrie im Menü und auf der interaktiven Karte, detailliertere Hausreihen und Waldschatten, dünnere Straßenzeichnung und dezente Bodentextur. Keine zusätzlichen Straßenknoten, Datenimporte oder veränderten Fahrwege.
- `Map.tsx` / `VehicleMarkers.tsx`: Listenwahl zentriert bekannte Objekte, organisationsbezogene Marker, markierte eigene Fahrzeuge mit Rufnamen, tatsächliche Routen der zum gewählten Einsatz alarmierten Fahrzeuge. Kartenfilter, Folgefunktion, Zoom, Suche, Platzierung und Betriebsübersicht bleiben nutzbar.
- `MenuPanels.tsx`: sichere Spielanlage, echter Einsatzkatalog, Personalzugriff über die Wachen, Beenden/Abmelden, Nachrichten, Credits, Datenschutzinformationen, Hilfe und aktuelle Sprachverfügbarkeit.

Die Simulation bleibt vollständig auf dem bestehenden Server. Es gibt keine Änderung an Datenbankschema, Spieltempo, Belohnungslogik, Serverrechten oder Multiplayer-Freigaben. Es wurde keine Spielwelt zurückgesetzt und kein Produktionsserver bereitgestellt.

## Navigation und ehrliche Grenzen

| Menüpunkt                       | Tatsächliches Ziel                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Weiterspielen                   | Aktuell bestätigter Serverbestand des gewählten Modus                                                                            |
| Neues Spiel                     | Erstanlage einer Wache im leeren Bestand; bestehende Leitstelle fortsetzen oder anderen Modus/Konto wählen                       |
| Mehrspieler                     | Multiplayerbestand und dessen vorhandene Disponenten-/Nachbarleitstellenverwaltung                                               |
| Szenario                        | Durchsuchbarer Katalog der vorhandenen 41 Einsatzarten mit Anforderungen, Stufen und Belohnungen; kein neuer Szenario-Spielmodus |
| Einstellungen                   | Bestehende Arbeitsplatz-, Audio-, Konto- und Darstellungsoptionen, weitere Spielbereiche                                         |
| Beenden                         | Expliziter Abmeldeablauf; anschließend kann der Tab geschlossen werden                                                           |
| Datenschutz / Support / Deutsch | Tatsächliche Speicherinformationen, vorhandene Hilfe/Projekt-Issues, Hinweis auf die vorhandene deutsche Oberfläche              |

Die Bilder enthalten fotorealistische Luftbilder und Ereignisfotografien. Diese Implementierung verwendet eine verfeinerte, stilisierte SVG-Karte mit echten Spielkoordinaten. Eine fotorealistische Satelliten-/3D-Rekonstruktion der Welt ist nicht Bestandteil des vorhandenen Renderers. Das Kartenbild entspricht daher nicht pixelgenau der Bildvorlage. Die Layoutstruktur, Panelpositionen und Informationshierarchie wurden dagegen direkt übernommen. Beispielnamen, fremdes Studio-Branding, erfundene Spielstunden und Beispieldaten wurden nicht in das Produkt kopiert.

Die Vorlage zeigt Zeitbeschleunigung; auf ausdrücklichen früheren Wunsch bleibt das Spiel ausschließlich Echtzeit 1×. Die schmale Einsatzleiste verwendet Abschnittssprünge statt voneinander abgeschotteter Formulare, damit Interview, Nachforderungen und Disposition ohne Verlust eingegebener Auswahl zusammenarbeiten. Die Managementoberflächen bleiben für umfangreiche Konfiguration als modale Dialoge verfügbar. Mobile Ansichten stapeln Menükarten und nutzen eine breitere Kontextleiste.

## Screenshots und visuelle Prüfung

Die Dateien sind unveränderte Browseraufnahmen der laufenden Anwendung mit einer lokalen, isolierten SQLite-Testwelt. Profil, Einsatz und Fahrzeugdaten werden tatsächlich vom Testserver geladen. Sie sind keine Mockups oder zugeschnittenen Referenzbilder. Testwelt und 1970-Simulationszeit stammen aus dem bestehenden deterministischen Testbestand; reale neue Spielstände beginnen mit dem Serverzeitpunkt.

| Auflösung   | Hauptmenü                                                                                                                                          | In-Game-HUD                                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1920 × 1080 | [Aufnahme](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.13/menu-1920.png) | [Aufnahme](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.13/hud-1920.png) |
| 2560 × 1440 | [Aufnahme](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.13/menu-2560.png) | [Aufnahme](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.13/hud-2560.png) |
| 1366 × 768  | [Aufnahme](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.13/menu-1366.png) | [Aufnahme](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.13/hud-1366.png) |
| 390 × 844   | [Aufnahme](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.13/menu-390.png)  | [Aufnahme](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/screenshots/2.13/hud-390.png)  |

Geprüft werden vollständige Kartenfläche, sichtbare Hauptaktionen, innerhalb des Viewports liegende Kontextleiste, echte Fahrzeugauswahl, Routen, Zoom, Suche und Einstellungen. Die visuelle Gegenprüfung bewertet außerdem Hierarchie, Abstände, Kartenfokus, Lesbarkeit und die gemeinsamen Farben.

## Prüfprotokoll

Lokal erfolgreich: Typecheck, ESLint und Produktionsbuild; 170 Vitest-Tests (der Linux-Prozesstest wird in CI ausgeführt); 32 bestehende Browserabläufe sowie fünf neue Referenz-/Menüprüfungen in Edge. Die 37 Browserfälle wurden über getrennte Läufe geprüft. Alle vier Referenzformate bestanden den abschließenden gemeinsamen Lauf. Desktopaufnahmen entsprechen exakt der jeweiligen Fenstergröße; das mobile Hauptmenü scrollt absichtlich. Die CI prüft zusätzlich Chromium und Firefox sowie Linux-Setup und Prozessbetrieb. Ihre verbindlichen Ergebnisse und der abschließende Commit-/Merge-Status stehen im zugehörigen Pull Request dev → main. Keine Produktionsbereitstellung.

Lokale Kartenmessung mit 100 Wachen, 500 Fahrzeugen, 100 Fahrten und 40 Einsätzen: Anmeldung/Kartenöffnung 2.252 ms, Übersicht/Suche/Auswahl 1.139 ms, 11.863 SVG-Elemente. Dies sind Messwerte des lokalen Testlaufs, keine zugesicherten Laufzeiten auf anderen Geräten.

Im Rücklauf wurden die neue Bauplatz-Overlayposition, die Druckansicht der angedockten Berichte und das Umschalten zwischen mobilen Kartenwerkzeugen und Einsatzliste korrigiert. Bestehende Tests folgen nun der tatsächlichen Navigation. Der Patiententransporttest beauftragt bei einem zufällig auftretenden Fahrzeugdefekt eine echte Reparatur, damit ein solcher Nebenfall nicht irrtümlich als Fehler des Patiententransports gilt. Produktlogik für Defekte wurde nicht verändert.

Zusätzlich korrigiert: Suchergebnisse liegen über den Kartenwerkzeugen; Routengrafiken blockieren keine Einsatzmarker; die kompakte Desktop-Menüansicht bleibt auch bei 1366 × 768 vollständig im Fenster.
