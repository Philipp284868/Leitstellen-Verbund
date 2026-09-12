# Änderungen

## 2.26.0 · Verwaltete AMP-Instanz und gesicherter Neustart · 12.09.2026

- Getrennte Programmversionen, feste private Instanzkonfiguration und geschützte Update-/Resetjournale. Updates installieren geprüfte Pakete ohne lokalen Entwicklungsbuild.
- Einmaliger Reset mit konkreter Vorschau, Instanzbestätigung, geprüfter SQLite-Sicherung und neuer Weltgeneration. Kein Reset beim normalen Start oder Update; alte Sitzungen und Spielcaches werden ungültig.
- Gemeinsame Wartungssperre, bestätigte Bereitschaft vor Spielerzugriff, begrenzter Rückfall auf kompatible Programmversionen und eigene AMP-Vorlage.
- Client, Server und gemeinsame Modelle getrennt; Build und Releasewerkzeuge geordnet. Historische Testberichte und alte ungesicherte Resetlogik entfernt; Regressionen bleiben in CI.
- Das fertige Paket wird zusätzlich mit Neuregistrierung, kontrollierter Administratorfreigabe, Standort-/Fahrzeugkauf, Echtzeitverbindung und Bestandsschutz nach Reset und Update geprüft. Abhängige Lizenztexte bleiben auch nach der Paketbereinigung erhalten.

## 2.25.0 · Leitstellenarbeitsplatz und Serverbetrieb · 12.09.2026

- Aktive Spielanwesenheit für neue Notrufe; keine passive Grundfinanzierung. Tutorial und isolierte Übungswelten stillgelegt, reale Konten und Besitz erhalten.
- Linke Einsatz-/Notrufliste, permanentes Textprotokoll und Sammelmenü neben dem Leitstellennamen. Hauptmenü bereinigt, Discord-Kachel ergänzt; keine Funk-Sprachausgabe.
- Allgemeine POI-/Spieler-/Personal-Pins entfernt. Lokale Straßen, Bahn und Straßenbahn mit Brücken-/Tunnel-/Ebenenunterscheidung.
- Serverrangliste einschließlich Offline-Spielern, eindeutige persönliche Aktions- und Beteiligungszähler sowie getrennte gemeinsame Leitstellenmesswerte. Historische Lücken sind bezeichnet.
- Vollständiger ausgelieferter Versionsverlauf aus dieser Datei. Support mit Datenschutz-/Lizenzhinweisen ohne Login, bereinigten Entwürfen/Exporten sowie optionalem bewusst bestätigtem GitHub-Versand. Persistente Berichts-IDs, begrenzte Versuche und Abgleich unklarer Ausgänge.
- SQLite 21–25, strukturierte gedrosselte Betriebsdiagnose. AMP-Netzwerk- und Datenpfade bleiben bestehen.
- Kartensuche, Großlagenübersicht und Notrufarbeitsplatz bleiben über die neue Navigation erreichbar. Eingeklappte Listen verdecken keine Kartenwerkzeuge.
- Ereignisprotokoll respektiert die erste Erkundung auch beim Lesen alter Einträge und führt FMS-Doppelbelege zusammen. Ein begrenztes Fenster verhindert wiederholtes Schreiben unveränderter Historien; ältere Seiten bleiben getrennt lesbar.
- Bereinigte technische Angaben lassen sich kopieren oder exportieren. Lokale Skript-/Darstellungsfehler werden ohne Rohtexte oder Zugangsdaten gesammelt; fehlender Versionsverlauf erhält eine verständliche Fehlermeldung.
- Rangliste startet mit kompakten Spielerzeilen; Wertungsregeln und Kennzahlen öffnen sich bei Bedarf. Der Kartenlasttest bedient die neue Sammelnavigation und prüft weiterhin 100 Wachen, 500 Fahrzeuge und 40 Einsätze.

## Textprotokoll und Leitstellenmenü · 12.09.2026

- Einsatz-/Notrufreiter links, dauerhafter Textverlauf unten links und Sammelmenü unmittelbar am Leitstellennamen ersetzen die untere Navigationsleiste. Hauptmenü mit Spielen, Leaderboard-Zugang, Changelogs, Einstellungen, Support, Abmeldung und Gaminglive-Discord.
- Persistente, private Ereignishistorie mit stabilen IDs, Nachladen, wichtigen offenen Meldungen und Verbindungsaktionen. Fachliche Funkentscheidungen bleiben am Einsatz. Keine Browser-Sprachausgabe mehr.
- Tutorial, Übungsendpunkte und Übungswelten entfernt. SQLite 22/23 erhalten reale Spielstände und führen den Ereignisverlauf ein; alte Übungsanfragen werden abgewiesen.
- Keine allgemeinen POI-, Spieler- oder Personal-Pins und kein schwebender Standortfilter mehr. Reale Einrichtungen und operative Einsatz-/Fahrzeuganzeigen bleiben.

