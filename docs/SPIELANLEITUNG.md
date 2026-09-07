# Die Region übernehmen

**Große Lagen ab Version 2.10:** Nach der Erkundung eines geeigneten Einsatzes lässt sich die Großlagenführung aufrufen: Abschnitte beauftragen, alarmierte Fahrzeuge aus der Bereitstellung zuweisen, Einsatzleitung besetzen, Patienten sichten und priorisierte Transporte freigeben. Unwetter-/Hochwasserlagen erzeugen einzelne versetzte Meldungen; höchstens zwei Einsätze bleiben gleichzeitig offen. [Vollständige Phase-4-Anleitung](PHASE-4.md).

Zuerst auf der Spielwebsite **Neues Konto erstellen** wählen oder mit einem vorhandenen Konto anmelden. Jeder kann sich ohne Einladung registrieren. Alle Konten sind normale Spieler. Eigener Besitz wird auf dem Server gespeichert; alle Konten verbinden sich automatisch. Frühere Admin-Konten bleiben mit denselben Zugangsdaten und Spielständen als normale Spieler erhalten.

## Einzelspieler und Multiplayer

Im Hauptmenü den Modus wählen. Beide Welten verwenden dasselbe Konto, aber getrennten Besitz und Fortschritt. Dein bisheriger Stand bleibt im Multiplayer; Einzelspieler startet separat. Beide Modi benötigen die Serververbindung.

## Einstieg und Disposition

Die erste Feuerwache kostet 55.000 Credits. Ein TSF-W kostet 18.000 Credits und benötigt sechs Mitarbeiter. Personal kostet einmalig 600 Credits je Person. Zwei TSF-W samt Besatzung und Wache lassen 151.800 Credits Reserve. Die Wache baut 25 echte Sekunden. Das Spiel läuft fest in Echtzeit: Fahrten, Ausbildung, Bau und Einsatzarbeit werden nicht beschleunigt. Vor der Alarmierung stehen Entfernung und voraussichtliche Fahrzeit am Fahrzeug. Die Kartenübersicht zeigt laufende Fahrten mit Restkilometern, Countdown und Fortschritt.

Wache auf einer Kreuzung platzieren, öffnen und Fahrzeuge kaufen. Personal einstellen und im Fuhrpark **Besetzen** wählen. Ein Fahrzeug ohne ausreichende, freie und passend ausgebildete Besatzung ist nicht alarmierbar. Fahrzeugzuweisung, Rückruf und Verkauf prüfen den tatsächlichen Zustand erneut.

Die Einsatzliste enthält höchstens zwei regulär erzeugte offene Einsätze je Welt. Angeboten werden Lagen, deren Fähigkeiten der eigene Fuhrpark grundsätzlich besitzt. Belegte Fahrzeuge verhindern nicht, dass der entsprechende Einsatztyp weiter existiert. Zusätzliche Organisationen und Ausbildung eröffnen anspruchsvollere Lagen. Neue Meldungen kommen einzeln mit 90–210 echten Sekunden Abstand, unabhängig vom Spieltempo. Bereits bestehende größere Einsatzlisten bleiben erhalten und werden zuerst abgearbeitet. Neue Multiplayer-Einsätze bleiben in der eigenen Leitstelle.

## Notruf bis Einsatzabschluss

