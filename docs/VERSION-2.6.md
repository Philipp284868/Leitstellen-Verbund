# Version 2.6 – Große Region, feste Echtzeit und Fahrtenübersicht

> Historischer Nachweis des im Dokument genannten Stands. Frühere Karten, Bedienwege und Prüfzahlen sind keine aktuelle Produktanleitung. Aktuell: [Deutschland](DEUTSCHLAND.md), [Entwicklung](ENTWICKLUNG.md), [Laufzeitmessungen](TESTLAUFZEITEN.md).

Die Karte wächst von 1300 × 850 auf 5200 × 3400 Karteneinheiten. Bei unveränderten 12 Metern je Einheit entspricht das 62,4 × 40,8 km und der 16-fachen Fläche. Die bestehende Stadt bleibt an ihrem Platz. Rosenfeld, Hohenbrück, Eichenbach, Bergheim, Waldstein, Auenburg, Wiesental, Kirchhain, Oberwald und Steinfurt ergänzen die Region. Geschwungene Landstraßen verbinden die neuen Orte mit dem bisherigen Straßennetz. Geometrische Straßenkreuzungen sind auch im Routing verbunden.

## Karte bedienen

- **Gesamte Region** zeigt die komplette Karte.
- Die **Ortsauswahl** springt zu einem Viertel oder neuen Ort.
- **Meine Wachen** führt zurück zur ersten eigenen Wache; beim Öffnen startet die Karte dort.
- Verschieben per Maus oder Finger, Mausrad, Plus/Minus und Pfeiltasten bleiben verfügbar.
- **Fahrwege** sind standardmäßig sichtbar und können ausgeblendet werden.
- Neue Land-Einsätze entstehen höchstens 600 Karteneinheiten (7,2 km Luftlinie) von einer fertigen eigenen Wache mit mindestens einem fachlich passenden Fahrzeug entfernt. Der Straßenweg kann länger sein. Bau einer leeren, abgelegenen Wache allein verlagert das Einsatzgebiet nicht. Gewässereinsätze bleiben an den vorhandenen Wasserzugängen.

## Echtzeit und Angaben

Eine echte Sekunde entspricht einer Simulationssekunde, im Einzelspieler ebenso wie im Multiplayer. Es gibt keine Tempowahl mehr; auch direkt gesendete Tempoaktionen werden zurückgewiesen. Der Server läuft weiter, wenn Browser geschlossen sind. Nach einem Serverstillstand gilt weiterhin die vorhandene Begrenzung von vier Stunden Nachberechnung.

Vor der eigenen Alarmierung und dem Angebot von Verbundhilfe stehen der berechnete Fahrweg in Kilometern und die voraussichtliche Dauer am Fahrzeug. Die Fahrzeugübersicht zeigt Reststrecke, Zeit bis Ziel und Gesamtstrecke. Die Kartenübersicht sortiert laufende Anfahrten, Rückfahrten und Patiententransporte nach nächster Ankunft und zeigt deren Fortschritt. Angekommenen Fahrzeugen wird kein irreführender Fahrt-Countdown mehr angezeigt.

Die Einsatzstatistik zeigt einsatzbereite Fahrzeuge, gebundene Fahrzeuge in Prozent, Fahrzeuge unterwegs, summierte offene Fahrstrecke, abgeschlossene Einsätze und versorgte Patienten. Die offene Fahrstrecke bezieht sich auf aktuelle Fahrten, nicht auf historisch gefahrene Kilometer.

Distanzen und Zeiten beruhen auf denselben Wegen wie die Serverbewegung. Landfahrzeuge fahren mit dem bisherigen Modell von 60 km/h, Luftfahrzeuge mit 180 km/h und Boote mit 30 km/h. Es gibt derzeit keine Staus oder unterschiedlichen Tempolimits einzelner Straßen. Beispielsweise dauern 5 km bei 60 km/h fünf echte Minuten. Lange überregionale Fahrten dauern entsprechend länger. Die Einsatzfrequenz bleibt ruhig: maximal zwei eigene offene Einsätze, neue Meldungen zeitlich versetzt mit 90–210 echten Sekunden Abstand.

## Bestehenden AMP-Server aktualisieren

Stoppen → Aktualisieren → erfolgreichen Build abwarten → Starten → Browser neu laden. Keine neuen AMP-Felder, Ports oder Abhängigkeiten erforderlich. `.env` und das dauerhafte Datenverzeichnis beibehalten. Ein Zurücksetzen ist nicht erforderlich.

Datenbankschema 5 übernimmt ältere Tempowerte beider Modi als 1. Vor der Migration wird eine vollständige SQLite-Sicherung angelegt. Konten, Besitz, Guthaben, Kooperationszuordnungen, Koordinaten der bisherigen organischen Karte und gespeicherte Anfangs-/Endtermine bleiben erhalten. Noch offene Fahrten und Arbeiten laufen ab dem Update mit echter Zeit weiter. Ältere Sicherungen werden bei der Wiederherstellung entsprechend migriert. Die Weltkennung bleibt `falkenried-2`, weil bestehende Standorte nicht verschoben werden; die Kartengrenzen werden erweitert. Historische Raster-Spielstände verwenden weiterhin die ursprüngliche feste Zuordnung ihrer 117 Bauplätze.

Musik, Soundeffekte und lokale Lautstärkeeinstellungen bleiben erhalten. Einzelspieler und Multiplayer behalten getrennte Spielstände.

## Prüfungen

Die automatisierten Tests prüfen die Verbindung aller Straßen und Häfen, sämtliche geometrischen Kreuzungen, erlaubte Kartengrenzen, lokale Einsatzverteilung, reale Fahrtdauern und Reststrecken sowie die Übernahme alter Tempi in beiden Welten. Browserprüfungen decken Regionübersicht, neue Ortsauswahl, Fahrtenanzeigen, Mobilansicht und das Fehlen der Tempowahl ab. Längere Abläufe werden ausschließlich im Testprozess über die Serveruhr fortgesetzt; Spieler erhalten keinen Zugang zu dieser Teststeuerung.
