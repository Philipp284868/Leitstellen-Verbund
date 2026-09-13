# Progression, Freischaltungen und Einsatzfunk · Version 2.28

## Bestätigter Ausgangspunkt und neue gemeinsame Regel

Ausgangsstand ist main `01a63db` (2.27.1): 150 XP bis Stufe 2, aber mindestens 100 XP vor fachlichen Zuschlägen pro erfolgreichem Auftrag; keine levelabhängige Erzeugungsobergrenze. Unterschiedliche Funk-IDs konnten denselben Einsatz mehrfach aktiv melden. Die Prüfung fand keinen zusätzlichen belegten Euro-/Cent- oder Doppelbuchungsfehler. Verbindliche XP-Pfade sind Abschlussvergütung der besitzenden Leitstelle und bestätigte Hilfe; Patientenübergabe, Kampagnen, Erfolge, Tutorial, FMS und Käufe vergeben keine weiteren eigenständigen XP. Historische Berichts-XP sind Auswertungswerte, keine zweite Auszahlung.

Progressionsversion **2** wird in `src/shared/progression.ts` zentral berechnet. XP sind ganzzahlig; kumulative Gesamt-XP, Fortschritt innerhalb der Stufe und nächster Schwellwert sind getrennt. Erforderliche XP von L nach L+1:

| L     | XP bis zum nächsten Level |
| ----- | ------------------------- |
| 1     | 240                       |
| 2–5   | 300 + 45 × (L − 2)        |
| 6–15  | 600 + 45 × (L − 6)        |
| 16–30 | 1.080 + 35 × (L − 16)     |
| 31–50 | 1.620 + 40 × (L − 31)     |
| Ab 51 | 2.420 + 35 × (L − 51)     |

Kein Abbruch bei 10, 20 oder 50. Der unterstützte Zahlenbereich bleibt 0 bis 1.000.000.000.000 XP. Rest-XP bleiben erhalten; ungültige Gutschriften werden vor einer Änderung abgewiesen.

## Vollständige XP-Vergütung

Für die Szenarienfamilien gilt der Grundwert unten, plus 0/10/25 XP für die ursprüngliche Schwere 1/2/3 und 10 XP für die ursprüngliche Variante `extended`; höchstens 150 XP. Anschließend wirkt ausschließlich die vorhandene erfolgreiche Abschlussqualität von 0 bis 1, abgerundet. Vorlage und Betrag werden bei Erstellung eingefroren: spätere Eskalation, mehr Fahrzeuge, Spielerlevel, Wartezeit und Eurobeträge erhöhen sie nicht.

| Familie        | Grund-XP |
| -------------- | -------: |
| small-fire     |       20 |
| vehicle-fire   |       28 |
| vegetation     |       35 |
| structure-fire |       55 |
| industry-fire  |       90 |
| technical      |       25 |
| collapse       |       90 |
| traffic        |       55 |
| hazmat         |       75 |
| water-rescue   |       65 |
| flood          |       55 |
| medical        |       35 |
| police         |       25 |
| crowd          |       45 |
| supply         |       45 |

Die älteren, weiterhin real verwendeten benannten Vorlagen haben diese vollständigen Festwerte; auch sie unterliegen der Abschlussqualität:

| Vorlagen-ID | Grund-XP |
| ----------- | -------: |
| bin         |       20 |
| car         |       28 |
| shed        |       25 |
| field       |       35 |
| flat        |       55 |
| roof        |       65 |
| factory     |      110 |
| tree        |       25 |
| cellar      |       25 |
| chemical    |       90 |
| smoke       |       75 |
| silo        |      105 |
| sick        |       35 |
| transfer    |       25 |
| heart       |       55 |
| fall        |       45 |
| birth       |       45 |
| sport       |       35 |
| remote      |       65 |
| care        |       40 |
| traffic     |       25 |
| theft       |       25 |
| burglary    |       30 |
| match       |       40 |
| search      |       35 |
| demo        |       45 |
| roadblock   |       35 |
| fair        |       55 |
| debris      |       45 |
| pump        |       50 |
| supply      |       45 |
| shore       |       50 |
| capsize     |       65 |
| flood       |       85 |
| crash       |       75 |
| bus         |      115 |
| warehouse   |      100 |
| waterrescue |       95 |
| collapse    |      120 |
| rail        |      140 |
| bma-false   |       20 |

Beispiele bei voller Qualität:

| Auftrag                                 | Vorher XP | Jetzt XP |
| --------------------------------------- | --------: | -------: |
| Müllbehälterbrand                       |       115 |       20 |
| Dachstuhlbrand                          |       200 |       65 |
| Verkehrsunfall mit eingeklemmter Person |       215 |       75 |
| Industriebrand                          |       260 |      110 |
| Gefahrgutunfall am Güterbahnhof         |       310 |      140 |

