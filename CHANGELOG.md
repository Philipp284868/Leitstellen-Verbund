# Änderungen

## Korrektur Notrufstart · 10.09.2026

- Neue Leitstellen und Fuhrparks mit weniger als drei Fahrzeugen erhalten ein Notrufintervall von fünf bis acht Minuten, auch nachts sowie in ruhigen Welt- und Erholungsphasen. Die bisherige zusätzliche Drosselung konnte den ersten Einsatz über zehn Minuten und Folgeintervalle bis zu zwanzig Minuten verzögern. Die ersten drei Einsätze bleiben einzeln; laufende Einsätze und fehlende alarmierbare Fahrzeuge blockieren weiteren Nachschub weiterhin.
- Gespeicherte Notrufplanung Version 1 wird beim nächsten Simulationsschritt zu Version 2 übernommen. Überlange verbleibende Anfängerfristen werden einmalig verkürzt; kurze Fristen, Zufallsstand, Zähler und Spielbesitz bleiben erhalten. Kein neues SQLite-Schema und kein Datenreset.
- Die leere Einsatzliste unterscheidet vorhandene Bereitschaft von fehlenden Fahrzeugen und zeigt passende nächste Schritte.
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
