# Version 2.3 – Karte, Leitstellenoberfläche und getrennte Spielwelten

> Historischer Nachweis des im Dokument genannten Stands. Frühere Karten, Bedienwege und Prüfzahlen sind keine aktuelle Produktanleitung. Aktuell: [Deutschland](DEUTSCHLAND.md), [Entwicklung](ENTWICKLUNG.md), [Laufzeitmessungen](TESTLAUFZEITEN.md).

## Zwei Spielstände pro Konto

Im Hauptmenü zwischen **Einzelspieler** und **Multiplayer** wählen. Beide Modi laufen auf dem eigenen AMP-Server. Jeder Modus besitzt eigene Wachen, Fahrzeuge, Personal, Guthaben, Einsätze und Fortschritte. Es findet kein Transfer von Credits oder Besitz zwischen den Modi statt. Der Modus wird pro Browser-Tab gespeichert. Ein zweiter Tab kann die andere Welt öffnen; eine Verbindung und Anmeldung bleiben für beide erforderlich.

**Vorhandene Spielstände bleiben im Multiplayer erhalten.** Der erste Aufruf des Einzelspielers legt eine eigene neue Welt mit regulärem Startguthaben an. Die Simulation beider vorhandenen Welten läuft auch weiter, wenn der andere Modus geöffnet ist. Konto und Passwort gelten für beide Welten.

Schema 3 ergänzt eine eigene SQLite-Tabelle für Einzelspieler. Vor der Migration wird eine konsistente Datenbanksicherung angelegt. Die bisherige Multiplayer-Tabelle und Konten werden nicht ersetzt. Die Sicherungsdateien behalten aus Kompatibilitätsgründen das vorhandene Namensschema `pre-migration-v2-…`. Keine ältere Software gegen Schema 3 starten. Automatische Backups und CLI-Restore enthalten beide Welten; Restore widerruft weiterhin Sitzungen und prüft auch den Besitz in Einzelspielerständen.

Exporte enthalten den gewählten Modus. Freiwillige lokale Sicherungen werden nach Konto und Spielwelt gefiltert. Ein genehmigter Offline-Import benötigt bei Einzelspielerexporten zusätzlich `--mode single`; das Standardziel ohne diesen Parameter bleibt Multiplayer. Ein Export mit abweichendem Modus wird abgelehnt. Ein Import ist weiterhin ausschließlich ausdrückliche Betreiberwartung.

## Multiplayer

Wachen der anderen Multiplayer-Leitstellen bleiben sichtbar, auch wenn kein Fahrzeug einen gemeinsamen Einsatz fährt. Kontostände und Personal anderer Spieler werden weiterhin nicht ausgeliefert. Fremde Fahrzeuge werden bei freigegebenen Einsätzen angezeigt. Einzelspielerstände und Einzelspielerchat werden nicht im Verbund veröffentlicht.

**Neue Multiplayer-Einsätze werden automatisch freigegeben.** Bereits bestehende private Einsätze bleiben privat und können über „Mit Freunden teilen“ freigegeben werden. Eine Freigabe kann weiterhin gezielt beendet werden. Unterstützung, Patientenübergabe und anteilige Gutschriften werden auf dem Server abgewickelt, auch bei geschlossenem Helferbrowser. „Verbund-Einsätze“ in der Seitenleiste öffnet die verfügbaren Hilfseinsätze.

## Ruhigerer Einsatzrhythmus

Höchstens **zwei eigene offene Einsätze** je Spielwelt. Neue Einsätze treffen einzeln ein, mit zufälligen Abständen von **90 bis 210 echten Sekunden**, unabhängig von 1× bis 32× Spieltempo. Der erste passende Einsatz kann erscheinen, sobald der Fuhrpark die Voraussetzungen erfüllt. Unabhängige Zufallsfolgen verhindern einen festen Gleichschritt zwischen neu angelegten Leitstellen.

Bereits vorhandene Einsätze werden nicht gelöscht. Wer noch mehr als zwei hat, arbeitet diese zunächst ab; bis dahin werden keine weiteren erzeugt. Ein Serverstillstand wird nicht mit einer Welle neuer Einsätze nachgeholt. Im Multiplayer kann die separate Verbundliste zusätzlich Einsätze anderer Konten enthalten; das Limit gilt pro eigener Leitstelle.

## Karte und Bedienung

Neu gestaltete Stadtviertel, Grünflächen, Häuserblöcke, Wasserflächen und beschriftete Hauptstraßen. Die vorhandenen Straßenknoten, Bauplätze und gespeicherten Fahrzeugrouten bleiben gültig. Brücken entsprechen den vorhandenen Straßenverbindungen. Keine externen Kartenanbieter, Bilder oder Schriften nötig.

- Stadtviertel in der Kartenleiste auswählen, um dorthin zu springen.
- Beschriftung, Fahrwege und Verbundmarker einzeln ein- oder ausblenden.
- Zwischen allen Objekten, Einsätzen, Wachen und Fahrzeugen filtern.
- Mausrad oder +/− zum Zoomen, Ziehen zum Verschieben; die Kamera bleibt innerhalb der Region.
- Bei fokussierter Karte: Pfeiltasten verschieben, +/− zoomen, Home zeigt die gesamte Region.
- Gebäude und Einsätze bleiben per Tab und Enter erreichbar. Kartenwerkzeuge liegen außerhalb der Kartenfläche, damit sie keine nördlichen Wachen verdecken.

## Oberfläche

Horizontale Hauptnavigation, eindeutige Modusanzeige, kompakte eigene Einsatzliste, eigener Verbundzugang und Wachenleiste. Verwaltungsdialoge, Fahrzeugauswahl und Sicherungsansichten verwenden ein gemeinsames Layout. Die Einführungsanleitung ist einklappbar. Heller Modus und mobile Ansicht gelten auch für Karte und HUD.

## AMP-Update

Wie bisher: **Stoppen → Aktualisieren auf main → erfolgreichen Build abwarten → Starten**. Danach geöffnete Spielseiten neu laden. Setup bleibt `node scripts/amp-setup.mjs`, App Name bleibt `dist/server/index.js`, Node.js bleibt 24. Vorhandene `.env` und Datenverzeichnis beibehalten. **Kein Hardreset erforderlich.** Router-, DNS- und HTTP-Einstellungen werden nicht geändert.

Die Abnahme umfasst zusätzlich Besitztrennung, Moduswechsel in mehreren Tabs, getrennte API- und Socket-Antworten, Einzelspieler-Chatsperre, Export und tatsächlichen CLI-Restore beider Welten, Migration von Schema 2, Echtzeit-Einsatzintervalle sowie Kartenbedienung auf Desktop und Mobilgeräten. Verbindliche Ergebnisse stehen im CI-Lauf zum veröffentlichten Commit.