## Spielanwesenheit und Finanzierung · 12.09.2026

- Neue Notrufe erfordern eine tatsächlich aktive, authentifizierte Spielansicht. Hauptmenü, Abmeldung, verlorene/abgelaufene Verbindungen und Serverrestart halten die Erzeugung zurück. Mehrere Tabs und Leitstellendisponenten werden einzeln gezählt; laufende Einsätze bleiben bestehen.
- Keine wiederkehrende Grundfinanzierung mehr. Migration 21 erhält Guthaben und historische Buchungen und entfernt alte Auszahlungstermine. Einmaliges Startgeld und tatsächliche Einsatzvergütungen bleiben erhalten.
- Strukturierte und gedrosselte Diagnosegrundlage für Spielanwesenheit, unterdrückte Erzeugung und Speicherfehler.

[Betriebsregeln](docs/HUD-UND-SERVER.md).

## Routing-Protokoll · 11.09.2026

- Die AMP-Konsole protokolliert normale GraphHopper-Anfragen und erwartete nicht verbundene Straßenpunkte nicht mehr fortlaufend. Gezielte Laufzeit-Logger behalten Warnungen, Fehler und Start-/Stoppmeldungen bei.
- Vorhandene geprüfte `graphhopper.yml`, Geodaten und Spielstände bleiben unverändert. Die Korrektur greift nach regulärem GitHub-Update und Neustart des verwalteten Routers.
- Mit echtem GraphHopper 11 und dem vollständigen Deutschland-Datensatz geprüft: erfolgreiche Route (200), abgelehnte Route (400), ruhige Anfrageausgabe, sichtbare Lebenszyklusmeldungen und sauberer Stopp. Die CI-Werkzeugprüfung validiert die Startargumente zusätzlich mit dem tatsächlichen GraphHopper-Konfigurationsparser.

## 2.24.0 · Simulation Overhaul · 11.09.2026

- Eindeutige Patiententransporte für eigene und unterstützende RTW: individuelle Patienten-/Auftragsreferenzen, getrennte Anzeigen am Einsatzort und im Transport, Krankenhausübergabe, erneute lokale Abholung und einmaliger Abschluss.
- Kein Ein-/Zwei-Einsatz-Limit mehr. Dynamische Notrufintervalle von 20 bis 360 Sekunden berücksichtigen Fuhrpark, Auslastung, Tageszeit und gemeinsame Wetterlage. Keine nachträgliche Notrufwelle nach einer Offlinepause.
- Gemeinsame stochastische Wetter-/Lageentwicklung ersetzt den verpflichtenden Fünf-Phasen-Zyklus. Jahreszeit, Tageszeit, Varianten, Folgeereignisse und tatsächliche Nachforderungen verändern den Betrieb.
- Alternative reale Zugangspunkte sowie weitere Standort-/Vorlagenkandidaten im selben Erzeugungsversuch. Der mitgelieferte Standortkatalog behält 40.034 stabile Einrichtungsidentitäten und ergänzt 28.186 alternative Zugangspunkte; nahe kartierte Zufahrtsstraßen werden vor Kauf zusätzlich auf Landlage und beidseitiges Routing geprüft.
- Acht Beladungsoptionen mit tatsächlichen Fähigkeiten und Preisen; atomarer gemischter Fahrzeugwarenkorb über mehrere eigene Wachen. Physische Tankmengen, B-/C-Schlauchlängen, Verbrauch, Entnahme, Nachforderungen und Tankerpendel mit wirklichen Fahrten.
- Sieben neue Spezialfahrzeugtypen, weitere Einsatzvarianten und nachgewiesene POI-Ortstypen. Sortierung nach Typ, Wache, Status, Organisation, Entfernung, Bindung, Verfügbarkeit, FMS und Favorit.
- Kilometerabhängiger Verschleiß, Werkstattauftrag mit Kosten und FMS-Sperre sowie periodische KatS-/Nachbarhilfekosten. Bestehende Fahrzeuge erhalten keine rückwirkenden Wartungsstrafen.
- Eigener Spielstandreset und Kontolöschung mit Passwort, gebundener Vorschau, Bestätigungstext und Checkbox. Laufende gemeinsame Bindungen sperren den Vorgang; unbestätigte fremde Anfragen werden atomar beendet.
- Standortfilter kompakt am Kartenrand. SQLite 20 mit Vorabsicherung, additiven Speicherdaten und Schutz vor inkompatiblem Downgrade. Kein Produktionsrollout.