Die besitzende Leitstelle erhält die einmalige Abschlussvergütung. Alle berechtigten Helfer teilen zusätzlich einen festen Pool von höchstens 25 Prozent dieser XP; Verteilung nach sortierten Empfänger-IDs, ganzzahliger Rest deterministisch. Weitere Fahrzeuge vergrößern den Pool nicht. SQL-Journal und Spielstand werden in derselben Welttransaktion gespeichert. Der Schlüssel bindet Weltgeneration, eingefrorenen Einsatzvorgang, Vergütungsart und Empfänger. Wiederholte Aufträge, Neustarts und spätere Kooperationsrunden erzeugen keine weitere Gutschrift. Altaufträge ziehen bereits gebuchte Teil-XP ab.

## Gemessene Aufstiege und wirtschaftliche Auswirkungen

Messung mit `node scripts/bench-progression.mjs --parallel 3` bzw. `--parallel 1`, Seeds 124, 811 und 2026. Je acht Startstufen ergeben 48 aktuelle und 48 alte vollständige Verläufe. Ein weiterer Durchlauf aller 24 aktuellen Parallelfälle reproduzierte die Ergebnisse exakt. Der Vorherlauf nutzt einen unveränderten Export des Ausgangscommits über `--source`.

Die Messung führt echte Simulationstakte, Anrufannahme und Rückfragen, AAO/freie Erkundungsdisposition, Alarmierung, Wege, Ausrück-/Arbeitszeiten, Lagemeldungen, Fachaufgaben, Patiententransport und Abschlüsse aus. Sie setzt keine Fahrzeuge künstlich ans Ziel und überspringt keine Einsatzarbeit. Verwendet wird eine **kleine synthetische Berlin-Routingfixture**, keine Messung auf dem privaten Deutschlandserver. Die automatische Bedienung reagiert spätestens nach fünf Simulationssekunden. Der Fuhrpark wird mit realen Voraussetzungen, jedoch isoliertem Testbudget vorbereitet; bei tatsächlichen Ausfällen werden bei Bedarf Reservefahrzeuge regulär beschafft. Das ist ein Fortschrittsversuch nach erreichter Ausstattung, keine vollständige Finanz-/Aufbaukampagne.

| Aufstieg | Vorher Abschlüsse | Vorher Minuten (bis 3 parallel) | Jetzt Abschlüsse | Jetzt Minuten (bis 3 parallel) | Jetzt Minuten (nacheinander) |
| -------- | ----------------: | ------------------------------: | ---------------: | -----------------------------: | ---------------------------: |
| 1 → 2    |               2–2 |                             7–7 |            11–12 |                          37–40 |                        37–40 |
| 3 → 4    |               2–2 |                            9–11 |             9–14 |                          32–47 |                        54–88 |
| 5 → 6    |               3–3 |                            9–12 |            14–15 |                          42–45 |                       92–106 |
| 10 → 11  |               3–4 |                           21–33 |            16–22 |                          75–90 |                      144–161 |
| 15 → 16  |               4–5 |                           12–25 |            19–23 |                          61–96 |                      124–148 |
| 20 → 21  |               3–4 |                           13–26 |            20–24 |                          86–92 |                      158–168 |
| 30 → 31  |               4–4 |                           15–18 |            27–30 |                        101–111 |                      187–192 |
| 50 → 51  |               6–7 |                           23–26 |            39–44 |                        141–141 |                      258–299 |

Stufe 1 blieb trotz drei erlaubter Plätze wegen nur eines Einstiegsfahrzeugs bei **einem** laufenden Auftrag. Bei Stufe 3 wurden zwei bis drei, darüber höchstens die bewusst gemessenen drei gleichzeitig bearbeitet. Die harte Grenze bis zehn wird separat gegen sämtliche Erzeugungspfade geprüft. Ein günstiger Mix benötigt auf Stufe 3 neun statt der angestrebten ungefähr zehn bis fünfzehn Abschlüsse. Später wächst der Aufwand sanft: Stufe 50 benötigt 39–44 Abschlüsse, mit Parallelbearbeitung rund 141 Minuten. Nacheinander dauern dieselben hohen Stufen deutlich länger; die Tabelle verschweigt diesen Unterschied nicht. Menschliche Reaktionszeit, Geografie und Fehlentscheidungen verändern reale Spielzeiten.

**Geld bleibt unverändert.** Alle 70 Kaufpreise, 686 Einsatzvergütungen und übrigen Geldparameter wurden gegen den Ausgangscode verglichen und sind identisch. Es gibt keine neue Grundfinanzierung oder Tutorialzahlung. Gemessene Brutto-Einsatzerlöse pro Simulationsstunde (Summe der drei Seeds, höchstens drei parallele Einsätze; keine laufenden Kosten abgezogen):

