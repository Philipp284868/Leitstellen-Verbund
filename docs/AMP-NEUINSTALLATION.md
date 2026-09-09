# Deutschland komplett aus GitHub installieren

Die Deutschland-Neuinstallation benötigt einen Setup-Befehl. Er baut das Spiel, lädt das festgelegte fertige Deutschland-Geodatenpaket aus dem GitHub-Release, prüft dessen Integrität und richtet die passenden Java-/Routing-Werkzeuge ein. Ein manuelles Kopieren des großen Datenordners und ein eigener Deutschland-Import sind dafür nicht erforderlich.

Das ist eine ausdrückliche Neuinstallation der Deutschlandwelt. Der vorhandene Rivermere-Spielstand und die bisherige `.env` bleiben erhalten. Der Installer startet keinen Spielserver und veröffentlicht keine Produktionsinstanz. Eine bereits laufende Anwendung vor dem Setup in AMP stoppen.

## AMP einstellen

| AMP-Feld                   | Wert                                                       |
| -------------------------- | ---------------------------------------------------------- |
| App Download Type          | `Git repo`                                                 |
| App Download Source        | `https://github.com/Philipp284868/Leitstellen-Verbund.git` |
| Git Repo Branch            | `main`                                                     |
| Node.js Release Stream     | `24`                                                       |
| npm Install Type           | `None`                                                     |
| Run App Setup Commands     | aktiviert                                                  |
| App Setup Commands         | **`node scripts/install-germany.mjs`**                     |
| App Name                   | **`scripts/start-germany.mjs`**                            |
| App Installation Location  | leer                                                       |
| Run App Pre-start Commands | deaktiviert                                                |

In AMP **Aktualisieren/Installieren** ausführen und den vollständigen Setup-Abschluss abwarten. Der erste Download ist groß; nicht wegen eines länger laufenden Datenbezugs auf Start drücken. Node.js 24, Linux oder Windows auf x64 und Internetzugriff während der Installation sind erforderlich. Das fertige Paket umfasst **7,98 GB Download und 15,61 GB entpackte Geodaten**. Für Downloadteile, Werkzeuge und temporäre Dateien werden **mindestens 25 GB freier dauerhafter Speicher empfohlen**. Die Dateninstallation meldet ihren Fortschritt. GitHub enthält den Programmcode im Repository und die großen geprüften Daten als Release-Anhänge.

## Was automatisch angelegt wird

Im Programmordner entsteht **`.env.germany`**. Eine vorhandene Datei wird bei Wiederholung vollständig erhalten. Die allgemeine `.env` wird nicht verändert. Der Deutschland-Launcher lädt automatisch seine eigene Konfiguration.

Standardmäßig liegen zwei neue getrennte Ordner neben dem Programmordner:

```text
/AMP/node-server/
├── app/                          # Beispiel: GitHub-Programmverzeichnis
│   └── .env.germany
├── leitstellen-germany-data/     # Konten und neue Deutschland-Spielstände
└── leitstellen-germany-geodata/  # Karte, Suchindex, Höhen und Routing
```

Die tatsächlichen absoluten Pfade werden beim Setup ausgegeben. In einem AMP-Container müssen diese beiden Ordner dauerhaft eingebunden und für den App-Benutzer beschreibbar sein. Sie liegen bewusst außerhalb des Git-Programmordners. Ein Container-Neuanlegen darf diese Verzeichnisse nicht verlieren.

Wenn andere Ablageorte benötigt werden, **vor der ersten Installation** `GERMANY_DATA_DIR` und `GERMANY_GEODATA_DIR` als AMP-Umgebungsvariablen setzen. Alternativ `.env.germany` vorher selbst mit den gewünschten `DATA_DIR`-/`GEODATA_DIR`-Werten und Netzwerkeinstellungen anlegen. Nach der ersten Einrichtung gelten die dort gespeicherten Datenpfade; ein späterer Setup-Lauf setzt sie nicht zurück. Die allgemeinen alten AMP-Werte `DATA_DIR` und `GEODATA_DIR` wählen keinen neuen Deutschland-Spielstand aus.

