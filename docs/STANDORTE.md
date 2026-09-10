# Reale Standorte erwerben

Seit dieser Umstellung existieren Wachen und Krankenhäuser bereits im Deutschlandkatalog. **Standorte → Standort kaufen** öffnet Suche und Filter. Nach Ort, Adresse oder Name suchen, Organisation und Kaufstatus eingrenzen, Standort auswählen und den Europreis ausdrücklich bestätigen. Alternativ einen Standortmarker auf der Karte anklicken. Überlappende Einrichtungen erhalten eine Auswahlliste; im Überblick werden Marker zusammengefasst. Nach Erwerb führt **Verwalten** zu Fahrzeugen, Organisation, Personal und Ausbau.

Ein Standortkauf verleiht Verwaltungsrechte **pro Leitstelle**. Berechtigte Disponenten derselben Leitstelle teilen den Bestand. Andere Leitstellen dürfen dieselbe geografische Einrichtung unabhängig erwerben. Es gibt keine globale Exklusivität. Persönliche Übungen bleiben getrennt. Nicht erworbene Wachen schenken weder Fahrzeuge noch Personal und erhöhen das Einsatzaufkommen nicht.

Eine neue Leitstelle besitzt 1.400.000,00 € Spielgeld. Eine Feuerwache kostet 650.000,00 €, ein TSF-W 180.000,00 €; 570.000,00 € bleiben übrig. Die Spielbesetzung wird automatisch vorbereitet, normalerweise innerhalb von 25 Sekunden. Unbekannte BF-/FF-Untertypen werden als unbekannt ausgewiesen; der anfängliche Spielbetrieb nutzt das vorhandene FF-Profil. Ausbau, Ausbildung und Ausrüstung bleiben Spielmechaniken, keine behaupteten realen Dienststärken.

## Quellen und nachgewiesene Abdeckung

Das mit Git ausgelieferte Standortpaket basiert auf dem bereits vorhandenen **Geofabrik-Deutschland-PBF vom 07.09.2026**, SHA-256 `155596c0041a76f05d3b5fb03a36f2b9e26540b517fde8b4b9884c62c4fc1a90`. Die vollständigen Summen nach Typ **und Bundesland** stehen in [manifest.json](../data/facilities/manifest.json). Das komprimierte Paket ist rund 14 MB groß; der lokale SQLite-Index rund 61 MB. Es benötigt keinen zusätzlichen landesweiten Download beim Login oder Kartenzoom.

| Einrichtung                                              | Importierte Standorte |
| -------------------------------------------------------- | --------------------: |
| Feuerwehr                                                |                29.024 |
| Rettungswachen                                           |                 3.120 |
| Polizeiwachen                                            |                 3.732 |
| Krankenhäuser                                            |                 2.429 |
| THW                                                      |                   669 |
| Katastrophenschutz/SEG                                   |                   108 |
| Wasserrettung                                            |                   481 |
| Luftrettung                                              |                    90 |
| Ausbildungszentrum mit passender Kennzeichnung           |                     1 |
| Weitere, nicht als operative Wache belegte Einrichtungen |                   380 |
| **Gesamt**                                               |            **40.034** |

| Bundesland         | Einträge | Bundesland             | Einträge |
| ------------------ | -------: | ---------------------- | -------: |
| Baden-Württemberg  |    4.416 | Bayern                 |    8.358 |
| Berlin             |      324 | Brandenburg            |    1.969 |
| Bremen             |      127 | Hamburg                |      286 |
| Hessen             |    3.158 | Mecklenburg-Vorpommern |    1.286 |
| Niedersachsen      |    4.680 | Nordrhein-Westfalen    |    4.471 |
| Rheinland-Pfalz    |    2.649 | Saarland               |      488 |
| Sachsen            |    2.304 | Sachsen-Anhalt         |    1.640 |
| Schleswig-Holstein |    1.973 | Thüringen              |    1.905 |

41.206 Quellrepräsentationen wurden extrahiert und zu 40.034 Einrichtungen normalisiert. 27 fehlerhafte Geometrien wurden separat protokolliert. 4.630 Einrichtungen bestehen die statische Aktivitäts-/Zufahrtsvorprüfung; **35.271 besitzen noch keine hinreichend belegte Zufahrt**. Weitere Einträge sind wegen Betriebsstatus, unklarem Typ oder widersprüchlicher Quellen gesperrt. Auch vor einem statisch zulässigen Kauf wird die tatsächliche Routingverbindung geprüft. Ein Routingfehler verhindert Kauf und Abbuchung.