| Startstufe | Vorher €/h | Jetzt €/h | Abweichung |
| ---------- | ---------: | --------: | ---------: |
| 1          |  142.810 € | 139.516 € |     -2.3 % |
| 10         |   79.057 € | 141.682 € |     79.2 % |
| 20         |  148.633 € | 166.707 € |     12.2 % |
| 30         |  186.769 € | 178.654 € |     -4.3 % |
| 50         |  201.976 € | 202.748 € |      0.4 % |

Diese unterschiedlich langen Aufstiegsfenster enthalten unterschiedliche abgeschlossene Mischungen; sie belegen keine isolierte Änderung einer Geldformel. Der langsamere Levelaufstieg erhöht die Anzahl bezahlter Einsätze bis zur nächsten Freischaltung. Die tatsächliche Grenze von zehn kann bei zuvor größeren Leitstellen den Gesamtdurchsatz senken; Altüberhänge bleiben zunächst erhalten. Es wurde keine Preis- oder Geldanpassung als Ausgleich vorgenommen.

## Vollständige Freischaltmatrix

9 Einrichtungstypen, 57 Fahrzeuge und 4 Erweiterungen. Preise, konkrete passende Wachen und weitere Kaufvoraussetzungen stehen vollständig in der aktualisierten [Euro-Preisliste](EURO-PREISE.md) und [maschinenlesbaren Liste](EURO-PREISE.json).

| Level | Neu freigeschaltet                                                                                                                                                                                         |
| ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | Feuerwache (Einrichtung, `fire`); TSF-W (Fahrzeug, `tsf`)                                                                                                                                                  |
|     2 | LF 20 (Fahrzeug, `lf`); LF 10 (Fahrzeug, `lf10`)                                                                                                                                                           |
|     3 | TLF 4000 (Fahrzeug, `tlf`); TLF 2000 (Fahrzeug, `tlf2000`)                                                                                                                                                 |
|     4 | Rettungswache (Einrichtung, `ems`); Ausbildungszentrum (Einrichtung, `school`); RTW (Fahrzeug, `rtw`); KTW (Fahrzeug, `ktw`)                                                                               |
|     5 | HLF 10 (Fahrzeug, `hlf10`); TLF 3000 (Fahrzeug, `tlf3000`)                                                                                                                                                 |
|     6 | HLF 20 (Fahrzeug, `hlf`)                                                                                                                                                                                   |
|     7 | Polizeiwache (Einrichtung, `police`); Funkstreifenwagen (Fahrzeug, `fustw`)                                                                                                                                |
|     8 | ELW 1 (Fahrzeug, `elw`); KdoW (Fahrzeug, `kdow`); NKTW / KTW Typ B – zwei Transportplätze (Fahrzeug, `ktwb`)                                                                                               |
|     9 | NEF (Fahrzeug, `nef`); VRW (Fahrzeug, `vrw`); Notarztstandort (Erweiterung, `doctor`)                                                                                                                      |
|    10 | DLK 23 (Fahrzeug, `dlk`); MZF Rettungsdienst (Fahrzeug, `mzf`)                                                                                                                                             |
|    12 | Krankenhaus (Einrichtung, `hospital`); RTW – erweiterte Versorgung (Fahrzeug, `rtwxl`)                                                                                                                     |
|    13 | Polizei-MTW (Fahrzeug, `pmtw`); GW-L (Fahrzeug, `gwl`)                                                                                                                                                     |
|    14 | RW (Fahrzeug, `rw`); NAW (Fahrzeug, `naw`); SEG-RTW (Fahrzeug, `segrtw`); Technische Hilfeleistung (Erweiterung, `technical`)                                                                              |
|    15 | THW-Unterkunft (Einrichtung, `thw`); GKW (Fahrzeug, `gkw`); THW-MTW (Fahrzeug, `tmtw`); GW-T (Fahrzeug, `gwt`); Beleuchtungsfahrzeug (Fahrzeug, `thw-light`)                                               |
|    16 | Katastrophenschutzwache (Einrichtung, `kats`); Schlauchwagen SW 2000 (Fahrzeug, `sw`); GW Logistik Katastrophenschutz (Fahrzeug, `kats-log`)                                                               |
|    17 | MzGW (Fahrzeug, `mzgw`); SEG-Betreuung (Fahrzeug, `segbetreuung`)                                                                                                                                          |
|    18 | GW-Atemschutz (Fahrzeug, `air`); ELRD (Fahrzeug, `elrd`); Fachgruppe Elektroversorgung (Fahrzeug, `thw-power`); Hochleistungspumpen-Modul (Fahrzeug, `thw-pump`); Atemschutzwerkstatt (Erweiterung, `air`) |
|    19 | Wasserrettungsstation (Einrichtung, `water`); GW-Wasserrettung (Fahrzeug, `gww`); Zugfahrzeug mit Rettungsboot (MZB) (Fahrzeug, `boat`)                                                                    |
|    20 | GW-San (Fahrzeug, `gwsan`)                                                                                                                                                                                 |
|    22 | GW-Mess (Fahrzeug, `gwmess`); OrgL Rettungsdienst (Fahrzeug, `orgl`); Gerätewagen Taucher (Fahrzeug, `dive-unit`)                                                                                          |
|    24 | GW-Gefahrgut (Fahrzeug, `haz`); LNA (Fahrzeug, `lna`); Flugfeldlöschfahrzeug (Fahrzeug, `flf`); Universallöschfahrzeug (Fahrzeug, `ulf`); Gefahrgut-Erweiterung (Erweiterung, `hazmat`)                    |
|    25 | WLF mit AB-Wasser (Fahrzeug, `abwasser`)                                                                                                                                                                   |
|    26 | WLF mit AB-Schaum (Fahrzeug, `abschaum`); WLF mit AB-Atemschutz (Fahrzeug, `abatem`); ITW (Fahrzeug, `itw`)                                                                                                |
|    28 | WLF mit AB-Rüst (Fahrzeug, `abruest`); Dekon-P (Fahrzeug, `dekonp`)                                                                                                                                        |
|    30 | Rettungshubschrauberstation (Einrichtung, `heli`); RTH (Fahrzeug, `rth`); WLF mit AB-Gefahrgut (Fahrzeug, `abgefahrgut`)                                                                                   |
|    32 | ELW 2 (Fahrzeug, `elw2`)                                                                                                                                                                                   |
|    34 | GRTW (Fahrzeug, `grtw`)                                                                                                                                                                                    |
|    38 | ITH (Fahrzeug, `ith`)                                                                                                                                                                                      |

