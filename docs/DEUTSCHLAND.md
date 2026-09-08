# Deutschland als Serverwelt · Version 2.16

Die Deutschlandwelt verbindet eine lokal ausgelieferte Vektorkarte mit einem lokalen Straßenrouter und einem räumlichen Orts-/Adressindex. Alle drei verwenden denselben vollständigen Deutschland-Auszug von OpenStreetMap. Kartenbewegung und Zoom sind lokal; Simulation, Baugenehmigung, Fahrweg, Fahrzeiten, Krankenhaussuche und Berechtigungen bleiben auf dem Spielserver. Das Spiel bleibt PC-Multiplayer und Echtzeit 1×.

## Anwendung bauen und bewusst auf Deutschland wechseln

`node scripts/amp-setup.mjs` installiert die gesperrten Projektabhängigkeiten und baut beide getrennten Serverprogramme. Der bestehende Startpfad `dist/server/index.js` bleibt für vorhandene Rivermere-Installationen erhalten. Der Deutschland-Server liegt unter `dist/germany/server/index.js`, sein Client unter `dist/germany/client/`. `npm run build:germany` baut gezielt diesen Teil. Es gibt im Spiel keinen Kartenumschalter, der eine laufende Welt neu deutet.

Deutschland wird durch `node scripts/start-germany.mjs` gestartet. Dieser Einstieg startet den eigenen GraphHopper-Prozess, wartet auf dessen Bereitschaft und startet danach den Spielserver. Ist `GRAPHHOPPER_URL` ausdrücklich gesetzt, wird stattdessen der bereits vom Betreiber gestartete lokale Dienst verwendet. Ein belegter Standardport wird nicht übernommen oder beendet. Die Simulation startet erst mit einem vollständigen, passenden Geodatenpaket. Fehlende Geodaten lösen eine konkrete Fehlermeldung aus.

Ein einmaliger Geodatenaufbau ist erforderlich; er gehört nicht in AMP-Pre-start. [Quellen, Größen, Werkzeuge und Pipeline](DEUTSCHLAND-DATEN.md), [Routing und Datenvertrag](DEUTSCHLAND-ROUTING.md) sowie [Copernicus-Höhenmodell](DEUTSCHLAND-HOEHEN.md) beschreiben die Vorbereitung. Das Programmarchiv enthält keine mehreren Gigabyte großen Geodaten und keine fremden Spielstände.

Das fertige Manifest bindet Quellen und Artefakte über SHA-256-Prüfsummen. Zusätzlich vergleicht der Spielserver beim Start die Laufzeitidentität des erreichbaren Routers: Version, Import- und Quelldatum, räumliche Ausdehnung, Profile, Höhenkonfiguration und codierte Straßenmerkmale müssen zum freigegebenen Import passen. Ein alter oder abweichender Dienst auf demselben Port wird zurückgewiesen. GraphHopper veröffentlicht selbst keinen PBF-Dateihash; die Quellenbindung entsteht deshalb durch die kontrollierte Importpipeline und deren Prüfung des lokalen Graphbestands, ergänzt um diesen Laufzeitvergleich.

Beispielkonfiguration für einen neuen Linux-Server:

```dotenv
HOST=0.0.0.0
PORT=8080
PUBLIC_URL=https://spiel.example.org
DATA_DIR=/srv/leitstellen/deutschland-spieldaten
GEODATA_DIR=/srv/leitstellen/deutschland-geodaten
TRUSTED_PROXIES=127.0.0.1
```

Port, Domain und Proxy-Adresse sind Beispiele und müssen den tatsächlich zugewiesenen Werten entsprechen. Beide Datenordner liegen dauerhaft außerhalb des Programmverzeichnisses und getrennt voneinander. In Containern müssen sie eingehängt sein. Der verwaltete Router bindet ausschließlich `127.0.0.1:8989`, seine Verwaltung `127.0.0.1:8990`. Nur der Spielport wird durch HTTPS/Reverse Proxy veröffentlicht. Auf den Spiel-PCs werden weder Java noch eine Geodatenkopie benötigt.

AMP für die bewusst neu angelegte Deutschlandwelt:

| Feld                       | Wert                         |
| -------------------------- | ---------------------------- |
| Node.js                    | 24                           |
| npm Install Type           | None                         |
| Run App Setup Commands     | aktiviert                    |
| App Setup Commands         | `node scripts/amp-setup.mjs` |
| App Name                   | `scripts/start-germany.mjs`  |
| App Installation Location  | leer                         |
| Run App Pre-start Commands | deaktiviert                  |

Das vorbereitete Paket enthält eine portable Java-Laufzeit und den importierten Router. Keine globale Administratorinstallation ist erforderlich. Der Launcher beendet seine eigenen Kinder beim regulären Stopp; ein gesondert verwalteter Router bleibt in der Verantwortung seines Dienstmanagers. Der Anwendungspfad `dist/germany/server/index.js` ist für Betreiber geeignet, die GraphHopper bewusst separat starten.