Der Installer verweigert Datenpfade im Programmordner, übergeordnete Verzeichnisse, ineinander verschachtelte Spiel-/Geodaten und die Überlagerung alter Spielstände. Ein unbekannter nichtleerer Ziel-Spielordner wird bei Neuanlage nicht verwendet. Bestehende Daten werden weder gelöscht noch automatisch zu Deutschland umgewandelt.

## Nur die echte Serveradresse prüfen

Bestehende Einstellungen für `HOST`, `PORT`, `PUBLIC_URL`, `TRUSTED_PROXIES` und `ALLOW_HTTP` aus der bisherigen `.env` oder den AMP-Umgebungsvariablen werden übernommen. Ausdrücklich gesetzte Netzwerk-Umgebungsvariablen haben weiterhin Vorrang. Eine bereits bewusst eingerichtete HTTP-Testausnahme bleibt erhalten; der Installer aktiviert keine neue Ausnahme.

Bei einer vollständig frischen Instanz ohne solche Werte wird eine lokale Konfiguration angelegt:

```dotenv
HOST="0.0.0.0"
PORT="7777"
PUBLIC_URL="http://127.0.0.1:7777"
TRUSTED_PROXIES=""
ALLOW_HTTP="false"
# DATA_DIR und GEODATA_DIR werden automatisch als absolute Pfade ergänzt.
```

**`PORT` muss dem tatsächlich zugewiesenen internen AMP-Anwendungsport entsprechen. `PUBLIC_URL` muss vor dem Zugriff anderer Rechner auf die wirkliche Browseradresse gesetzt werden.** Beispiel hinter einem korrekt eingerichteten HTTPS-Reverse-Proxy: `PUBLIC_URL="https://leitstelle.example.org"`. Die lokale `127.0.0.1`-Adresse ist nur ein sicherer Startwert und keine öffentliche Spieladresse. Portzuweisung, Domain und Proxy lassen sich nicht zuverlässig aus einem GitHub-Repository ermitteln. Die Anwendung selbst richtet keinen HTTPS-Proxy oder Router-Portweiterleitungen ein.

Bei einem Reverse-Proxy nur dessen tatsächliche unmittelbare IP-Adressen in `TRUSTED_PROXIES` eintragen. Nicht pauschal alle Netze vertrauen. Anschließend Datei speichern und in AMP **Start** wählen. Der Launcher startet den lokalen Routingdienst und das Spiel gemeinsam. Nur wenn ein passender Routingdienst bewusst separat betrieben wird, dessen `GRAPHHOPPER_URL` ausdrücklich in `.env.germany` setzen.

Auf der Spielwebsite kann ein normales Spielerkonto erstellt werden. Es wird kein Standardpasswort oder automatisches Administratorkonto angelegt.

## Wiederholen, aktualisieren und sichern

Nach einem unterbrochenen Download denselben Setup-Befehl erneut ausführen. Die Dateninstallation prüft vorhandene Paketbestandteile und setzt ihren kontrollierten Bezug fort. Fehlerhafte oder nicht passende Daten werden nicht als fertige Karte freigegeben. Erst nach erfolgreicher Installation das Spiel starten.

Für normale Updates: Anwendung stoppen, Spielstand sichern, den konkret geprüften `main`-Stand in AMP aktualisieren und denselben Setup-Befehl ausführen. `.env.germany`, Konten und Spielstände bleiben erhalten; fertige passende Geodaten werden wiederverwendet. Für eine wirklich neue zusätzliche Welt einen neuen leeren Spielordner ausdrücklich konfigurieren. Kein vorhandenes Verzeichnis löschen, um eine Fehlermeldung zu umgehen.

`.env.germany` separat sichern. SQLite-Spielstände mit dem vorhandenen Sicherungs-/Wiederherstellungsablauf behandeln; eine laufend beschriebene Datenbank nicht als einzelne Datei blind kopieren. Die Geodaten sind erneut installierbar und sollten in der zum Spielstand gehörenden Version erhalten bleiben. Der normale Setup-Befehl aktualisiert den Datenbestand nicht auf eine beliebige neue OSM-Version.

Weitere Hinweise: [Deutschlandbetrieb und Weltgrenzen](DEUTSCHLAND.md), [Datensatz und Import](DEUTSCHLAND-DATEN.md), [Quellen und Lizenzen](LIZENZEN.md), [bestehende AMP-Installationen](AMP.md).
