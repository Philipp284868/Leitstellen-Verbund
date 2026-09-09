# Leitstellen-Verbund

PC-Multiplayer im Browser: anmelden, berechtigte Leitstelle öffnen, Notrufe bearbeiten und echte serverseitige Einsätze koordinieren. Es gibt keinen aktiven Einzelspieler-Modus und keine Smartphone-/Tablet-Version.

## Wegweiser

- [[Einstieg und PC-Voraussetzungen|Einstieg]]
- [[Server, Konto und Leitstelle|Serverbeitritt]]
- [[Rollen und Berechtigungen|Berechtigungen]]
- [[Hauptmenü, neue Hauptleiste und Tastatur|Bedienung]]
- [[Notruf, Disposition, AAO, FMS und Funk|Einsatzablauf]]
- [[Persönliches Tutorial und Übungswelt|Tutorial]]
- [[Euro, Grundfinanzierung und Bestandsschutz|Wirtschaft]]
- [[Automatische Wachbesetzung|Wachen-und-Personal]]
- [[Audio, Einstellungen und lokale Sicherung|Audio-und-Einstellungen]]
- [[Level, XP und Freischaltungen|Fortschritt]]
- [[Karte, Straßenlimits und ETA|Karte-und-Fahrten]]
- [[Ganz Deutschland: echte Geografie und kontrollierter Weltwechsel|Deutschland]]
- [[Serverbetrieb, Sicherungen und Migrationen|Serverbetrieb]]
- [[Entwicklung, Tests und Releases|Entwicklung]]
- [[Grenzen und Roadmap|Roadmap]]

Diese Seiten beschreiben Version **2.22.0**. Die gemeinsamen Einstellungen verwenden Vorschau, Übernehmen und Verwerfen. Das [[Tutorial]] führt in 16 Kapiteln durch das tatsächliche Spiel; eine persönliche serverseitige Übungswelt schützt den normalen Bestand. Fertige Wachen liefern ihre passende [[Besetzung und Qualifikation|Wachen-und-Personal]] automatisch. [[Europreise, Grundfinanzierung und Migration|Wirtschaft]] ersetzen alte Credits und wiederholbare Förderklicks. [[Audio-und-Einstellungen]] erklärt getrennte Klanggruppen, eigene lokale Dateien und die Gerätesicherung.

Bereite Fahrzeuge können weiterhin schon auf der Rückfahrt erneut alarmiert werden. Das Notrufaufkommen richtet sich nach Ausbau, offenen Vorgängen und freien Fahrzeugen. Technische Hilfe bildet den Schwerpunkt; ungeklärte Anrufe bleiben neutral. Fähigkeitsbasierte Aufgaben, automatische Störungsbehebung und der gezielte Kräfteabzug gehören zum [[Einsatzablauf]]. Die [[Kartenübersicht|Karte-und-Fahrten]] erklärt grüne medizinische Marker und getrennte Dringlichkeit.

Im Spiel bleibt die Deutschlandkarte unter einer kompakten oberen Hauptleiste frei; Einsatzliste, Kartenwerkzeuge und Disposition öffnen sich bei Bedarf. Die öffentliche Spielerliste zeigt verbundene Disponenten und echte gewählte Wachenstandorte, ohne private Einsätze oder Besitz freizugeben.

Die bisherigen 653 Einsatzvorlagen, freiwilligen Anreisen, Fahrzeug-Nachbereitung und das vollständige Archiv bleiben erhalten. Die Regeln für Lagemeldung, Crew-Auswahl, erfüllbare Folgeereignisse, Klinikprofile, FMS-Zeitpunkte und tatsächlichen Einsatzabschluss sind nachgeschärft; siehe [[Einsatzablauf]]. Es gibt keine globale NPC-/Personalzahl in der Hauptleiste.

Die Deutschland-Neuinstallation bezieht Programm und fertige Geodaten weiterhin automatisch über GitHub: Setup `node scripts/install-germany.mjs`, Start `scripts/start-germany.mjs`. [[Serverbetrieb]] nennt den vollständigen Ablauf. Informationen zu bestehenden Rivermere-Installationen sind historische Betriebshinweise; deren Daten bleiben geschützt und werden nicht in Deutschlandkoordinaten umgedeutet. Eine Freigabe des Produktionsupdates erfolgt separat durch den Serverbetreiber. Die verbindliche Quelle liegt im Hauptrepository unter docs/wiki; ausschließlich geprüfte main-Stände werden einseitig veröffentlicht.

## Weltlagen und Katastrophenschutz ab 2.22

Der gemeinsame [[Notrufarbeitsplatz|Einsatzablauf]] verbindet Gespräch, bekannte Fakten und Disposition. Funkmeldungen werden am Arbeitsplatz nacheinander hörbar. Eine persistente [[Weltlage|Weltlagen-und-Katastrophenschutz]] steuert ruhige Phasen und besondere regionale Belastungen; Katastrophenbereitschaft bleibt eine ausdrückliche Entscheidung der Leitung. FFW-Kern, KatS-Wachen mit GW-SAN/NKTW, physische Garagen, freie Fahrzeugwünsche und die 900-Sekunden-Prüfung sind tatsächlich eingebunden. Die Datenbankmigrationen 15–18 erhalten vorhandene Bestände und erzeugen vorher eine Sicherung.
