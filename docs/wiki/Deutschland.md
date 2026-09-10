# Deutschland als reale Spielwelt

Deutschland ist die einzige aktive Spielwelt. Vektorkarte, Straßenrouting, Standorte und Orts-/Adresssuche stammen aus demselben vollständigen OpenStreetMap-Auszug. Küsten, Seen, Flüsse, Wälder, Landnutzung und Verwaltungsgrenzen liegen an ihren realen Orten. Ein lokal aufbereitetes Copernicus-Höhenmodell ergänzt eine ruhige Reliefschattierung. Alle Karten- und Routingdienste laufen auf dem eigenen Server; der Spieler benötigt nur einen Desktopbrowser.

Die Karte ist keine einzelne Hintergrundgrafik. Sie lädt nur den benötigten Ausschnitt und zeigt nach Zoomstufe Länderübersicht, Regionen, Städte und Straßendetails. Fahrzeuge bewegen sich entlang ihrer wirklichen gespeicherten Straßengeometrie. Abschnittsgeschwindigkeiten, Fahrzeugmaximum und die vorhandene Fahrsimulation bestimmen Strecke und ETA gemeinsam. Brücken, Tunnel und Abbiegebeschränkungen folgen der OSM-Topologie.

## Orientierung

Die Suche findet echte Städte, Dörfer, Ortsteile, Straßen und vorhandene OSM-Adressen sowie eigene sichtbare Spielobjekte. Fehlende Adressen werden nicht erfunden. Ganz Deutschland und Meine Wachen helfen beim schnellen Zurückspringen. Fahrzeugliste und Einsatzliste erlauben Auswahl/Zentrierung; die Folgefunktion bewegt ausschließlich die eigene Kamera.

Ziehen verschiebt, das Mausrad zoomt zum Zeiger. Bei Kartenfokus bewegen Pfeiltasten die Ansicht, +/− verändern den Zoom und Pos1 zeigt die Gesamtübersicht. Strg+Mausrad bleibt Browserzoom. Nach einem Drag wird kein Gebäude gekauft; Platzierung benötigt die sichtbare servergeprüfte Bestätigung. Suchfelder und Listen behalten ihre normale Bedienung.

## Weltwechsel und Berechtigungen

Ab Version 2.17 erledigt **`node scripts/install-germany.mjs`** die komplette Einrichtung über GitHub: Programm bauen, rund 8 GB fertige Geodaten herunterladen und prüfen, Routingwerkzeuge installieren. Mindestens 25 GB freien Speicher vorsehen. AMP App Name bleibt **`scripts/start-germany.mjs`**. Der Installer verwaltet eine `.env` sowie eine geschützte externe Installationszuordnung und erhält geprüfte vorhandene Daten. Nur echte Portzuordnung und Browseradresse müssen zur eigenen AMP-Instanz passen. [Vollständige Neuinstallationsanleitung](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/AMP-SCHNELLSTART.md).

Rivermere-Koordinaten lassen sich nicht verlustfrei nach Deutschland verschieben. Deshalb erhält Deutschland einen eigenen Spielordner und eine eigene Welt-/Datensatzkennung. Bestehende Konten, Wachen, Geld und laufende Vorgänge werden nicht automatisch übertragen. Alte Datenbanken können vollständig und schreibgeschützt exportiert werden; das aktuelle Programm baut und startet kein Altprodukt mehr. Eine normale Programmaktualisierung schaltet keine private Instanz um.

Der Deutschland-Einstieg ist `node scripts/start-germany.mjs`. Er benötigt ein vorbereitetes externes `GEODATA_DIR` und ein separates `DATA_DIR`. Der Build erzeugt `dist/server` und `dist/client`; der Launcher kann den passenden lokalen Router mitstarten. Geodaten werden einmalig vorbereitet, nicht bei jedem Start importiert. Die [vollständige Betreiberanleitung](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/DEUTSCHLAND.md) enthält AMP-Felder, Quellen, Sicherungen und Grenzen.

Eine deutschlandweite Kamera erweitert keine Zugriffsrechte. Neue Einsätze bleiben in ihrer Leitstelle. Gemeinsame Disposition und ausdrückliche Nachbarhilfe verwenden weiterhin die bestehenden Berechtigungen; fremde private Spielobjekte werden nicht über Kartenendpunkte verteilt.

## Grenzen

OSM ist ein fester Datenstand ohne Live-Verkehrsgarantie. Die Krankenhäuser sind real verortet, ihre Betten-/Behandlungskapazitäten sind Spielregeln. Eine vollständige amtliche Leitstellenzuordnung aller Adressen wird nicht behauptet. Ereignisbedingte Straßensperren halten betroffene Fahrten bis zur Freigabe an; eine kantengenaue Ausweichroutenberechnung ist noch offen. Für Rettungsboote fehlt ein freigegebenes Wasserwegenetz, deshalb erzeugt Deutschland derzeit keine Bootseinsätze. Unverbundene Straßen werden niemals durch Luftlinien ergänzt.

Historische Prüfungen mit echtem Deutschlandpaket, Browserauflösungen und Screenshots stehen im [historischen Testbericht](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/DEUTSCHLAND-TESTBERICHT.md). [[Karte-und-Fahrten]] · [[Serverbetrieb]] · [[Roadmap]].
