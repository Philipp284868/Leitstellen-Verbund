# Version 2.4 – eine neue Region für Falkenried

> Historischer Nachweis des im Dokument genannten Stands. Frühere Karten, Bedienwege und Prüfzahlen sind keine aktuelle Produktanleitung. Aktuell: [Deutschland](DEUTSCHLAND.md), [Entwicklung](ENTWICKLUNG.md), [Laufzeitmessungen](TESTLAUFZEITEN.md).

## Neue Spielkarte

Das rechteckige Straßenraster ist vollständig ersetzt. Falkenried besitzt eine unregelmäßige Altstadt, geschwungene Wohnstraßen, Landstraßen nach Lindenau und Mühlendorf, einen Gewerbepark und Seebruck am Falkensee. Einzelne Häuser stehen entlang ihrer Straßen und haben unterschiedlich ausgerichtete Grundrisse. Felder, Baumgruppen, Wald, Stadtpark, ein Bach und der Fluss Falke gliedern die Landschaft.

38 benannte Straßen werden aus gemeinsamen Kurvenpunkten aufgebaut. Die sichtbaren Straßen und die Routenberechnung verwenden dieselbe Geometrie; sämtliche Verbindungen sind erreichbar. Der Fluss wird über eine Straßenbrücke gekreuzt. Boote nutzen weiterhin Wasserwege zwischen den drei Häfen, Luftfahrzeuge die direkte Verbindung. Die Einsatzliste nennt jetzt das nächstgelegene Viertel statt einer Rasterkoordinate.

Zoomen, Verschieben, Viertelauswahl, Filter, Beschriftungen, Fahrwege und Verbundmarker bleiben bedienbar. Heller und dunkler Modus sowie mobile Ansichten verwenden dieselbe neue Karte. Keine Kartenanbieter, API-Schlüssel oder externen Bilder notwendig. Die Region ist fiktiv.

## Bestehende Spielstände

Die Kartenkennung wechselt von `falkenried-1` auf `falkenried-2`, die SQLite-Version von 3 auf 4. Vor dem Umstieg legt der Server eine vollständige konsistente Sicherung im Datenordner an. Das bestehende Namensschema `pre-migration-v2-…sqlite` bleibt aus Kompatibilitätsgründen erhalten.

- Konten, Passwort-Hashes, Besitz, IDs, Geld, Personal, Erfahrung, Einsätze, Kooperationsbelege und Fortschritt bleiben erhalten.
- Jeder der 117 bisherigen Bauplätze erhält einen eigenen neuen Standort an einer Straße. Alte Hafenstandorte werden den neuen Häfen zugeordnet. Standorte können sich sichtbar verschieben.
- Laufende Straßenfahrten bekommen neue Routen. Auftrag, Abfahrts- und Ankunftszeit bleiben erhalten; die Fahrt wird auf dem entsprechenden Fortschritt der neuen Route fortgesetzt. Fahrzeuge können durch den Kartenwechsel räumlich versetzt erscheinen.
- Gemeinsame Einsatzorte werden für sämtliche Spieler gleich übertragen. Laufende Patientenfahrten erreichen das übertragene Krankenhaus beziehungsweise das neue öffentliche Klinikum.
- Einzelspieler und Multiplayer werden gemeinsam in einer Transaktion migriert und bleiben getrennte Spielstände. Ein Fehler rollt den gesamten Kartenmigrationsschritt zurück; der Server startet dann keinen Spielbetrieb.
- Die Migration läuft einmalig. Ältere Exporte und Sicherungen können weiterhin durch die bestehende Betreiberwartung geprüft und übernommen werden; auch dabei wird die Karte übertragen. Es entsteht kein öffentlicher Importzugang.

## Aktualisierung in AMP

1. Server stoppen und wie üblich den Datenordner sichern.
2. **Aktualisieren** ausführen, mit Git-Branch `main` und dem vorhandenen Setup `node scripts/amp-setup.mjs`.
3. Nach erfolgreichem Build starten; der erste Start übernimmt die Kartenmigration automatisch.
4. Die Website neu laden. Im Hauptmenü steht **Version 2.4.0**.

Kein Reset und keine neue Registrierung erforderlich. `.env`, Datenverzeichnis, Port und bisherige HTTP-/HTTPS-Konfiguration bleiben bestehen. Frühere Programmversionen dürfen nicht gegen Schema 4 gestartet werden. Ein Rückwechsel erfordert die passende alte Software zusammen mit der zugehörigen Sicherung.

## Prüfungen

Die zusätzlichen Tests prüfen die Erreichbarkeit aller Straßen, die Übereinstimmung von Fahrwegen und gezeichneten Verbindungen, unbeabsichtigte Kreuzungen, sämtliche alten Bauplätze, eine wiederholbare Migration, ungültige Altdaten, Hafenrückfahrten, transaktionales Zurückrollen, laufende gemeinsame Patiententransporte mit genau einmaliger Belohnung und die tatsächliche Wiederherstellung einer Schema-3-Sicherung mit der Produktions-CLI. Browserprüfungen erfassen außerdem Altstadt-Zoom, komplette Kartenansicht, hellen Modus und mobile Bedienung. Maßgeblich ist der erfolgreiche CI-Lauf des veröffentlichten Commits.