[Bedienung, Migrationen, Parameter und Prüfnachweise](docs/SIMULATION-OVERHAUL.md).

## Korrektur Notrufstart · 10.09.2026

- Neue Leitstellen und Fuhrparks mit weniger als drei Fahrzeugen erhalten ein Notrufintervall von fünf bis acht Minuten, auch nachts sowie in ruhigen Welt- und Erholungsphasen. Die bisherige zusätzliche Drosselung konnte den ersten Einsatz über zehn Minuten und Folgeintervalle bis zu zwanzig Minuten verzögern. Die ersten drei Einsätze bleiben einzeln; laufende Einsätze und fehlende alarmierbare Fahrzeuge blockieren weiteren Nachschub weiterhin.
- Gespeicherte Notrufplanung Version 1 wird beim nächsten Simulationsschritt zu Version 2 übernommen. Überlange verbleibende Anfängerfristen werden einmalig verkürzt; kurze Fristen, Zufallsstand, Zähler und Spielbesitz bleiben erhalten. Kein neues SQLite-Schema und kein Datenreset.
- Die leere Einsatzliste unterscheidet vorhandene Bereitschaft von fehlenden Fahrzeugen und zeigt passende nächste Schritte.
- Fahrzeitangaben reservieren in der Fahrzeugauswahl Platz, damit nachgeladene Routen die Auswahlkästchen nicht während eines Klicks verschieben.
- Regressionstests decken den gewöhnlichen Start mit einer neuen FF und einem TSF-W, echte automatische Erzeugung, ruhige Intervalle, Migration, SQLite-Neustart, identische Wiederholung sowie Notrufannahme und Alarmierung im Browser ab.

## 2.22.0

- Geordneter Funk pro Leitstelle/Kanal und eine hörbare Fahrzeugmeldung pro Arbeitsplatz, mit Prioritäten, Alterung, kontrollierter Unterbrechung, Watchdog und Historie. Musik und Telefon bleiben unabhängig. Wiederverbindung spielt keine historische Meldungswelle ab.
- Gemeinsamer Notruf-/Dispositionsarbeitsplatz mit adaptiven Fragen, Quellen und Unsicherheit, frühem Alarmieren, AAO, freier Auswahl, ETA und sichtbaren Maßnahmen. Eine zum telefonischen Meldebild entsandte Besatzung kann auch eine unerwartete Lage melden und passende Kräfte nachfordern.
- Zentral persistente Weltlagen mit sechs Profilen, fünf Phasen, regionalen Wetterwirkungen, begrenztem Aufkommen und ruhiger Erholung. Zwei kompakte obere Statusfelder zeigen Lage und öffentliche Alarmstellen ohne private Einsatzfreigabe.
- Neue Einsatzorte mit belegten Referenzen und tatsächlicher 900-Sekunden-Routenprüfung für eigene geeignete Fahrzeugprofile. Begrenzte Kandidatensuche, Cache und Wiederholung; technische Prüfung bestehender Zufahrten, Neurouting laufender Hilfe und vergütungsfreie technische Aufhebung unrettbarer Fälle.
- Katastrophenschutzwache mit vorhandenem GW-SAN/NKTW/SEG-Katalog, realer ehrenamtlicher Mobilisierung und tatsächlicher Bereitschaft; der GW-SAN transportiert keine Patienten. FFW-Kern aus einmalig vier bis sechs bestehenden Personen. Physische Garagenlisten speichern den Klappzustand.
- Freie Namenswünsche in Unterstützungsanfragen, getrennt von zugesagten stabilen Fahrzeug-IDs, mit begrenzter Eingabe und fähigkeitsbasierten Alternativen.
- SQLite-Migrationen 15–18 mit vorheriger Sicherung und lesender Vorschau. Bestehende Weltidentität, Geodaten, Besitz, Geld, XP, aktive Bindungen und Patiententransporte bleiben geschützt. Keine automatische Produktionsbereitstellung.

Fachquellen und Spielparameter: [Katastrophenschutz](docs/KATASTROPHENSCHUTZ.md), [Funk](docs/FUNKVERARBEITUNG.md), [Lagen und Einsatzorte](docs/WELTLAGEN-UND-EINSATZORTE.md). Dieser Eintrag beschreibt Funktionen; tatsächliche Prüfbelege werden gesondert dokumentiert.

## 2.21.0

### Oberfläche und Lernweg

