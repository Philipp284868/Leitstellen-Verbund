# Euro, Grundfinanzierung und Bestandsschutz

Version 2.21 verwendet Spiel-Euro; gespeichert und gerechnet wird in exakten ganzzahligen Eurocent. Es gibt keine Echtgeldkäufe. Preise orientieren sich teilweise an dokumentierten öffentlichen Beschaffungen, sind aber für das Spiel bewusst vereinfacht. Weder alle Angebote noch Klinikfunktionen werden als reale Marktpreise ausgegeben. [Quellen, Grenzen und sechs Berechnungen](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/EURO-WIRTSCHAFT.md).

## Geld im laufenden Spiel

| Vorgang                                          |      Spielwert |
| ------------------------------------------------ | -------------: |
| Neue normale Leitstelle                          | 1.400.000,00 € |
| Feuerwache                                       |   650.000,00 € |
| TSF-W ab Stufe 1                                 |   180.000,00 € |
| LF 20 ab Stufe 2                                 |   320.000,00 € |
| Rettungswache plus RTW ab Stufe 4                |   690.000,00 € |
| Automatische Finanzierung je 15 Minuten Weltzeit |    30.000,00 € |
| Guthabengrenze dieser Finanzierung               | 2.500.000,00 € |

Besetzung und erforderliche Qualifikationen gehören zur freigeschalteten Wachenfunktion; keine zusätzlichen Recruiting- oder Ausbildungsgebühren. Ausbau kostet 110.000,00 € × bisherige Gebäudestufe. Verkäufe erstatten 60 % des gespeicherten Kauf-/Bestandsbuchwerts, auf Cent abgerundet. Die [vollständige Liste](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/EURO-PREISE.md) enthält 50 Fahrzeuge, acht Gebäude, vier Erweiterungen und sämtliche Einsatzgrundvergütungen.

Die normale Welt erhält Finanzierung automatisch; der Bereitschaftsdienst zum wiederholten Anklicken entfällt. Bei erreichtem Deckel verfallen die betreffenden Förderintervalle. Ein späterer Kauf löst keine Nachzahlung aus. Einsatzerlöse und geschütztes Altguthaben dürfen über der Fördergrenze liegen und werden nicht abgeschnitten. Es gibt keine laufende Personalrechnung und keine Abwesenheitsstrafe. Serverstillstand wird nur im vorhandenen begrenzten Simulationsnachlauf berücksichtigt.

Einsatzvergütung beruht auf dem ursprünglichen Auftrag und der tatsächlichen Qualitätsbewertung. Mehr Fahrzeuge, absichtliches Warten und doppelte Aktionen erhöhen den Grundbetrag nicht. XP werden unabhängig berechnet. Das [[Tutorial]] verwendet eine getrennte Übungswirtschaft.

## Sechs Finanzierungsbeispiele

Diese Zahlen sind ein reproduzierbares Geldmodell mit 0–2 kleinen Einsätzen pro Stunde, keine gemessenen Spielzeiten und keine Garantie für XP-Freischaltungen. Gebäude, Fähigkeiten und Stufe bleiben zusätzliche Voraussetzungen.

| Ausgangslage                                 | Finanzielles Ziel           | Modellzeit bis finanzierbar      |
| -------------------------------------------- | --------------------------- | -------------------------------- |
| Feuerwache und TSF-W aus Startbudget gekauft | zusätzlich LF 20            | sofort finanziert; Stufe 2 nötig |
| Zusätzliches LF gekauft, 250.000 € Reserve   | Rettungswache und RTW       | 3 h 45 min                       |
| Rettungsdienst gekauft, 0 € Reserve          | Notarztstandort und NEF     | 2 h                              |
| Früher Fuhrpark, 250.000 € Reserve           | DLK                         | 3 h 45 min                       |
| Fortgeschritten, 1.000.000 € frei            | Luftrettungsstation und RTH | 11 h                             |
| 0 € frei, vorhandene Wache, keine Einsätze   | Ersatz-TSF-W                | 1 h 30 min                       |

Die Zeiten bezeichnen laufende Weltzeit und finanzielle Deckung. Sie behaupten keine gefahrenen Routen oder tatsächliche Einsatzdauer. Eine niedrigere Einsatzqualität kann den kleinen modellierten Einsatzanteil vermindern; Grundfinanzierung bleibt unabhängig davon.

## Einmalige Migration

Als Designentscheidung gilt **1 alter Credit = 10 Spiel-Euro = 1.000 Cent**. Dies ist kein realer Wechselkurs. Währungsversion 1 und Preisversion 1 werden getrennt gespeichert. Preisversion 1 verbucht zusätzlich einmalig **60 % des umgerechneten freien Altguthabens** als „Bestandsschutz · Kaufkraftausgleich Preisversion 1“. Das erhält die frühere Kaufkraft gegenüber dem größten Preisverhältnis im Katalog.

Beispiel: 250.000 alte Credits → 2.500.000,00 € + 1.500.000,00 € Bestandsschutz = 4.000.000,00 €. Vorhandene Objekte werden nicht erneut berechnet; alte zugesagte Einsatzvergütungen werden in der neuen Einheit erhalten. XP, Positionen, Wege und Besitz werden für die Geldumstellung nicht verändert. Historische Buchungen, Archivberichte, Auszahlungsbelege und inaktive Einzelspielerarchive werden ebenfalls konsistent umgerechnet.

Schema 14 erstellt vorher eine Sicherung und prüft Summen, Journalfenster und Wiederholbarkeit. Eine reine Vorschau ist vor dem ersten Start möglich. [[Serverbetrieb]] nennt die genauen Befehle und Routervoraussetzungen.