Zusätzlich: Berufsfeuerwehr-Umstellung ab Stufe 6 an einer geeigneten bestehenden kommunalen FF. Für jeden der neun Gebäudetypen sind Ausbauziele 2 bis 10 vollständig in der Oberfläche enthalten (81 Ausbaupositionen). Erforderlicher Spielerlevel = Maximum aus Gebäudefreischaltung und zweimal bisheriger Ausbaustufe. Vorstufe, betriebsbereiter Zustand und Ausbaukosten gelten weiter.

Fahrzeugkauf erfordert eine fertige passende Wache, freien Stellplatz, Geld und ggf. technische/ABC-/Atemschutz-/Notarzterweiterung. Werk-/Betriebs-/Flughafenmittel benötigen den passenden realen Wachtyp. Die vorhandene automatische Wachbesetzung stellt die notwendige Qualifikation bereit; Ausbildungszentrum ab 4 ist kein unnötiger Pflichtkauf vor jedem Rettungswagen. Rettungsdienst ab 4 kann reale externe Krankenhäuser anfahren, ohne zuvor ab 12 ein eigenes Krankenhaus kaufen zu müssen. UI und Server prüfen dieselben Freigaben einschließlich gespeicherter Bestandsrechte.

Der Generator verlangt zusätzlich die dauerhaft tatsächlich vorhandenen Fähigkeiten mit betriebsfähigen eigenen Wachen. Temporär gebundene Fahrzeuge werden davon unterschieden. Ein Levelaufstieg schenkt kein Fahrzeug und erzwingt ohne Ausstattung keinen neu freigeschalteten Einsatztyp. Das vorhandene Fortschrittsdetail zeigt nächstes Ziel, sämtliche Voraussetzungen, Suche und Seiten; kein zusätzliches großes HUD-Panel.

## Arbeitslast und Funk

`maxConcurrentIncidents(L) = min(10, L + 2)`: Level 1/2/3/4/5/6/7 erlauben 3/4/5/6/7/8/9, ab 8 dauerhaft 10. Maßgeblich ist die besitzende Leitstelle; mehrere Disponenten/Browser teilen das Budget. Unabhängige Leitstellen haben getrennte Budgets. Schon der erste angebotene Notruf zählt, Mehrfachanrufer nicht mehrfach. Notwendiger Transport hält den Vorgang bis zur tatsächlichen Übergabe besetzt, reine Rückfahrt nicht. Angenommene fremde Hilfe zählt je fremdem Einsatz einmal, zusätzliche Fahrzeuge desselben Vorgangs nicht nochmals. Hilfe anfordern bleibt möglich. Regulärer Generator, Kampagnen, Folgeeinsätze und Laborerzeugung prüfen die Kapazität bei jeder Erstellung erneut.

Der gepacete Einstieg bleibt an Anwesenheit und betriebsfähige Ausstattung gebunden, Mindestabstand 60 Sekunden. Nach Abschluss mindestens 45 Sekunden Ruhe vor dem nächsten unabhängigen Auftrag. Reconnect, Levelwechsel und vergangene Offlinezeit füllen freie Plätze nicht auf einen Schlag; bereits laufende Gefahren-/Patientenbearbeitung bleibt wirksam.