1. In der Notrufwarteschlange einen Anruf öffnen und **Notruf annehmen** wählen.
2. **Wo genau ist der Notfall?** und **Was ist passiert?** erfragen. Sobald Ort und Meldebild bekannt sind, kann disponiert werden. Weitere Fragen sind freiwillig und passen sich der gemeldeten Organisation an. Antwortzeiten, Stress, Informationsqualität und Glaubwürdigkeit beeinflussen das Gespräch. Widersprüchliche Angaben bleiben sichtbar. Bei Abbruch ist je nach Verbindung ein Rückruf möglich.
3. Unter **AAO** eigene Alarm- und Ausrückeordnungen mit Stichwort, Stufe, Organisation, Fahrzeugtypen, Fähigkeiten, Priorität und Alarmierungsart speichern. Im Einsatz eine AAO auswählen und **AAO-Vorschlag berechnen** klicken. Der Vorschlag alarmiert noch nicht. Alternativ frei nach Wache und Organisation auswählen; Fahrstrecke, Fahrzeit und Verfügbarkeit stehen am Fahrzeug.
4. Auswahl prüfen und **Alarmieren**. Fehlbedarf wird angezeigt, verhindert eine bewusst knappe Erstdisposition aber nicht. **Nur DME** benötigt 60 Sekunden bis zum Ausrücken, **DME + Sirene** 45 Sekunden, **Wachalarm** 30 Sekunden. Das sind Spielwerte, keine Zusage realer BOS-Zeiten. Ohne Einzelüberschreibung gilt das unter **FMS / Funkstatus** gespeicherte Wachenprofil.
5. Alarmierung (FMS 9), Ausrücken/Anfahrt (FMS 3) und Ankunft (FMS 4) verfolgen. Die erste Einheit meldet sich mit einem Sprechwunsch. **Lagemeldung aufnehmen** übernimmt bestätigte Erkenntnisse; das tatsächliche Meldebild kann abweichen. Ein FMS 0/5 ersetzt die operative Fahrzeugbindung nicht.
6. Fehlende Fähigkeiten führen zu einer Nachforderung. Den Sprechwunsch bearbeiten und in derselben Disposition weitere Fahrzeuge alarmieren. Rückfragen liefern zusätzliche Lageinformationen. Funkmeldungen lassen sich erledigen; wiederholte Bearbeitung erzeugt keine zweite Wirkung.
7. Sobald ausreichende Kräfte vor Ort und die Lage bekannt sind, arbeitet der Server den Einsatz ab. Patienten werden wie bisher versorgt und transportiert. Nach Abschluss erscheint **Einsatzhistorie**; unter **Einsatzarchiv → Verlauf ansehen** lässt sich der Vorgang erneut öffnen.

Unter **FMS / Funkstatus** können berechtigte Disponenten den Funkstatus 0–9 mit Begründung korrigieren und die Bezeichnungen pro Organisation ändern. FMS 6 verhindert neue Alarmierungen. Manuelle Statusmeldungen ändern keine Fahrtroute oder laufende Fahrzeugzuweisung. Die FMS-Historie zeigt Serverzeit und Bearbeiter.

Am Einsatz werden Fähigkeiten summiert, nicht bloß Fahrzeugzahlen. Ein Polizeifahrzeug kann keinen Brand löschen. Favoriten und Namensfilter im bestehenden Fuhrpark bleiben verfügbar. Mehrere Notrufe können dasselbe Ereignis beschreiben, ohne einen zweiten Einsatz anzulegen.

## Wege, Patienten und Boote

Straßenfahrzeuge fahren entlang des mitgelieferten zusammenhängenden Straßengraphen. Die Route wird mit A* berechnet, die Fahrzeit aus Weglänge und Fahrzeuggeschwindigkeit. Der Hubschrauber fliegt direkt. Boote sind dauerhaft an Wasserrettungsstationen mit Wasserzugang stationiert: Kaufen bedeutet dortiges Einsetzen ins Wasser, Alarmierung und Rückfahrt erfolgen über den definierten Wasserweg zwischen Uferzugängen. Es gibt in diesem Stand keinen Straßentransport eines Boots; es fährt niemals als Auto über Straßen.

Nach der Patientenversorgung folgen echte Transporte. Öffentliches Klinikum: 100 Plätze, jedes eigene Krankenhaus zusätzlich 20 pro Ausbaustufe. Zielwahl berücksichtigt freie Plätze und Entfernung. Behandlungszeit: 90 Spielsekunden. Versorgte Patienten warten, wenn kein geeigneter Transport oder kein Platz verfügbar ist. Ein belegtes Transportfahrzeug kann nicht einfach zurückgerufen werden.

## Ausbau und Ausbildung

