# Notruf bis Einsatzhistorie

1. Einen eingehenden Notruf über das Telefonsymbol oder die aufgeklappte Einsatzliste annehmen.
2. Ort, Meldebild und weitere Informationen erfragen. Unbekannte Angaben bleiben unbekannt, bis sie aufgenommen wurden.
3. Eigene AAO konfigurieren und Vorschlag berechnen oder Fahrzeuge frei auswählen. Verfügbarkeit, Besatzung und erforderliche Fähigkeiten beachten.
4. Alarmierungsart und Anfahrtsart wählen und ausdrücklich alarmieren. DME, Sirene und Wachalarm verwenden die vorhandenen Ausrückprofile.
5. Ausrücken, Route, ETA und FMS verfolgen.
6. Erste Lagemeldung ausdrücklich aufnehmen und Sprechwünsche bearbeiten. Eine Erkundung kann weitere Kräfte erfordern. Bloßes Schließen eines Sprechwunschs, eine Rückfrage oder eine Nachforderung bestätigt die erste Lage nicht.
7. Kräfte nachfordern; gegebenenfalls Nachbarleitstelle um gezielte Unterstützung bitten.
8. Nach Versorgung/Bearbeitung den serverseitigen Abschluss verfolgen. Patienten werden mit geeigneten Fahrzeugen in geeignete Kliniken transportiert. Offene Gefahren, Pflichtaufgaben oder Transporte verhindern den Abschluss. Entsteht erneut eine relevante Gefahr, muss nach der Stabilisierung auch die Nachkontrolle erneut abgeschlossen werden.
9. Historie und Auswertung über das Archiv der Einsatzliste öffnen; vorhandene Berichte lassen sich exportieren, drucken und als Ereignisverlauf wiedergeben.

FMS 0–9, Organisationsdefinitionen, begründete manuelle Korrekturen und deren Historie stehen im FMS-Bereich bereit. Eine Anzeigeänderung ersetzt keine reale Alarmierung. Offene Sprechwünsche verschwinden nicht automatisch durch das Öffnen eines anderen Panels.

Die Hauptleiste **Funk** öffnet die Sprechwünsche, den Leitstellenfunk oder FMS und Alarmierungsprofile. Die AAO berechnet einen Vorschlag; erst die ausdrückliche Alarmierung bindet Fahrzeuge und Personal. Dieselbe verfügbare Person kann innerhalb einer Auswahl nicht gleichzeitig mehrere Besatzungen bilden. Server und Auswahl prüfen dies unabhängig erneut. Abfahrtszeit, FMS-Eintrag und Bewegung beziehen sich auf denselben geplanten Zeitpunkt, auch wenn dieser zwischen zwei regelmäßigen Server-Ticks liegt.

Notrufe entstehen einzeln und versetzt. Die Grundspanne von 90–210 Sekunden wird durch Tageszeit, Wetter, Gebiet und aktuelle Flächenlagen verändert. Es gibt keine Obergrenze aktiver Einsätze. Nach Serverstillstand wird kein Rückstau normaler Notrufe nacherzeugt. Normale Fälle erhalten keine automatisch identischen Zweitanrufe; zusätzliche Anrufer großer sichtbarer Lagen bringen weitere Informationen.

Der Generator prüft Freischaltungen und die vorhandenen Fahrzeugfähigkeiten einschließlich anfänglicher Patienten-, Gefahren- und Organisationsbedarfe. Vorübergehend anderweitig eingesetzte Fahrzeuge gehören weiterhin zum Bestand; die Prüfung verspricht deshalb keine sofortige Verfügbarkeit. Noch nicht erfüllbare gespeicherte Folgeereignisse bleiben ausstehend und werden später erneut geprüft. Meldung und tatsächliche Lage können voneinander abweichen; eine spätere Anruferaussage überschreibt keine bereits aufgenommene bestätigte Lagemeldung.

Neue Feuerwachen sind freiwillig organisiert. Geeignete und intern verfügbare Kräfte kommen nach einer Alarmierung tatsächlich versetzt auf Straßen zur Wache. Erst mit ausreichender Besatzung rückt das Fahrzeug aus. Privatleben und Dienstplan der Freiwilligen sind nicht steuerbar. Ab Stufe 6 kann eine Wache für 240.000 Credits zur BF umgebaut werden; historische BF bleiben bestehen.

FMS und Bereitschaft sind getrennt. Auch FMS 1 oder eine manuelle FMS-Änderung macht ein zurückfahrendes Fahrzeug nicht alarmierbar. Rettungsmittel führen nach der Rückkehr gegebenenfalls Reinigung, Desinfektion und Materialauffüllung durch. Gründe und Besatzungszahlen stehen in Disposition und Fuhrpark. Reservehinweise warnen, sperren aber keine Auswahl.

Die Deutschland-Klinikauswahl verbindet reale kartierte Einrichtungen mit ausdrücklich bezeichneten **Spielprofilen**. Fachbereiche, freie Spielplätze, Behandlungsdauer und Abmeldungen sind simuliert und keine Angaben über die reale Klinik. Der Server berücksichtigt Eignung, Belegung, Reservierungen und berechenbare Anfahrt. Gibt es unter den geprüften nahen Kliniken kein geeignetes freies Ziel, zeigt die Auswahl den Grund; sie beginnt keinen Transport zu einer ungeeigneten Ersatzklinik. Bereits reservierte Transporte und Patienten werden bei einem Update nicht gelöscht.

Patientenzustände, Wetter, Verkehrsereignisse und Eskalationen sind Spielmodelle. Neue Erstbedarfe sollen mit der freigeschalteten Ausstattung grundsätzlich erfüllbar sein; rechtzeitige Disposition und Nachforderungen bleiben trotzdem erforderlich. Mehr alarmierte Fahrzeuge oder absichtliches Verzögern erzeugen keine zusätzliche Grundbelohnung. Credits und XP werden beim tatsächlichen Abschluss einmalig verbucht.

Die Prioritäten INFO, NORMAL, DRINGEND, HOCH, KRITISCH und NOTFALL bestimmen Anzeige, Sortierung und Meldungston. Eigene Audiodateien bleiben lokal; Priorität und Notfall behalten geschützte Originaltöne. Einsätze erscheinen auf Seiten mit je 25 Einträgen, wartende Anrufe und Sprechwünsche mit je 10. Das Archiv lädt 25 Berichte je Seite aus der dauerhaften Serverhistorie, einschließlich alter Berichte außerhalb des aktuellen Spielstandsfensters.