Pro kanonischem Einsatz und empfangender Leitstelle gibt es **einen** persistenten Fahrzeugfunkeintrag. Ein geeigneter eintreffender Sprecher wird deterministisch gewählt. FMS-Status wird separat weitergeführt, erzeugt aber keinen eigenen aktiven Fahrzeugfunk. Neue Bedürfnisse, Patientendaten, Eskalation und Ausfälle ändern Inhalt/Handlungsstatus still. Fachliche Anliegen bleiben getrennt, versioniert und einzeln bearbeitbar; eine veraltete Quittierung kann keine neue Nachforderung schließen. Aufklappbare Historie erhält Ereignisse und Bearbeiter. Ein Sprecherwechsel, späteres Fahrzeug, eine neue Kooperationsrunde, Queue-Rotation oder Wiederverbindung löst keine zweite Erstbenachrichtigung aus. Beendete Hilfe erhält keine weiteren fremden Lageupdates. TTS bleibt aus; separate Verbindungsereignisse funktionieren weiter.

Die gezielte 20-Fahrzeug-Prüfung erzeugt genau eine Erstbenachrichtigung. In den nacheinander gemessenen Verläufen standen zuvor etwa 8–38 aktive Fahrzeugfunk-/Statusnachrichten je abgeschlossenem Auftrag einer aktuellen konsolidierten Karte gegenüber (technisch/ohne Erstankunft abgeschlossene Vorgänge können null haben). Parallel noch laufende Aufträge werden nicht als zusätzliche Meldung eines abgeschlossenen Vorgangs ausgegeben.

## Gesicherte Migration und normaler AMP-Betrieb

SQLite-Schema **27**, Domänenmarker `game-rules-v2`. Bestehende Datenbanken werden im vorhandenen Update-/Startweg vor der Migration gesichert. SQL-Schema und Domänenübertragung laufen transaktional; auch ein bereits von AMP auf 27 vorbereiteter Bestand führt die Datenübertragung genau einmal aus. Fehler rollen vollständig zurück. Die alte Berechnung in `progression-v1.ts` ist ausschließlich eingefrorene Migrationslogik, keine zweite laufende Progressionsregel.

Erreichter Level und relativer XP-Anteil bleiben erhalten (ganzzahlige Rundung unter einer XP, keine Auf-/Abstufung). Roh-XP, frühere Umrechnung und neue Konversion sind separat nachvollziehbar. Leaderboard nutzt dieselbe Version; Umrechnung zahlt keine Belohnung. Bereits erworbene Kauf- und Ausbaurechte bleiben gespeichert. Aktive Einsätze über dem neuen Limit erhalten einen Altbestandsmarker, werden ohne Löschung abgearbeitet und blockieren neue unabhängige Aufträge. Laufende Altaufträge erhalten eine feste Version-2-Vergütung abzüglich nachweislich gebuchter Teil-XP; archivierte Einsätze werden nicht nachvergütet. Alte offene Funkanliegen werden ohne Replay zusammengefasst, Fachaufgaben und historische Ereignisse bleiben erhalten. Konten, Geld, Besitz, laufende Transporte, Karte, Ratenlimits und HUD-Stil bleiben erhalten.

Betreiberweg: vorhandene Instanz in AMP regulär **aktualisieren**, anschließend falls nötig **starten**. Kein Reset, anderes Template, Startskript oder erneuter Deutschlandimport. Die Veröffentlichung allein aktualisiert keine private Instanz. Details zu Sicherung, Diagnose und Wiederherstellung stehen in [AMP.md](AMP.md).

## Historische Studie und Weltmigration aus Version 2.12

Die folgenden Abschnitte bleiben als damals dokumentiertes Modell und technische Herleitung erhalten. Aussagen über zwei aktive Fälle, getrennte Spielmodi, Schema 11 oder die fiktive 100-km-Region beschreiben diesen früheren Stand. Für heutigen Betrieb gelten die aktuellen Abschnitte oben.

## Balancing: reproduzierbare Modellschätzung