## Bestandsschutz und Sicherungen

Rivermere- und Falkenried-Koordinaten besitzen keine verlustfreie geographische Entsprechung. Deshalb werden bestehende Wachen, Fahrzeuge, Einsätze, Guthaben und Konten nicht automatisch verschoben oder in Deutschland importiert. Ein alter Datenordner wird vor schreibenden Weltmigrationen zurückgewiesen. Die alte Instanz kann mit ihrem bisherigen Startpfad und ihrem unveränderten Datenordner weiterlaufen. Für Deutschland wird ein neuer, leerer Spielordner angelegt und ein normales Konto registriert. Eine Zusammenführung der beiden Wirtschaften findet nicht statt.

Vor dem Wechsel die alte Instanz sauber stoppen, mit ihrer bisherigen CLI sichern und die Wiederherstellbarkeit prüfen. Den vorhandenen Ordner anschließend als Bestand behalten. Bei einem geplanten Rückwechsel den Deutschland-Server stoppen und den bisherigen Programm-/Datenstand wieder starten. Keine Dateien zwischen den beiden SQLite-Welten vermischen.

Die Datenbankschemaversion bleibt 12. Zusätzlich erhält eine Deutschlanddatenbank den Metadatenschlüssel `geodata-dataset-v1`, der den SHA-256 des verwendeten OSM-Snapshots enthält. Welt-ID `germany-1`, Weltseed und Datensatz müssen zum geladenen Server passen. Ein abweichender OSM-Snapshot wird beim Öffnen abgewiesen. Ein neues Geodatenpaket allein ist somit kein automatisches Weltupdate. Ein späterer verlustfreier Snapshotwechsel benötigt einen eigenen geprüften Migrationsschritt.

Deutschland-Wartung wird bei gestopptem Spielserver über `node dist/germany/server/cli.js backup`, `restore` oder `archive-export` ausgeführt; die bestehenden Argumente und Schutzregeln aus [AMP](AMP.md) gelten. Befehle, die Spielstände validieren, benötigen den passenden lokalen Router und Geodatenindex. Bei verwaltetem Router diesen für die Wartung mit `node scripts/geodata/pipeline.mjs serve` starten. Sicherungen zusammen mit Welt-ID, Datensatzkennung und dem passenden Geodatenmanifest aufbewahren. Kontensicherungen ersetzen keine Sicherung der wiederverwendbaren Geodaten.

## Spielen und orientieren

Die Suche liest wirkliche Orte, Ortsteile, Straßen und vorhandene OSM-Adressen aus dem lokalen Index. Ortsnamen mit exakter Übereinstimmung werden bevorzugt. Ein Klick zentriert die Karte am Suchergebnis. Nicht jede reale Adresse ist in OSM erfasst; das Spiel erfindet keine Hausnummern. Beim Wachbau wird ein geeigneter Straßenstandort serverseitig gesucht und erst nach der sichtbaren Bestätigung gekauft. Brücken, Tunnel und ungeeignete Zugänge werden nicht zu Bauplätzen.

Die Suche beginnt mit zwei Zeichen und liefert höchstens 20 Vorschläge. Sie wertet höchstens 256 passende Volltext-Kandidaten aus und zieht exakt benannte Orte zusätzlich über einen eigenen Index vor. Das verhindert eine Sortierung von Millionen häufiger Adresstreffer im Simulationsprozess. Bei sehr allgemeinen Begriffen ist die Liste deshalb eine begrenzte Auswahl; ein genauerer Straßen-/Ortsname grenzt sie ein. Eine vollständige, weltweit nach Relevanz sortierte Geocodierung wird nicht angeboten.

Mausziehen verschiebt, das Mausrad zoomt zum Zeiger. Bei fokussierter Karte funktionieren Pfeiltasten und +/−; Pos1 zeigt Deutschland. Strg+Mausrad bleibt Browserzoom. Nach einem Drag wird kein Standortklick ausgelöst. Escape beendet die Bauplatzwahl. HUD, Suchfelder und unabhängig scrollende Listen behalten ihre Eingabefunktion. Wachen, Fahrzeuge und bekannte Einsätze sind über ihre Listen/Marker erreichbar; Fahrzeugverfolgung bewegt nur die eigene Kamera.

Notrufe entstehen nahe den eigenen einsatzfähigen Standorten an realen Straßenankern. Aus der beobachteten Adresse werden Suche und Einsatzansicht gespeist. Die bestehende Notruf-, AAO-, Alarm-, FMS-, Funk-, Nachforderungs-, Abschluss- und Historienlogik bleibt dieselbe. Einsätze einer fremden Leitstelle werden nicht durch den großen Kartenausschnitt sichtbar: Nur dieselbe berechtigte Leitstelle und ausdrücklich freigegebene Zusammenarbeit liefern entsprechende Spielobjekte.