Dies ist keine vollständige Erfassung aller deutschen Einrichtungen. Besonders BF/FF, eigenständige Notarztbasen, Ausbildungsstätten, Fachbereiche und Zufahrten sind lückenhaft. 39.223 Untertypen bleiben unbekannt. Namen allein beweisen weder THW noch Berufsfeuerwehr oder Notarztstandorte. 14 widersprüchlich als Feuerwache erfasste „Streusandkasten“-Quellpunkte werden über die dokumentierte [Prüfliste](../data/facilities/reviews.json) gesperrt. Fehlende Daten werden nicht durch erfundene Standorte ersetzt.

Quelle: [Geofabrik Deutschland](https://download.geofabrik.de/europe/germany.html), © OpenStreetMap contributors, [ODbL und Attribution](https://www.openstreetmap.org/copyright). Berücksichtigt werden unter anderem [Feuerwachen](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dfire_station), [Rettungswachen](https://wiki.openstreetmap.org/wiki/Tag:emergency%3Dambulance_station), [Katastrophenschutzstandorte](https://wiki.openstreetmap.org/wiki/Tag:emergency%3Ddisaster_response), [Luftrettung](https://wiki.openstreetmap.org/wiki/Tag:emergency%3Dair_rescue_service) und die Vereinigung von `amenity=hospital` und `healthcare=hospital`. THW erfordert eine passende Organisationskennzeichnung einschließlich Betreiber und `ref:thw`. Sonstige Polizeieinrichtungen bleiben gesondert klassifiziert.

## Identität, Zufahrt und Kliniken

Stabile Standort-IDs und Quellaliasse verbinden Punkte, Flächen und Relationen. Eine gemeinsame Lage allein führt nicht zur Zusammenlegung. Mehrdeutige Campus-Dubletten und widersprüchliche Betriebsangaben benötigen Prüfung. Entfernte Einträge bleiben als gesperrter Bestand erhalten. Ein Datenupdate verschiebt keine gekauften Gebäude oder laufenden Fahrzeuge; ihre gebundene Betriebsgeometrie bleibt bestehen.

Der reale Kartenpunkt bleibt vom Routingzugang getrennt. Bei Flächen wird ein innerer Punkt verwendet. Zugänge werden bevorzugt an kartierten Eingängen, ansonsten an nachweisbaren Straßen innerhalb eines Geländes oder unmittelbar am Standort gesucht. Gebäudegrundrisse werden nicht als befahrbare Gelände behandelt. Brücken, Tunnel, Autobahnen, Schnellstraßen und Wirtschaftswege sind keine pauschalen Ersatz-Zufahrten. Die automatisierte Zuordnung ist konservativ und ersetzt keine Ortsbegehung. Wasserrettung benötigt zusätzlich einen geeigneten Uferzugang. Luftrettung verwendet die belegte Basisposition.

Öffentliche Kliniken bleiben ohne Kauf als Transportziele verwendbar. `emergency=no` schließt eine allgemeine Notfallaufnahme aus. Unbekannte Betten/Fachbereiche erhalten ausdrücklich benannte **Spielprofile**. Beim Kauf wechseln bestehende Patienten und Transportreservierungen auf dieselbe verwaltete Klinik, ohne Änderung von Fahrweg oder Ankunftszeit. Reservierte Anfahrten verhindern einen Verkauf. Historische öffentliche Quellaliasse werden weiter berücksichtigt.

Die Kaufaktion akzeptiert ausschließlich `purchase-facility` mit einer Standort-ID. Typ, Preis in ganzen Cent, Stufe, Besitzer und Geometrie bestimmt der Server. Geldbuchung, Spielbestand und Besitzrecht werden gemeinsam in SQLite gespeichert. Die Kombination aus Befehlsbeleg und eindeutigen Datenbankbedingungen verhindert Mehrfachkäufe. Freies Bauen und Versetzen werden mit `BUILDING_PURCHASE_ONLY` zurückgewiesen; gebundene Standortidentitäten lassen sich nicht durch normale Speicheraktionen verändern.

## Bestehende Spielstände vor dem ersten Start umstellen

**Kein Datenreset.** Datenbankschema 19 ergänzt Besitzrechte. Eine geografische Zuordnung alter frei platzierter Gebäude erfolgt ausdrücklich **nicht automatisch**. Beim Start mit noch ungebundenen Altgebäuden hält der Server mit `FACILITY_MIGRATION_REQUIRED` an. Konten und Spielstände bleiben erhalten. Vor dem produktiven Versionswechsel laufende Fahrten auf dem bisherigen Stand beenden und den Server stoppen.

**AMP ohne separate Shell:** Nach dem normalen Git-Update und Setup in derselben gestoppten Instanz **App Name vorübergehend auf `scripts/facilities-maintenance.mjs` setzen** und einmal starten. Ohne Argumente wird ausschließlich der Trockenlauf ausgeführt. Die Ausgabe enthält die betroffenen Gebäude mit Namen, Typ und Koordinaten sowie nahe Katalogeinträge mit Namen, IDs, Abstand und Zugang. Bei eindeutigen Vorschlägen stehen Ausgangs- und Zielstandort unter `changes`. Die Kandidatenliste umfasst denselben Einrichtungstyp im Umkreis von 100 Metern; eine leere Liste erlaubt keine beliebige Fernzuordnung. Den Bericht aus der AMP-Konsole auswerten. Der Wartungsprozess beendet sich danach absichtlich; das ist noch kein laufendes Spiel.

Der Wartungsstart lädt dieselbe Konfiguration, startet bei Bedarf selbst den Routingdienst und beendet nur seinen eigenen Dienst nach der Prüfung. Ein ausdrücklich über `GRAPHHOPPER_URL` konfigurierter externer Router bleibt unverändert. Die bestehenden Prozesssperren verhindern Wartung während des Spielbetriebs. Keine neue `.env` und keine geänderten Datenpfade erforderlich. In einem Terminal innerhalb der Programmwurzel entsprechen dem:

```sh
node scripts/facilities-maintenance.mjs
# Erst nach geprüftem Bericht mit ready=true:
node scripts/facilities-maintenance.mjs facilities-migrate --confirm
```

Der Trockenlauf liest nur und prüft den Zugang mit dem Router. `ready=true` bedeutet, dass eine bestätigte Umstellung möglich ist; durchgeführt ist sie damit noch nicht. Auch gespeicherte persönliche Übungen werden erhalten und zugeordnet; ihre Kennung erscheint als `practice:Benutzer-ID` und kollidiert nicht mit dem Livebesitz. Automatische Vorschläge verlangen denselben Typ und normalisierten Namen innerhalb von 60 Metern; die bloß nächste Wache genügt nicht. Fehlender eindeutiger Bezug, mehrfach beanspruchte Standorte und eine Verschiebung während laufender Fahrten werden als konkrete Konflikte ausgegeben. **Ein einziger ungelöster Konflikt blockiert die gesamte Umstellung.**

Belegte Einzelfälle können in einer JSON-Zuordnungsdatei stehen:

```json
[
  {
    "owner": "Leitstellen-ID aus dem Trockenlauf",
    "building": "Gebäude-ID aus dem Trockenlauf",
    "facility": "osm:way:QUELLNUMMER",
    "evidence": "Nachvollziehbarer Beleg für genau diese Zuordnung, keine bloße Nähe."
  }
]
```

```sh
node scripts/facilities-maintenance.mjs facilities-preview --resolutions zuordnungen.json
node scripts/facilities-maintenance.mjs facilities-migrate --resolutions zuordnungen.json --confirm
```

**Bestätigte Umstellung nur über AMP:** Wenn kein Terminal verfügbar ist, kann der oben geprüfte Migrationsbefehl einmalig als **App Setup Commands** eingetragen und über die Setup-/Update-Funktion ausgeführt werden. Vorher den normalen Setup-Befehl notieren und anschließend wieder auf `node scripts/install-germany.mjs` zurückstellen. Bei expliziten Zuordnungen die geprüfte JSON-Datei zuvor in der Programmwurzel ablegen. Den Migrationsbefehl nicht als dauerhaften Pre-start-Befehl eintragen. Bei einem Fehler den Bericht klären; keine Pfade austauschen und keine Datenbank löschen.

Vor dem Schreiben entsteht eine konsistente, integritätsgeprüfte Sicherung `pre-facilities-…sqlite` im vorhandenen Datenverzeichnis. Die Ausgabe nennt den genauen Pfad. Gebäude-IDs, bezahlte Werte, Kontostände, Besetzung, Fahrzeuge, AAO und Historien bleiben erhalten. Ein zweiter Migrationslauf erzeugt keine neuen Käufe oder Besatzungen. Nach erfolgreicher Umstellung in AMP **App Name wieder auf `scripts/start-germany.mjs`** stellen und normal starten. Erst „Spiel bereit“ bestätigt den Spielbetrieb.

Die direkten Befehle `node dist/server/cli.js facilities-preview` und `facilities-migrate` bleiben für betreute Wartung verfügbar, benötigen jedoch einen bereits laufenden Router. Für den direkten CLI-Aufruf zur Rücksicherung bei gestopptem Server ebenfalls zuerst den vorhandenen externen Router verwenden oder `node scripts/geodata/pipeline.mjs serve` in einem getrennten Terminal starten:

```sh
node dist/server/cli.js restore --file /tatsaechlicher/pfad/pre-facilities-…sqlite --confirm
```

Der gesicherte Altstand benötigt anschließend die vorherige Programmversion oder eine erneut geklärte Standortmigration. Keine Datenbankdateien bei laufendem Server austauschen. Archivierte Einzelspielerstände bleiben Archive; das aktuelle Produkt ist weiterhin Deutschland-PC-Multiplayer. Ungebundene Altstände aus einer ausdrücklich freigegebenen Offline-Übernahme durchlaufen dieselbe Standortmigration vor dem Spielbetrieb.

## Import und Updates

Der normale Projektbuild prüft Hash, Größe, SQLite-Integrität und Datensatzkennung und stellt `dist/server/facilities.sqlite` bereit. Ein beschädigtes Paket ersetzt den zuletzt gültigen Katalog nicht. Betreiberseitige, zum Geodatensatz passende Kataloge können als `GEODATA_DIR/facilities.sqlite` geführt werden; dieser ausdrücklich administrierte Bestand hat Vorrang und muss beim Update separat geprüft werden. Normale Installationen benötigen keine solche Kopie.

Für Datenpflege auf einer Arbeitsinstallation mit vorhandenen PBF-/Routingdaten:

```sh
node scripts/geodata/pipeline.mjs facilities
node scripts/geodata/package-facilities.mjs /pfad/facilities-candidate.sqlite --reviewed
```

Die Pipeline überschreibt keine vorhandenen Kandidaten. Vorherigen Katalog für die Identitätserhaltung beibehalten; Report und Konflikte prüfen. Die Paketierung kontrolliert sämtliche bisherigen IDs und Quellaliasse und ändert ausschließlich das lokale Git-Paket. Erst Tests, Codeprüfung und ein normaler Commit/Push veröffentlichen diese Änderung. Kein automatisches Produktionsupdate.

Der getrennte [Ergänzungskatalog](../data/facilities/supplemental.json) ist anfangs leer. Ergänzungen benötigen eine stabile `supplement:`-ID, reale Geometrie, passende explizite Quellkennzeichnungen, Bundesland, datierten Beleg und öffentlich prüfbare HTTPS-Quellen. Zulässig sind nachweislich ODbL-1.0- oder CC0-1.0-Daten; andere Lizenzen verlangen zuerst eine gesonderte Kompatibilitätsprüfung. Google Maps und fremde Kartenportale wurden nicht übernommen. Spieler können diesen Katalog nicht bearbeiten.

## Prüfung und Grenzen

Kleine reproduzierbare Fixtures prüfen die echte Java-Extraktion, Punkt/Fläche/Relation, Eingänge, Dubletten, getrennte Organisationen auf einem Campus und fehlerhafte Geometrien. Serverprüfungen decken Kaufrechte, Wiederholungen, Manipulationen, Geld/Stufe, Neustart, Klinikreservierungen und die tatsächliche CLI-Migration mit Rücksicherung ab. Zwei Browserkonten prüfen Kauf per Suchliste und Kartenmarker einschließlich Überlappung, Verwaltung, Reconnect und Neustart. Bestehende Spielabläufe bleiben in der vollständigen CI enthalten.

Zusätzlich wurde der echte Deutschland-Router mit isolierten Spielständen geprüft: In allen 16 Bundesländern gelang ein Feuerwachen-Kauf einschließlich TSF-W und Besatzung. Vier von fünf ausgewählten Kliniken bestanden die Kauf-/Routingprüfung; eine Verbindung wurde vom Router abgelehnt. Das ist eine Stichprobe, keine Prüfung aller Standorte. Die private AMP-Installation und ihre konkreten Migrationskonflikte wurden nicht verändert oder geprüft.
