# Gemeinsam disponieren · Version 2.21

Alle Spieler öffnen dieselbe Spieladresse und registrieren sich mit einem eigenen Konto. Registrierung ist weiterhin frei. Eine Einladung **in eine Leitstelle** ist eine zusätzliche Spielberechtigung, kein Registrierungscode und keine Serververwaltung.

## Dieselbe Leitstelle

1. Beide Konten melden sich am selben Spielserver an. PC-Multiplayer ist der einzige normale Spielmodus.
2. Der Inhaber öffnet **Leitstellen** im Hauptmenü beziehungsweise **Funk → Verbund & Leitstellenfunk**, trägt den bestehenden Benutzernamen ein und klickt **Disponenten einladen**.
3. Das andere Konto öffnet denselben Verbundbereich und nimmt die Einladung ausdrücklich an.
4. Beide sehen jetzt denselben Bestand, dieselben Einsätze, FMS und Historien. Alle Spielaktionen werden weiterhin einzeln mit dem tatsächlich angemeldeten Bearbeiter autorisiert und protokolliert.

Bis zu acht Disponenten arbeiten an einer Leitstelle. Ein Gespräch gehört vorübergehend dem annehmenden Disponenten. Andere können parallel disponieren und Funkmeldungen bearbeiten. Nach 60 Sekunden ohne Gesprächsbearbeitung ist eine ausdrücklich gewählte Übernahme möglich. Mehrere Tabs desselben Kontos teilen den Gesprächszugriff. Doppelte Alarmierungen werden serverseitig verhindert.

Der bisherige persönliche Multiplayerstand des beitretenden Kontos bleibt separat gespeichert und wird beim Verlassen wieder angezeigt. Alte Einzelspielerstände bleiben inaktive Archive. Das persönliche Tutorial und seine Übungswelt gehören weiterhin zum jeweiligen Benutzer, nicht zum gemeinsam disponierten Bestand. Mitgliedschaft gewährt keine Kontoverwaltung und keine Serverrechte. Nur der Inhaber lädt ein oder entfernt andere Mitglieder; Mitglieder können selbst austreten. Offene Einladungen können zurückgezogen werden.

Der Textchat erreicht ausschließlich aktuell berechtigte Disponenten derselben Leitstelle. Beim Wechsel der Leitstelle wird der bisherige Clientchat geleert. Chat ist flüchtig; Einsatzfunk und Historie sind dagegen Teil des persistenten Spielstands.

## Unterschiedliche Leitstellen

Neue Einsätze werden **nicht automatisch geteilt**. Andere Leitstellen erhalten weder den neuen Einsatz noch freien Fahrzeugzugriff. Im Verbundbereich unter **Nachbarleitstellen** lassen sich gezielte Unterstützungsanfragen als privater Entwurf erstellen und ausdrücklich versenden. Nur die ausgewählte Leitstelle sieht die Anfrage. Sie kann Rückfragen stellen, ablehnen oder eigene Fahrzeuge teilweise beziehungsweise vollständig zusagen. Erst die Zusage alarmiert Fahrzeuge und erlaubt die begrenzte Ansicht des betroffenen Einsatzes, der gebundenen Fahrzeuge und ihrer Heimatwachen. Freier Fahrzeugbestand, Geld, Personal und andere Einsätze bleiben privat.

Angenommene Kräfte zählen für Erkundung, AAO, Fähigkeiten, Maßnahmen und Patiententransporte. Die Einsatzleitung bleibt beim anfragenden Disponenten. Anfragen lassen sich zurückziehen oder beenden; laufende Patiententransporte werden zuerst abgeschlossen. Nach Einsatzende erfolgt die vorhandene einmalige Kooperationsauszahlung. Rückfragen und Anfragehistorie bleiben gespeichert. Die Anmeldung in einer anderen Leitstelle ist während eigener offener Hilfsanfragen gesperrt. [Vollständiger Ablauf und Grenzen](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/PHASE-3.md).

Die historische Schema-6-Migration schloss alte Freigaben ohne bereits zugeordnetes fremdes Fahrzeug. Laufende Übergangsfälle behalten ihren geprüften Ablauf; daraus entsteht keine automatische Freigabe neuer Einsätze. Schema 14 übernimmt Eurobeträge, Beteiligungsgrenzen und Auszahlungsbelege konsistent, ohne die tatsächliche Beteiligung neu zu erfinden. Ein Hilfsende oder Rückruf wird auch auf verbleibende Pflichtabdeckung geprüft. [Euro und Bestandsschutz](EURO-WIRTSCHAFT.md).

Ein geschlossener Browser stoppt die Simulation nicht. Dispositionsentscheidungen wie die Aufnahme einer Lagemeldung warten jedoch auf einen berechtigten Disponenten. Bei Verbindungsausfall bleiben neue Aktionen gesperrt. Wiederverbinden liefert den aktuellen Serverstand.

[Bedienung](SPIELANLEITUNG.md) · [Phase 1 und Migration](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/PHASE-1.md) · [AMP und Sicherungen](AMP.md)