Fahrwege kommen vollständig vom Straßenrouter. Entfernungen verwenden die aufeinanderfolgenden geographischen Routenpunkte; die Kartenprojektion ist kein Maßband. Autobahnen, Stadtstraßen, Einbahnen, Zu-/Abfahrten, Brücken, Tunnel und Abbiegebeschränkungen stammen aus dem Straßenmodell. Fahrzeuglimits und hinterlegte Abschnittsgeschwindigkeiten bestimmen Fahrt und ETA gemeinsam. Ein fehlender oder unverbundener Weg wird als Fehler behandelt und erzeugt keine Luftlinie.

## Darstellung und Datenmenge

MapLibre GL lädt nur benötigte lokale Vektorkacheln in den Detailstufen 0–14; höhere Kamera-Zoomstufen vergrößern die Detailkacheln. Systemschriften und ein begrenztes Label-Canvas vermeiden externe Schriftanbieter. Straßen/Flächen und Labels werden abhängig vom Zoom dargestellt. Der vollständige Länderumriss kommt aus OSM-Grenzgeometrien, nicht aus der rechteckigen Kameragrenze. Die Übersicht umfasst Deutschland einschließlich relevanter Inseln; Küsten, Gewässer, Wald und Landnutzung kommen aus offenen Quelldaten.

Das optionale, separat geprüfte Copernicus-Höhenpaket ergänzt eine ruhige Höhenschummerung unter den Straßen. Ohne dieses Artefakt werden weiterhin reale Landnutzung und Gipfel angezeigt; die Oberfläche behauptet dann kein geladenes Höhenraster. Quellenhinweise bleiben sichtbar.

Der Server öffnet Karten-/Suchdaten ausschließlich lesend. Kacheln besitzen einen begrenzten gemeinsamen Cache von 32 MiB, Ortsabfragen einen begrenzten Ergebniscache. Das Routing hält höchstens 512 Routen beziehungsweise 200.000 Geometriepunkte; lokale Standortabfragen nutzen räumliche Indizes. Die Karte filtert Marker auf den sichtbaren Bereich und begrenzt/verdichtet große Mengen. Sie lädt nicht Millionen Straßenanker in den Browser.

Socket-Verbindungen übertragen bereits bekannte lange Routen über geprüfte Geometriereferenzen. Wiederverbindung, Streamwechsel oder Berechtigungswechsel erzwingen einen neuen vollständigen autorisierten Stand. Unbekannte Referenzen sperren Aktionen bis zur Synchronisierung. Diese Transportoptimierung erspart wiederholte Geometrieübertragung; SQLite-Spielstände und serverseitige Snapshotbildung bleiben vollständige Zustände. Deren CPU-Kosten sind bei sehr großen Leitstellen weiterhin ein eigener Skalierungsfaktor.

## Fachliche Grenzen

- OSM ist ein versionierter offener Datenstand, kein Live-Verkehrs- oder amtlicher Navigationsdienst. Verkehrslagen im Spiel sind deterministische Simulationsereignisse.
- Die Straßenfolge stammt einheitlich aus dem schnellsten allgemeinen Car-Profil. Fahrzeuggrenzen ändern die tatsächliche Fahrt und ETA, optimieren aber nicht für jeden Fahrzeugtyp die Straßenwahl erneut. Dieses feste Profil hält auch Fernstrecken mit vorbereiteten Landmarken schnell berechenbar.
- Eine optische Kreuzung verbindet Straßen nur, wenn die OSM-Topologie dies zulässt. Inseln ohne erreichbare Fahrzeugverbindung erhalten keine erfundene Überfahrt.
- Straßensperren auf einer betroffenen tatsächlichen Routingkante stoppen die Fahrt bis zur Freigabe. Das aktuelle Profil berechnet für diese Spielereignisse noch keine verlässlich kantengenaue Ausweichroute; deshalb werden keine scheinbar passenden Umleitungen gezeichnet.
- Für Rettungsboote fehlt ein freigegebenes Wasserwegenetz. Deutschland erzeugt deshalb derzeit keine Bootseinsätze. Wasser wird nicht mit Autostraßen oder einer Luftlinie überbrückt.
- OSM-Krankenhäuser liefern reale Standorte, aber keine Echtzeitbetten oder verifizierten Fachabteilungen. Betten und Behandlungskapazitäten sind ausdrücklich Spielregeln.
- Verwaltungsgrenzen sind kartographisch vorhanden. Eine komplette amtliche Zuordnung jeder Adresse zu einer realen Leitstelle ist nicht Bestandteil des Datenimports; Zuständigkeitsbereiche und Zugriffsrechte bleiben die konfigurierten Spielregeln.

Die tatsächlich ausgeführten Prüfungen, Datengrößen, Browserauflösungen und Bildschirmaufnahmen werden im [Deutschland-Testbericht](DEUTSCHLAND-TESTBERICHT.md) festgehalten. Automatisierte kleine Testdatensätze ersetzen dort nicht die ausdrücklich ausgewiesenen Prüfungen mit dem vollständigen Deutschlandpaket.
