# Netzwerkprotokoll 1 / Welt falkenried-1

## Signaling

Angebot und Antwort sind JSON-Dokumente mit `protocol`, `world`, `session`, `expires`, `player`, `name`, `generation` und einer SDP-Beschreibung. Maximale Länge: 110.000 Zeichen. Einladungen verfallen nach zehn Minuten. SDP ist auf 100.000 Zeichen begrenzt. Nur passende Antworttypen und die aktuelle Session werden angenommen. Die ICE-Sammlung endet vollständig oder mit einem Fehler nach 20 Sekunden. Ein offener DataChannel bestätigt die Verbindung; eine Raumkennung alleine genügt nicht.

Es gibt keine automatischen Einladungslinks, keinen Signaling-Dienst und keine zentrale Hostwahl. Für zwei bis vier Teilnehmer wird ein vollständiges Netz direkter Verbindungen manuell hergestellt. Datenkanäle sind zuverlässig und geordnet.

## Nachrichtenhülle

Alle Nachrichten tragen Protokoll- und Weltversion, Verbindungs-Session, akzeptierten Absender, dessen Spielstandgeneration, eindeutige Nachrichten-ID und monoton steigende Sequenznummer. Gerätezeit eines fremden Peers entscheidet keine Konflikte. Nachrichten über 32.000 Zeichen, inkompatible Versionen, falsche Absender oder Sessions und alte Sequenzen werden verworfen. Zulässige Nutzlasten werden mit Zod validiert.

| Nachricht   | Wirkung                                                                                |
| ----------- | -------------------------------------------------------------------------------------- |
| `ping`      | Verbindung frisch halten                                                               |
| `view`      | Begrenzte Ausgangsansicht oder Änderung mit Besitzrevision, Upserts und entfernten IDs |
| `chat`      | Reiner Text, maximal 500 Zeichen                                                       |
| `offer`     | Eigenes Fahrzeug für eine konkrete Einsatzrunde anbieten                               |
| `accept`    | Angebot bestätigen; erst jetzt alarmiert der Eigentümer                                |
| `force`     | Aktuellen, bestätigten Fahrzeugstatus einer Zuweisung melden                           |
| `transport` | Zuvor gespeicherten Patiententransport beauftragen                                     |
| `delivered` | Persistierte Patientenübergabe bestätigen                                              |
| `complete`  | Persistierten Abschlussbeleg mit Empfängerbetrag senden                                |
| `ack`       | Übernahme des Abschlussbelegs bestätigen                                               |
| `abort`     | Alte Kooperationsrunde kontrolliert beenden                                            |

Freigegebene Ansichten werden in Paketen von höchstens fünf geänderten Objekten übertragen. Pro Abgleich werden höchstens acht solche Pakete gesendet; Reständerungen folgen später. Unveränderte Objekte werden nicht erneut übertragen. Bei mehr als 256.000 Bytes ausstehendem Sendepuffer wird pausiert. Nicht übertragene Änderungen bleiben für den nächsten Abgleich ausstehend. Absenderseitiger Chat ist auf zwei Nachrichten pro Sekunde begrenzt, eingehende Pakete auf einen begrenzten Burst pro Sekunde.

## Kooperation und Eigentum

Eine Kooperationsrunde gehört genau dem Einsatzgeber. Eindeutige Einsatz-, Runden- und Zuweisungs-IDs verhindern, dass eine alte Nachricht ein neu alarmiertes Fahrzeug zurückversetzt. Angebote haben 15 Sekunden Zeit zur Bestätigung. Die lokale Alarmierungsprüfung läuft beim Bestätigen erneut. Auf dem Datenkanal empfangene Besitzobjekte müssen dem tatsächlich akzeptierten Peer gehören; sie sind nur Ansichten.

Kräfte zählen nur am Einsatzort und mit einer höchstens sechs Sekunden alten lokalen Empfangsbestätigung. Fahrzeuge mit ungeeigneten Fähigkeiten helfen nicht durch ihre bloße Anzahl. Patiententransportaufträge und Lieferbestätigungen beziehen sich auf exakt dieselbe Runde und Zuweisung.

## Geldbelege und Abgleich

Der Koordinator speichert den abgeschlossenen Einsatz einschließlich bestätigter Empfängerliste vor dem Versand. Helferbelege heißen `coop:<round>:<recipient>`. Der Empfänger braucht einen passenden eigenen Unterstützungsvorgang oder einen bereits bekannten Beleg; der Betrag darf die vereinbarte maximale Hälfte der Grundbelohnung nicht übersteigen. Belegprüfung und Gutschrift erfolgen atomar.

Abschlussbelege werden bis zu fünfmal pro Verbindung versendet. Eine erneute Verbindung oder ausdrücklich angeforderter Abgleich ermöglicht weitere Versuche. Empfangsbestätigungen werden beim Koordinator gespeichert. Ohne bestätigten Beleg wird keine Belohnung geraten. Frühere Backups können diese Historie zurücksetzen; es wird kein manipulationssicheres Kontensystem behauptet.

## Fehler und Trennung

Nach 15 Sekunden ohne eingehende Nachrichten gilt eine Verbindung als verloren. Nach 30 Sekunden wird fehlende Unterstützung aus der aktiven Runde entfernt und ein gebundenes fremdes Fahrzeug lokal zurückgerufen. Bereits laufende Patiententransporte dürfen sicher enden. Der Koordinator kann anschließend mit eigenen Ressourcen weiterspielen; eine abgebrochene Runde erhält eine neue Runden-ID. Späte Bestätigungen der alten Runde wirken nicht auf die neue Runde.

Fremde Ansichten werden als offline/veraltet gekennzeichnet. Chat bleibt nur im Arbeitsspeicher. Zwischen getrennten Browsern gibt es keine sofortige globale Übereinstimmung und keinen unsichtbaren Offline-Nachrichtenspeicher. Ein ehrlicher Koordinator wird vorausgesetzt; lokale Browserdaten und Koordinatorentscheidungen sind grundsätzlich manipulierbar.