Ausführen mit `node scripts/progression-audit.mjs`. Vollständige Annahmen, Szenarienmischungen, Fahrzeuglisten, Fahrzeiten, Meilensteine und Messwerte stehen in [PROGRESSION-AUDIT.json](https://github.com/Philipp284868/Leitstellen-Verbund/blob/03e9878217292f1879d71a01a7722e87dc14eb1d/docs/PROGRESSION-AUDIT.json).

Die Schätzung verwendet 48 deterministisch ausgewählte lokale Fahrziele je Spielphase, echte Straßenrouten mit Beschleunigung/Bremsen, einen kleinen bis mittleren Fuhrpark und 1–1,7 effektiv parallel bearbeitete Einsätze bei höchstens zwei offenen Missionen. Die mittlere Anrufpause wird mit 150 Sekunden angesetzt. Die Rechnung enthält Hin- und Rückfahrt, 40 Sekunden für Notruf/Disposition/Ausrücken, ursprüngliche Einsatzarbeit, 30 Sekunden Erkundung sowie bei Patienten 150 Sekunden für Versorgung/Übergabe. Individuelle Patientenverläufe, vollständige taktische Fehlentscheidungen und das Wetter sind keine Vorhersagegrößen dieses Modells. Die Referenzbedingungen sind frei; reale Schlechtwetterlagen benötigen mehr Zeit.

Die Fahrzeuge sind keine Vollausstattung aller Organisationen. Frühe Missionsorte liegen innerhalb von 2,16 km Luftlinie um geeignete Wachen, bei mehr als vier Fahrzeugen innerhalb von 4,8 km. Die tatsächlich gefahrene Straße kann länger sein. Eine Startwache übernimmt keine zufälligen 100-km-Anfahrten. Grundsätzlich vorhandene Fähigkeiten zählen auch bei vorübergehender Bindung oder einem reparierbaren Defekt.

| Beispielstufe | Ø XP je erreichbarem Szenario | Erwartete Minuten je Aufstieg | Ø Straßenanfahrt |
| ------------: | ----------------------------: | ----------------------------: | ---------------: |
|             1 |                         126.7 |                           7.7 |          1.98 km |
|             5 |                         137.5 |                          10.9 |          1.98 km |
|            10 |                         151.2 |                          20.8 |          1.98 km |
|            20 |                         154.3 |                          48.8 |          3.63 km |
|            35 |                         158.8 |                          80.3 |          3.63 km |
|            60 |                         158.8 |                         124.0 |          3.63 km |

Diese Werte sind ausdrücklich Simulationen, keine gemessenen Spielerzeiten und keine Garantie. Stufe 11 liegt in der konservativen Übergangsrechnung noch knapp unter 30 Minuten; danach wachsen die Zeiten gleichmäßig in den Zielbereich. Nach Stufe 50 wächst die Kurve weiter, ohne Sprung auf eine neue starre Obergrenze. Das Modell schätzt Stufe 10 nach rund 2,1 Stunden, Stufe 20 nach 7,3 Stunden und die Luftrettung auf Stufe 30 nach 17,2 Stunden. Die JSON-Datei enthält die vollständige Rechnung. Der Vergleich mit den alten 60–80 XP verwendet dieselbe neue Routenbasis, um den isolierten Fortschrittseffekt zu zeigen; historische Spielzeiten auf der alten Karte werden nicht als gemessen behauptet. Oberhalb Stufe 10 war der alte sichtbare Fortschritt blockiert.

## Migration und Betrieb

SQLite-Schema **11** folgt auf Schema 10. Vor einer vorhandenen älteren Datenbank wird automatisch eine konsistente `pre-migration-v2-<Zeit>-<ID>.sqlite` angelegt. Der historische Dateipräfix bleibt aus Kompatibilitätsgründen bestehen. `.env`, Konten, Besitz, Geld und Standorte werden nicht zurückgesetzt. Die beiden Spielmodi werden getrennt migriert.

Offline-Vorschau nach Serverstopp mit derselben `.env`/`DATA_DIR`:

```text
node dist/server/cli.js migration-preview
```

Die Vorschau öffnet SQLite lesend und zeigt pro gespeichertem Stand alte/neue XP, Ausgleich, Stufe und aktive Fahrten. Sie besitzt keine Freigabe zum Schreiben von Spieldaten. Ein vorhandenes Server-Lock verhindert gleichzeitige Wartung. `node dist/server/cli.js backup` und die bestehende dokumentierte CLI-Wiederherstellung bleiben nutzbar. Erst der folgende reguläre Serverstart führt die versionierte Migration aus.

`progression.version = 1` protokolliert ursprüngliche XP, ursprüngliche Stufe und den einmaligen Ausgleich. Beispiel: alte 1.350 XP bedeuteten Stufe 10; die neue Schwelle für Stufe 10 beträgt 3.060 XP, daher werden einmalig 1.710 Migrations-XP separat vermerkt. Höhere schon gespeicherte XP bleiben erhalten. Wiederholtes Laden oder Migrieren zahlt den Ausgleich nicht erneut aus.

Der bisherige Weltbezeichner `falkenried-2` bleibt die Identität der Basiswelt. `regionVersion = 3` und `worldSeed = 71493` kennzeichnen die neue deterministische Erweiterung. Die ältere, bereits vorhandene Umstellung der historischen Rasterwelt `falkenried-1` bleibt als vorgelagerte Migration erhalten. Diese neue Erweiterung verschiebt keine Standorte der bisherigen organischen Welt.

Aktive alte Fahrten werden anhand ihrer bisher gültigen zeitlichen Streckeninterpolation an der tatsächlichen gespeicherten Position übernommen. Verbleibende Strecke und ETA werden neu geplant. Bei noch laufender Alarmierung bleibt die restliche Ausrückzeit erhalten. Pannen bleiben am Pannenort und setzen nach Reparatur mit dem neuen Profil fort. IDs, Aufträge, FMS-Verlauf und Belohnungsbelege bleiben erhalten; die Migration löst keine zweite Ankunft oder Belohnung aus. Der etablierte Server-Neustart setzt an der gespeicherten Simulationszeit fort; abgeschaltete Server rechnen ihre Ausfallzeit nicht ein zweites Mal an.

## Welt und Bedienung

Die Fläche misst exakt **100.000 × 100.000 Meter = 10.000 km²**. Eine unveränderte Welteinheit entspricht 12 Metern; jede Achse reicht von 0 bis 100.000/12. Zoom verändert nur die Darstellung. Alle 1.959 bisherigen Straßenknoten bleiben einschließlich Reihenfolge und Koordinaten unverändert. Ihr SHA-256 über die ursprüngliche JSON-Liste lautet `18994f4732e0236739b7f2ac91d88a35ce2f1d20a3c772a8c14506a8dd866aa0` und wird geprüft.

Die Region enthält jetzt 6.527 Knoten, 250 benannte Straßen und 6.718 Abschnitte. 28 zusätzliche Orte ergänzen die bisherigen zehn Regionalorte und Falkenried. Verbindungsstraßen, alternative Schnellstraßen, unregelmäßige Ortsstraßen, Gewerbezufahrten, Felder, Waldflächen und straßenorientierte Gebäude füllen die Erweiterung. Es werden keine Kilometer durch Hochskalieren alter Straßen erzeugt. Neue Anschlüsse verbinden sich an festgelegten gemeinsamen Knoten. 107 geometrische Kreuzungen ohne gemeinsamen Knoten werden ausdrücklich als Überführungen gezeichnet; bloßes Überkreuzen verbindet dort keine Straßen.

Die Karte bietet Objekt- und Ortssuche über die tatsächlichen Daten, Organisations-/Objekt-/Statusfilter, Filterrücksetzung, Gesamtübersicht, eigene Wachen, Auswahlzentrierung, bewussten Fahrzeug-Folgemodus mit Abbruch bei manueller Bewegung, zoombereinigten Maßstab, markierte Gebietsgrenzen, gesonderte Fahrtdetails und hervorgehobene ausgewählte Routen. Fahrzeuggruppen werden bei kleiner Übersicht zusammengefasst und beim Vergrößern aufgelöst. Die Fuhrparkliste kann Fahrzeuge auf der Karte auswählen. Bauplätze erfordern Vorschau und Bestätigung; Stufe, Geld, Hafenlage, Belegung, Gebiet und Straßenanschluss werden in Oberfläche und Server geprüft. Verbindungsverlust zeigt den letzten bestätigten Stand und sperrt Käufe.

Statische Geometrie entsteht einmal beim Laden. Straßen-/Objektsuche verwendet räumliche Indizes, Häuser werden nur im relevanten Ausschnitt und Detailgrad gerendert. Die Suche lädt keine fremden Leitstellendaten nach. Das Backend simuliert auch außerhalb des sichtbaren Ausschnitts. Eine ausgeblendete mobile Karte mit Größe null löst keine unbeschränkte Indexabfrage aus.

## Straßen, Fahrzeugprofile und Zeit

Abschnitte besitzen stabile Knotenpaar-IDs, Geometrie, Meterlänge, Straßenart, Richtung, Zugangsart und numerische Limits. Die fiktiven Weltregeln sind 30 km/h auf Wohnwegen, 50 km/h auf Stadtstraßen, 80 km/h auf Landstraßen und 100 km/h auf Schnellstraßen. Das sind gekennzeichnete Spielwerte, keine verifizierten Realwelt-Schilder. Die Welt verwendet beidseitig befahrbare Straßen; der gerichtete Routingkern prüft auch einseitige Testgraphen und nicht erlaubte Kanten. Es werden keine nicht vorhandenen Abbiegeverbote behauptet.

Straßenfahrzeuge besitzen Höchstgeschwindigkeiten von 90 km/h (schwere Fahrzeuge), 110 km/h (RTW/KTW und entsprechende Transportfahrzeuge) oder 120 km/h (NEF, Funkstreife, ELW). Schwere Fahrzeuge beschleunigen mit 0,9 m/s², leichte mit 1,5 m/s²; die modellierte Bremsverzögerung beträgt 2 m/s². Diese Werte sind zentrale Simulationsannahmen. Die Zielgeschwindigkeit ist das Minimum aus Straße und Fahrzeug, vermindert durch konkret modellierte Wetter-/Verkehrsbedingungen. Normalfahrt und Sonderfahrt ignorieren standardmäßig keine Straßenlimits. Ein freier 80er-Abschnitt wird nach der Beschleunigung mit 80 km/h gefahren.

Der Routingkern minimiert Abschnittsfahrzeiten und bekannte Verzögerungen. Ein binärer Heap, räumliche Projektion auf angebrochene Abschnitte und ein begrenzter Cache ersetzen die bisherige wiederholte Sortierung nach kürzester Geometrie. Cache-Schlüssel enthalten Endpunkte, Fahrzeuggrenze, Bewegungsart, Wetter-/Verkehrsfaktor, gesperrte Richtungen und Verzögerungen. Nicht erreichbare Verbindungen werden nicht durch Luftlinienfahrten ersetzt. Bei zeitweiligen Sperren wird am bisherigen Ort auf die nächste mögliche Freigabe gewartet.

`motionVersion = 1` speichert analytische Beschleunigungs-, Konstantfahrt-, Brems- und Wartephasen. Geschwindigkeitswechsel werden vorausberechnet; das Fahrzeug bremst vor niedrigeren Limits. Technische Segmentgrenzen erzeugen keinen unnötigen Halt. Gemeldete Wartezeiten liegen am betreffenden Straßenabschnitt. Die früheren versteckten zufälligen Verzögerungsaufschläge entfallen. ETA, Wegstrecke, Kilometerzähler, FMS-Ankunft und Kartenposition benutzen dasselbe Profil. Die Simulationsschritte berücksichtigen Ankunft innerhalb eines Updates; verbleibende Updatezeit geht nicht verloren. Numerische Referenztests verwenden eine Toleranz von 10⁻⁸ Sekunden beziehungsweise Metern, Integrationsstrecken tolerieren kleine Gleitkommaabweichungen bis 10⁻⁵ Meter.

AAO-Vorschläge berücksichtigen Fahrzeit und geschätztes Ausrücken. Die Oberfläche weist diese Zeiten getrennt aus. Die spätere Quittierung einzelner FF-Mitglieder bleibt naturgemäß Teil der Simulation. Krankenhausvorschläge rechnen über Straßen; ohne konkretes Transportfahrzeug dient ein RTW-Profil als Schätzung. Private Pkw-Anreise der FF verwendet ebenfalls das leichte Straßenprofil; Fahrrad und Fußweg behalten passende eigene Geschwindigkeiten. RTH und Boot behalten ihre getrennten Luft-/Wasserwege. Die Betriebszeit bleibt 1×; der Browser glättet nur bestätigte Fahrten.

## Nachweise und Grenzen

Automatisierte Prüfungen decken Referenzfahrzeiten 30/50/60/80/100/120 km/h, die gemischten 864 Sekunden, echte 80 km/h, vorausgehendes Bremsen, Segment- und Tickgrößen, gerichtete schnelle Umwege, Sperren, Wartephasen, Migration, Pannen, persistente Käufe und Levelübergänge ab. Bestehende Logik-, Server-, Sicherheits-, Wiederverbindungs-, Kooperations-, CLI- und Browserprüfungen werden weiter ausgeführt. Den final tatsächlich ausgeführten Stand dokumentiert [ABNAHME-2.12.md](https://github.com/Philipp284868/Leitstellen-Verbund/blob/8940407e97361c978cd95125922849c97dda9b19/docs/ABNAHME-2.12.md).

Der zusätzliche Rechnerbenchmark verwendet 500 Fahrzeuge, davon 120 lange Fahrten, 120 Routensuchen und 100 Positionsläufe. Der Browserbenchmark verwendet 100 Wachen, 500 Fahrzeuge, 100 aktive Fahrten und 40 Einsätze. Messungen sind lokale Ergebnisse eines Windows-Rechners mit i7-13700K und Node 24.19.0, keine Zusicherung für beliebige AMP-Hardware. Große vollständige Zustandsnachrichten bleiben umfangreich; WebSocket-Kompression ist aktiviert, eine komplette Umstellung des bestehenden Übertragungsprotokolls auf Delta-Nachrichten ist nicht Bestandteil dieser Änderung.

Die Welt bleibt fiktiv und prozedural; es gibt keine echte Hausnummern-Geodatenbank, keine externen Kartenkonten und keine erfundenen Suchergebnisse. Wetter-/Verkehrswerte, Beschleunigung und Tempolimits sind Spielannahmen. Die Basiskarte enthält keine gesonderten Einbahn- oder Abbiegeverbotsdaten. Auf extreme Last durch sehr viele gleichzeitig verbundene Leitstellen wurde nicht geschlossen. Produktionsdaten, AMP-Port, Reverse Proxy und laufende Produktionsbereitstellung werden durch diesen Auftrag nicht verändert.