- Gemeinsame Einstellungen für Audio, Anzeige/Karte, Steuerung und Hinweise mit Vorschau, Übernehmen und Verwerfen. Die Schnellsuche erschließt tatsächliche Menüs und Einstellungen.
- Einheitliche Formulare und Kaufbestätigungen mit Preis-/Budgetanzeige, erhaltenen Eingaben bei Serverfehlern, Schutz ungespeicherter Entwürfe und gesperrter Doppelübertragung während laufender Aktionen. Wachen und FMS besitzen getrennte Reiter.
- Persönliches Tutorial mit 16 Kapiteln und serverseitiger Übungswelt: Wachenbau, Fahrzeugkauf, technischer Einsatz und Flächenbrand mit erster Lage, echter Löschwasser-Nachforderung, zweitem Fahrzeug und Abschluss.
- Tutorial und Übung überstehen Wiederverbindung und Serverneustart. Übungsbudget, Belohnungen, Historie und Besitz bleiben von der normalen Leitstelle getrennt. Versionierte Spielkontexte und wiederholbare Kontrollbelege verhindern verspätete Aktionen im falschen Spielstand.

### Wachen und Wirtschaft

- Fertige eigene Wachen stellen passende Besatzung und Qualifikationen innerhalb ihrer freigeschalteten Funktionen automatisch bereit. Keine zusätzlichen Rekrutierungs-/Ausbildungskäufe; FF-Anreise, Mindestbesatzung, Verletzungen und laufende Bindungen bleiben wirksam.
- Exakte ganzzahlige Eurocent und Euroanzeigen. Neue Spielpreise für 50 Fahrzeugtypen, acht Gebäudetypen und vier Erweiterungen stehen in der zentralen Vorher-/Nachherliste. Dokumentierte öffentliche Beschaffungsbelege dienen als Orientierung, nicht als behauptete Marktpreise aller Angebote.
- Neue normale Leitstellen erhalten 1.400.000,00 €. Automatische Grundfinanzierung: 30.000,00 € je 15 Minuten Weltzeit bis 2.500.000,00 € Guthaben; kein Bereitschaftsdienst zum wiederholten Anklicken, keine laufenden Pflichtkosten oder Abwesenheitsrechnungen.
- Feste Einsatzvergütung mit bestehender Qualitätsbewertung, getrennte XP und Verkauf anhand des Kauf-/Bestandsbuchwerts. Zusätzliche Fahrzeuge und Wartezeit erzeugen keinen höheren Grundbetrag.
- SQLite-Schema 14 mit Vorabsicherung, schreibgeschützter Migrationsvorschau und geprüften Summen. Ein alter Credit entspricht als Designumstellung zehn Spiel-Euro; Preisversion 1 verbucht einmalig zusätzlich 60 % des umgerechneten freien Altguthabens als Kaufkraftausgleich. Laufende Vergütungszusagen, XP, Besitz und Wege bleiben geschützt. Alte bezahlte Qualifikationen werden ohne erneute Gebühr übernommen.

### Audio

- Zwei eigene Musikarrangements für Hauptmenü und Spiel mit Szenenüberblendung, getrennten Audiogruppen und Absenkung von Musik/Umgebung bei Kommunikation.
- Parallele eigene Signalinstanzen, geordnete Funkkanäle, Prioritätsbehandlung und koordinierte Ausgabe mehrerer Tabs desselben Kontos. Hintergrundverhalten ist wählbar.
- Lokale WAV-/MP3-/OGG-Zuordnungen gehören zum bestätigten Einstellungsentwurf; Regler lassen sich als JSON sichern und als Vorschau importieren. Eigene Dateien werden nicht hochgeladen und gehören nicht zur Server-Datenbanksicherung. Browsercodec, Speicher und Autoplay bleiben tatsächliche Grenzen.

### Betrieb und Nachweise

Kein automatischer Produktionsrollout und kein Welt-/Geodatenreset. Deutschland und bestehendes Rivermere behalten ihre Startpfade und Datenidentitäten. Aktuelle Anleitungen: [Spielablauf](docs/SPIELANLEITUNG.md), [Menüinventur](docs/MENUE-MATRIX-2.21.md), [Tutorial](docs/TUTORIAL-2.21.md), [Wachbesetzung](docs/GEBAEUDEBESETZUNG-2.21.md), [Wirtschaft/Migration](docs/EURO-WIRTSCHAFT.md), [Audio](docs/AUDIO.md), [AMP](docs/AMP.md).

Dieser Eintrag beschreibt die implementierten Änderungen. Er bestätigt keinen bereits abgeschlossenen finalen CI-Lauf oder eine Installation auf einem privaten Server. [Tatsächliche Abnahme 2.21](docs/ABNAHME-2.21.md) und [Releasehinweise](docs/RELEASE-2.21.md) dokumentieren den jeweiligen Prüfstand. Prüfergebnisse und Freigabe müssen zum tatsächlich veröffentlichten Commit gehören; historische Testberichte behalten ihre ursprüngliche Aussage.