Ausbau erhöht Stell- und Personalplätze proportional zur Stufe. Eine Wache im Ausbau kann nicht neu alarmieren; bereits laufende Aufträge gehen nicht verloren. Spezialausbildungen benötigen ein fertiges Ausbildungszentrum, 1.800 Credits und 180 Spielsekunden. Das betreffende Personal steht währenddessen nicht als Besatzung zur Verfügung.

Unbesetztes Personal kann entlassen werden. „Besatzung lösen“ gibt Personal eines verfügbaren Fahrzeugs frei. Fahrzeuge können an passende fertige Wachen mit freien Stellplätzen versetzt werden. Die bisherige Besatzung bleibt an ihrer Wache. Verkäufe erstatten 60 Prozent des Grundpreises; nur sichere, nicht gebundene Fahrzeuge und vollständig leere Gebäude können verkauft werden.

Abgeschlossene Einsätze geben `50 + 10 × Einsatzstufe` Erfahrung. Je 150 Erfahrung steigt die Leitstellenstufe, maximal bis Stufe 10. Stufe 2 erschließt Rettungsdienst, Polizei und Ausbildung, Stufe 3 THW, Wasserrettung und Krankenhäuser, Stufe 4 Luftrettung. Zwölf Erfolge und mehrstufige Ausbauziele prüfen tatsächlichen Besitz, abgeschlossene Einsätze, ausgebildetes Personal oder behandelte Patienten.

## Keine Schuldenfalle

Es gibt keine laufenden Pflichtkosten, Offline-Strafen oder negativen Guthaben. Unter **Fortschritt** kann jederzeit ein öffentlicher Funk-Bereitschaftsdienst übernommen werden: Nach 120 Spielsekunden entstehen 1.500 Credits, auch ohne Wache oder Fahrzeug. Nur ein solcher Dienst kann gleichzeitig laufen. Damit bleibt ein Wiedereinstieg nach ungünstigen Käufen möglich.

## Speichern und Bedienung

Wichtige Änderungen werden sofort auf dem Server gespeichert. Der Server simuliert bei geschlossenem Browser weiter; nach Serverstillstand werden höchstens vier Stunden nachberechnet. Exportdateien und freiwillige lokale Kopien stehen unter Sicherungen bereit. Eine verbindliche Übernahme alter Dateien bleibt eine ausdrücklich genehmigte Wartungsaufgabe des Serverbetreibers bei gestopptem Spielserver; es gibt dafür keine Admin-Spielkonten.

Karte ziehen, Mausrad oder +/− zum Zoomen verwenden. Marker lassen sich mit Tab und Enter bedienen. Auf kleinen Displays zwischen Karte und Einsatzliste wechseln. Dialoge schließen mit Escape; der Tastaturfokus bleibt im Dialog. Reduzierte Bewegung und heller Modus sind in den Einstellungen verfügbar.


## Dynamische Lage (Phase 2)

Nach der ersten Lagemeldung Gefahren, Brandbereiche und Patienten im Einsatzdialog prüfen. Taktik und Versorgungsschwerpunkte verändern den Ablauf, ersetzen aber keine Kräfte. Bei kritischen Lagen oder Defekten Sprechwünsche bearbeiten und Ersatz nachfordern. Defekte Fahrzeuge im Betriebsbereich unter der Karte reparieren lassen. Wetter, Verkehr und Anfahrtsart beeinflussen die ETA; Sperren können Umleitungen oder Wartezeit verursachen. Die Einsatzdichte bleibt ruhig und auf zwei aktive Fälle begrenzt. [Vollständige Bedienung](PHASE-2.md).

## Organisationen und gezielte Nachbarhilfe ab Version 2.9

Wachenprofile, Personalverfügbarkeit und Krankenhausaufnahme werden in den jeweiligen Wachendetails eingestellt. Der Fuhrpark zeigt Reserve, Umbesetzung und individuelle Ankunft der FF-Besatzung. Nach der Erkundung passende Organisationsaufträge im Einsatz beauftragen; reale Kräfte vor Ort arbeiten sie ab. Unter Freunde gezielte Anfragen an Nachbarleitstellen stellen, Rückfragen beantworten und Fahrzeuge ausdrücklich zusagen. [Vollständige Phase-3-Anleitung](PHASE-3.md).
