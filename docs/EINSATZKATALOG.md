# Einsatz- und Fahrzeugkatalog

Stand: 09.09.2026. Die Tabellen werden aus dem tatsächlichen Katalog abgeleitet. Spielparameter dienen der Simulation; sie sind keine Handlungsanweisungen für reale Einsätze.

## Umfang und Zählweise

Der Katalog enthält **653 Einsatz-IDs**, davon **41 unverändert erhaltene ältere IDs** und **612 neue Situationen**. Die Abschnitte 3 bis 10 des Auftrags nennen **206 Themenpositionen**. Diese entsprechen **204 eindeutigen Themen**; jedes Thema besitzt drei gespeicherte, mechanisch verschiedene Varianten.

| Auftragsabschnitt | Themenpositionen | Kategorie                |
| ----------------- | ---------------: | ------------------------ |
| 3                 |               55 | Feuerwehr: Brände        |
| 4                 |               29 | Technische Hilfeleistung |
| 5                 |               21 | Verkehrsunfälle          |
| 6                 |               16 | Gefahrgut und ABC        |
| 7                 |               18 | Wasser und Natur         |
| 8                 |               33 | Rettungsdienst           |
| 9                 |               24 | Polizei                  |
| 10                |               10 | THW                      |

Die Differenz zur einfachen Rechnung 206 × 3 + 41 = 659 entsteht durch zwei wortgleiche, mehrfach geforderte Themen:

- **Arbeitsunfall** kommt in den Abschnitten 4 und 8 vor. Beide Positionen verwenden dieselben drei IDs mit Stamm `case-arbeitsunfall`.
- **Fahrzeug im Wasser** kommt in den Abschnitten 5 und 7 vor. Beide Positionen verwenden dieselben drei IDs mit Stamm `case-fahrzeug-im-wasser`.

Damit gilt **204 × 3 + 41 = 653**. Es wurden keine doppelten Karten angelegt, nur um die Zahl 659 zu erreichen. Die Quelldatei behält beide ursprünglichen Themenpositionen, und der Abdeckungstest prüft jede einzelne Position.

## Varianten und tatsächliche Wirkung

- **Gemeldete Lage** (`reported`): Ausgangslage des Themas mit eigenen Fähigkeiten, Patientenzuständen, Brennstoffen, Gefahren und Erkundungsinformationen.
- **Erschwerter Zugang** (`access`): zusätzlicher Zugang-/Sicherungsbedarf, längere Bearbeitung und passende zusätzliche Gefahren. Je nach Familie werden technische Rettung, Verkehrsabsicherung oder zusätzliche Mannschaften benötigt.
- **Ausgedehnte Lage** (`extended`): größere Kräfteanforderungen und Patientenanzahl, zusätzliche Gefahren und gegebenenfalls echte Einsatzabschnitte, Nachforderungen oder zeitversetzte Folgeereignisse.

Die Varianten unterscheiden sich in Serverparametern; der Name allein steuert keine Berechnung. Der Test vergleicht Anforderungen, Bearbeitungsdauer, Patienten, Gefahren und Brandzustände für jedes Thema. Fachlich verwandte Themen teilen bewusst Mechanismen, etwa zwei kleine Behälterbrände, statt für jeden Namen eine eigene Engine zu duplizieren.

Die 15 Familien liegen in `src/catalog/incident-variants.ts`. Explizite Themen und Zusatzmerkmale liegen in `src/catalog/incident-topics.ts`; das validierte Profil in `src/catalog/incident-profile.ts`.

| Familie        | Neue Situationen |
| -------------- | ---------------: |
| small-fire     |               21 |
| vehicle-fire   |               15 |
| structure-fire |               78 |
| vegetation     |               24 |
| industry-fire  |               33 |
| technical      |               72 |
| collapse       |               21 |
| medical        |               99 |
| traffic        |               60 |
| water-rescue   |               24 |
| hazmat         |               48 |
| flood          |               21 |
| police         |               60 |
| crowd          |               12 |
| supply         |               24 |

Feuer reagiert auf Brennstoff, Fläche, Innenraum, Ausbreitungsbereiche und Versorgung. Gefahrstoffe benötigen unter anderem Messung, Dekontamination oder Schaum. Medizinische Profile unterscheiden Ausgangszustand, Alter, Blutverlust, Temperatur, Schmerz und unbehandelte Verschlechterung. Intensivfälle benötigen tatsächliche Intensivtransportkapazität. Wetter, Saison, Tageszeit, Schul-/Berufsverkehr und besondere Ortsmerkmale verändern die Ziehungsgewichte; der Server verwendet reproduzierbare Seeds.

Erkundete Informationen erscheinen im Einsatzfenster. Zusatzpatienten, Brandübersprünge und Einsturzfolgen erzeugen tatsächlichen Ressourcenbedarf. Verletzte Einsatzkräfte werden zu Patienten, verlieren Verfügbarkeit und können die Mindestbesatzung ihres Fahrzeugs unterschreiten. Reparatur eines Fahrzeugs oder Einsatzabschluss heilen die Besatzung nicht. Erst Klinikübergabe und anschließende 15 Minuten Spielzeit erlauben eine erneute Verfügbarkeit; ein dokumentierter Tod bleibt bestehen.

## Fahrzeuge und Fähigkeiten

Es gibt **50 Fahrzeuge** und **26 Fähigkeiten**. Die 20 alten Fahrzeug-IDs bleiben erhalten; 30 Fahrzeuge ergänzen Feuerwehr und Rettungsdienst. Polizei und THW verwenden weiterhin ihre bestehenden Typen. AB-Einträge sind vollständige WLF-/Abrollbehälterkombinationen mit Kosten, Mannschaft und Fähigkeiten, keine selbstfahrenden Behälter.

| ID             | Fahrzeug                           | Wache  | Freischaltung | Soll-/Mindestbesatzung | Transportplätze |
| -------------- | ---------------------------------- | ------ | ------------: | ---------------------: | --------------: |
| `tsf`          | TSF-W                              | fire   |             1 |                  6 / 4 |               0 |
| `lf`           | LF 20                              | fire   |             2 |                  9 / 6 |               0 |
| `hlf`          | HLF 20                             | fire   |             6 |                  9 / 6 |               0 |
| `tlf`          | TLF 4000                           | fire   |             3 |                  3 / 3 |               0 |
| `dlk`          | DLK 23                             | fire   |            10 |                  3 / 3 |               0 |
| `elw`          | ELW 1                              | fire   |             8 |                  2 / 2 |               0 |
| `rw`           | RW                                 | fire   |            14 |                  3 / 3 |               0 |
| `haz`          | GW-Gefahrgut                       | fire   |            24 |                  3 / 3 |               0 |
| `air`          | GW-Atemschutz                      | fire   |            18 |                  3 / 3 |               0 |
| `rtw`          | RTW                                | ems    |             4 |                  2 / 2 |               1 |
| `ktw`          | KTW                                | ems    |             4 |                  2 / 2 |               1 |
| `nef`          | NEF                                | ems    |            11 |                  2 / 2 |               0 |
| `rth`          | RTH                                | heli   |            30 |                  3 / 3 |               1 |
| `fustw`        | Funkstreifenwagen                  | police |             7 |                  2 / 2 |               0 |
| `pmtw`         | Polizei-MTW                        | police |            13 |                  6 / 6 |               0 |
| `gkw`          | GKW                                | thw    |            15 |                  9 / 9 |               0 |
| `mzgw`         | MzGW                               | thw    |            17 |                  6 / 6 |               0 |
| `tmtw`         | THW-MTW                            | thw    |            15 |                  6 / 6 |               0 |
| `gww`          | GW-Wasserrettung                   | water  |            20 |                  4 / 4 |               0 |
| `boat`         | Zugfahrzeug mit Rettungsboot (MZB) | water  |            20 |                  4 / 4 |               0 |
| `lf10`         | LF 10                              | fire   |             2 |                  9 / 6 |               0 |
| `hlf10`        | HLF 10                             | fire   |             5 |                  9 / 6 |               0 |
| `tlf2000`      | TLF 2000                           | fire   |             3 |                  3 / 3 |               0 |
| `tlf3000`      | TLF 3000                           | fire   |             5 |                  3 / 3 |               0 |
| `elw2`         | ELW 2                              | fire   |            32 |                  4 / 4 |               0 |
| `kdow`         | KdoW                               | fire   |             8 |                  1 / 1 |               0 |
| `vrw`          | VRW                                | fire   |             9 |                  3 / 3 |               0 |
| `gwl`          | GW-L                               | fire   |            16 |                  3 / 3 |               0 |
| `gwmess`       | GW-Mess                            | fire   |            22 |                  3 / 3 |               0 |
| `gwt`          | GW-T                               | fire   |            16 |                  3 / 3 |               0 |
| `abruest`      | WLF mit AB-Rüst                    | fire   |            28 |                  2 / 2 |               0 |
| `abwasser`     | WLF mit AB-Wasser                  | fire   |            25 |                  2 / 2 |               0 |
| `abschaum`     | WLF mit AB-Schaum                  | fire   |            26 |                  2 / 2 |               0 |
| `abatem`       | WLF mit AB-Atemschutz              | fire   |            26 |                  2 / 2 |               0 |
| `abgefahrgut`  | WLF mit AB-Gefahrgut               | fire   |            30 |                  3 / 3 |               0 |
| `sw`           | Schlauchwagen SW 2000              | fire   |            16 |                  3 / 3 |               0 |
| `dekonp`       | Dekon-P                            | fire   |            28 |                  6 / 6 |               0 |
| `grtw`         | GRTW                               | ems    |            34 |                  4 / 4 |               6 |
| `naw`          | NAW                                | ems    |            14 |                  3 / 3 |               1 |
| `itw`          | ITW                                | ems    |            26 |                  3 / 3 |               1 |
| `ith`          | ITH                                | heli   |            38 |                  4 / 4 |               1 |
| `rtwxl`        | RTW – erweiterte Versorgung        | ems    |            12 |                  3 / 3 |               1 |
| `ktwb`         | KTW-B – zwei Transportplätze       | ems    |             8 |                  2 / 2 |               2 |
| `mzf`          | MZF Rettungsdienst                 | ems    |            10 |                  2 / 2 |               1 |
| `elrd`         | ELRD                               | ems    |            18 |                  2 / 2 |               0 |
| `orgl`         | OrgL Rettungsdienst                | ems    |            22 |                  2 / 2 |               0 |
| `lna`          | LNA                                | ems    |            24 |                  2 / 2 |               0 |
| `segrtw`       | SEG-RTW                            | ems    |            14 |                  3 / 3 |               1 |
| `gwsan`        | GW-San                             | ems    |            20 |                  6 / 6 |               0 |
| `segbetreuung` | SEG-Betreuung                      | ems    |            17 |                  6 / 6 |               0 |

Die ID `boat` bezeichnet ausschließlich „Zugfahrzeug mit Rettungsboot (MZB)“, benötigt vier Personen und fährt auf dem Straßengraphen zum Uferzugang. Aktuelle Europreise stehen in der [Preistabelle](EURO-PREISE.md); ein historischer Rivermere-Bootbetrieb ist nicht mehr enthalten.

Neue Fähigkeiten sind Schaummittelversorgung, Gefahrstoffmessung, Dekontamination, Intensivversorgung, Rettungsdienstführung, Betreuung, Notstrom und Beleuchtung. Der Katalogtest prüft, dass jede verlangte Fähigkeit von real kaufbaren Typen erfüllt werden kann. GRTW und KTW-B belegen mehrere tatsächliche Patientenplätze; ITW und ITH haben jeweils einen Intensivtransportplatz.

## Deutschland und Wasserrettung

Ortsprofile unterscheiden Straßen, Siedlungen und geprüfte Uferzugänge. Wasserlagen dürfen nur auf passenden tatsächlichen Geodaten entstehen. In Deutschland ist die bestehende ID `boat` eine vollständige **Zugfahrzeug-/Rettungsbootkombination** mit Straßenroute zum echten Uferzugang. Die Rettungsmaßnahme wird von dort durchgeführt. Es wird keine berechnete Fahrt über offenes Wasser behauptet. In vorhandenen Rivermere-Welten bleiben die alten Bootstypen und Wasserwege erhalten.

Der Katalog allein ist kein Nachweis eines deutschlandweit vollständigen Gewässer- oder Hafengraphen. Datenabdeckung, Uferzugänge und Straßenrouten werden durch die vorhandene Deutschland-Geodatenintegration geprüft.

## Speicherung, Ereignisse und Bewertung

Das beim Erzeugen gewählte Profil wird in `mission.dynamics.scenario` gespeichert. Ein bestehender Einsatz erhält bei Wiederverbindung, Neustart oder erneutem Anhängen seiner Dynamik keine neuen Zufallswerte. Alte Einsätze ohne Profil nutzen ihre bisherigen Regeln weiter. Neue optionale Felder betreffen Profil, Einsatzkräfte-/Verletzungszustand und Qualitäts-/Planzeitdaten; alte Dokumente bleiben lesbar.

Der Ereignisverlauf enthält einmalige Übergänge `HAZARD_CREATED`, `HAZARD_ESCALATED`, `PATIENT_CREATED`, `PATIENT_DETERIORATION` und `PATIENT_DEAD` sowie die vorhandenen Einsatz-, Fahrzeug- und Statusereignisse. Unveränderte Zustände erzeugen keine entsprechenden Ereignisse pro Tick.

Die Qualitätsauswertung erfasst Reaktion, Disposition, Ausrücken, tatsächliche Anfahrt im Verhältnis zur geplanten Route, echte nachträgliche Eskalationen und Patientenverluste. Lange planmäßige Deutschlandfahrten sind deshalb nicht automatisch schlecht. Nachforderungen, nicht eingesetzte Reserven, Fahrzeugminuten und Gesamtdauer erscheinen zusätzlich als nachvollziehbare Kennzahlen; notwendige Reserven werden nicht pauschal bestraft. Die anfängliche Größe einer Großlage zählt nicht als vermeidbare Eskalation. Qualität kann den bestehenden Basisverdienst reduzieren, erzeugt aber keinen Zusatzbonus durch absichtlich herbeigeführte Eskalation.

## Tatsächlich ausgeführte Katalogprüfungen

Am 09.09.2026 bestanden Typecheck, ESLint für die geänderten Katalog-/Dynamikmodule und **603 Tests in fünf Dateien**: `catalog-expansion`, `catalog-lifecycle`, `engine`, `phase-two` und `phase-four`.

- Alle 206 Themenpositionen und alle 612 neuen Profile: eindeutige IDs, gültiges Schema, mechanisch unterschiedliche Varianten, passende Fähigkeiten, reproduzierbare Zustände und echte Stabilisierung mit Organisationsaufträgen.
- 521 gewöhnliche neue Situationen: vollständiger Engine-Abschluss ab einer korrekt besetzten Vor-Ort-Ausgangslage, einschließlich erforderlicher Organisationsaufträge, Behandlung, realer Klinikfahrt, FMS 7, Abschlussarchiv und einmaliger Vergütung.
- Fünf Großlagentypen: Führung, echte Abschnittszuordnung, spätere Patienten und Klinikübergaben bis zum Abschluss.
- Mindestbesatzung nach Crew-Verletzung, Persistenz von Behandlung/Genesung/Tod, Intensivtransportauswahl, Folgeeinsatz bei bereits 71 offenen Einsätzen, faire Fahrtbewertung und einmalige Ereignisübergänge.

Diese Katalogtests ersetzen nicht die getrennten Server-, Deutschland-Routen- und Browserprüfungen des Gesamtprojekts. Sie behaupten keinen vollständigen GUI-/Anfahrttest jeder einzelnen Variante.

## Vollständige Zuordnung der Auftragspositionen

Jeder ID-Stamm besitzt die Endungen `-reported`, `-access` und `-extended`. Gleichlautende Positionen verweisen auf denselben Stamm.

| Abschnitt.Position | Thema aus dem Auftrag                         | ID-Stamm                                               | Familie        | Ortsprofil   |
| ------------------ | --------------------------------------------- | ------------------------------------------------------ | -------------- | ------------ |
| 3.1                | Mülleimerbrand                                | `case-muelleimerbrand`                                 | small-fire     | street       |
| 3.2                | Müllcontainerbrand                            | `case-muellcontainerbrand`                             | small-fire     | street       |
| 3.3                | Papiercontainerbrand                          | `case-papiercontainerbrand`                            | small-fire     | street       |
| 3.4                | Altkleidercontainerbrand                      | `case-altkleidercontainerbrand`                        | small-fire     | street       |
| 3.5                | Pkw-Brand                                     | `case-pkw-brand`                                       | vehicle-fire   | street       |
| 3.6                | Lkw-Brand                                     | `case-lkw-brand`                                       | vehicle-fire   | street       |
| 3.7                | Busbrand                                      | `case-busbrand`                                        | vehicle-fire   | street       |
| 3.8                | Motorradbrand                                 | `case-motorradbrand`                                   | vehicle-fire   | street       |
| 3.9                | Fahrrad-/Akku-Brand                           | `case-fahrrad-akku-brand`                              | vehicle-fire   | street       |
| 3.10               | Garagenbrand                                  | `case-garagenbrand`                                    | structure-fire | residential  |
| 3.11               | Carportbrand                                  | `case-carportbrand`                                    | structure-fire | residential  |
| 3.12               | Gartenlaubenbrand                             | `case-gartenlaubenbrand`                               | structure-fire | residential  |
| 3.13               | Schuppenbrand                                 | `case-schuppenbrand`                                   | structure-fire | residential  |
| 3.14               | Heckenbrand                                   | `case-heckenbrand`                                     | vegetation     | field        |
| 3.15               | Grasflächenbrand                              | `case-grasflaechenbrand`                               | vegetation     | field        |
| 3.16               | Böschungsbrand                                | `case-boeschungsbrand`                                 | vegetation     | field        |
| 3.17               | Feldbrand                                     | `case-feldbrand`                                       | vegetation     | field        |
| 3.18               | Strohballenbrand                              | `case-strohballenbrand`                                | vegetation     | field        |
| 3.19               | Waldbrand                                     | `case-waldbrand`                                       | vegetation     | forest       |
| 3.20               | Küchenbrand                                   | `case-kuechenbrand`                                    | structure-fire | residential  |
| 3.21               | Wohnzimmerbrand                               | `case-wohnzimmerbrand`                                 | structure-fire | residential  |
| 3.22               | Schlafzimmerbrand                             | `case-schlafzimmerbrand`                               | structure-fire | residential  |
| 3.23               | Kellerbrand                                   | `case-kellerbrand`                                     | structure-fire | residential  |
| 3.24               | Fassadenbrand                                 | `case-fassadenbrand`                                   | structure-fire | residential  |
| 3.25               | Balkonbrand                                   | `case-balkonbrand`                                     | structure-fire | residential  |
| 3.26               | Wohnungsbrand                                 | `case-wohnungsbrand`                                   | structure-fire | residential  |
| 3.27               | Mehrfamilienhausbrand                         | `case-mehrfamilienhausbrand`                           | structure-fire | residential  |
| 3.28               | Dachstuhlbrand                                | `case-dachstuhlbrand`                                  | structure-fire | residential  |
| 3.29               | Treppenhausbrand                              | `case-treppenhausbrand`                                | structure-fire | residential  |
| 3.30               | Hochhausbrand                                 | `case-hochhausbrand`                                   | structure-fire | residential  |
| 3.31               | Hallenbrand                                   | `case-hallenbrand`                                     | industry-fire  | industrial   |
| 3.32               | Lagerhallenbrand                              | `case-lagerhallenbrand`                                | industry-fire  | industrial   |
| 3.33               | Werkstattbrand                                | `case-werkstattbrand`                                  | industry-fire  | industrial   |
| 3.34               | Industriebrand                                | `case-industriebrand`                                  | industry-fire  | industrial   |
| 3.35               | Maschinenbrand                                | `case-maschinenbrand`                                  | industry-fire  | industrial   |
| 3.36               | Förderbandbrand                               | `case-foerderbandbrand`                                | industry-fire  | industrial   |
| 3.37               | Tankstellenbrand                              | `case-tankstellenbrand`                                | industry-fire  | industrial   |
| 3.38               | Reifenlagerbrand                              | `case-reifenlagerbrand`                                | industry-fire  | industrial   |
| 3.39               | Baustellenbrand                               | `case-baustellenbrand`                                 | structure-fire | construction |
| 3.40               | Containerbrand                                | `case-containerbrand`                                  | small-fire     | street       |
| 3.41               | Supermarktbrand                               | `case-supermarktbrand`                                 | structure-fire | commercial   |
| 3.42               | Einkaufszentrumbrand                          | `case-einkaufszentrumbrand`                            | structure-fire | commercial   |
| 3.43               | Schulbrand                                    | `case-schulbrand`                                      | structure-fire | residential  |
| 3.44               | Kindergartenbrand                             | `case-kindergartenbrand`                               | structure-fire | public       |
| 3.45               | Hotelbrand                                    | `case-hotelbrand`                                      | structure-fire | public       |
| 3.46               | Restaurantbrand                               | `case-restaurantbrand`                                 | structure-fire | public       |
| 3.47               | Discotheken-/Clubbrand                        | `case-discotheken-clubbrand`                           | structure-fire | public       |
| 3.48               | Bahnhofsbrand                                 | `case-bahnhofsbrand`                                   | structure-fire | public       |
| 3.49               | Parkhausbrand                                 | `case-parkhausbrand`                                   | structure-fire | commercial   |
| 3.50               | Tunnelbrand                                   | `case-tunnelbrand`                                     | industry-fire  | industrial   |
| 3.51               | Zugbrand                                      | `case-zugbrand`                                        | industry-fire  | rail         |
| 3.52               | Straßenbahnbrand                              | `case-strassenbahnbrand`                               | industry-fire  | rail         |
| 3.53               | Trafo-/Technikbrand                           | `case-trafo-technikbrand`                              | small-fire     | street       |
| 3.54               | Kabelbrand                                    | `case-kabelbrand`                                      | small-fire     | street       |
| 3.55               | Dämmstoff-/Isolierungsbrand                   | `case-daemmstoff-isolierungsbrand`                     | structure-fire | residential  |
| 4.1                | Baum auf Straße                               | `case-baum-auf-strasse`                                | technical      | construction |
| 4.2                | Baum auf Gebäude                              | `case-baum-auf-gebaeude`                               | technical      | residential  |
| 4.3                | Baum auf Fahrzeug                             | `case-baum-auf-fahrzeug`                               | technical      | construction |
| 4.4                | Ast droht zu fallen                           | `case-ast-droht-zu-fallen`                             | technical      | street       |
| 4.5                | Dachschaden                                   | `case-dachschaden`                                     | technical      | residential  |
| 4.6                | Dachziegel drohen zu fallen                   | `case-dachziegel-drohen-zu-fallen`                     | technical      | residential  |
| 4.7                | Baukran beschädigt                            | `case-baukran-beschaedigt`                             | technical      | construction |
| 4.8                | Baukran droht umzustürzen                     | `case-baukran-droht-umzustuerzen`                      | technical      | residential  |
| 4.9                | Gerüst eingestürzt                            | `case-geruest-eingestuerzt`                            | collapse       | residential  |
| 4.10               | Person auf Gerüst                             | `case-person-auf-geruest`                              | technical      | construction |
| 4.11               | Person auf Dach                               | `case-person-auf-dach`                                 | technical      | residential  |
| 4.12               | Person in Schacht                             | `case-person-in-schacht`                               | technical      | construction |
| 4.13               | Person in Grube                               | `case-person-in-grube`                                 | technical      | construction |
| 4.14               | verschüttete Person                           | `case-verschuettete-person`                            | collapse       | street       |
| 4.15               | Gebäudeeinsturz                               | `case-gebaeudeeinsturz`                                | collapse       | residential  |
| 4.16               | Gebäudeteileinsturz                           | `case-gebaeudeteileinsturz`                            | collapse       | residential  |
| 4.17               | Decke eingestürzt                             | `case-decke-eingestuerzt`                              | collapse       | residential  |
| 4.18               | Wand eingestürzt                              | `case-wand-eingestuerzt`                               | collapse       | residential  |
| 4.19               | Fahrzeug unter Gebäudeteil                    | `case-fahrzeug-unter-gebaeudeteil`                     | collapse       | residential  |
| 4.20               | Baustellenunfall                              | `case-baustellenunfall`                                | technical      | construction |
| 4.21               | Maschinenunfall                               | `case-maschinenunfall`                                 | technical      | industrial   |
| 4.22               | Arbeitsunfall                                 | `case-arbeitsunfall`                                   | technical      | industrial   |
| 4.23               | Person eingeklemmt                            | `case-person-eingeklemmt`                              | technical      | street       |
| 4.24               | Person unter Fahrzeug                         | `case-person-unter-fahrzeug`                           | technical      | street       |
| 4.25               | Aufzug                                        | `case-aufzug`                                          | technical      | residential  |
| 4.26               | Türöffnung medizinischer Notfall              | `case-tueroeffnung-medizinischer-notfall`              | technical      | residential  |
| 4.27               | Türöffnung Polizei                            | `case-tueroeffnung-polizei`                            | technical      | residential  |
| 4.28               | Stromleitung beschädigt                       | `case-stromleitung-beschaedigt`                        | technical      | street       |
| 4.29               | technische Störung                            | `case-technische-stoerung`                             | technical      | street       |
| 5.1                | VU ohne Verletzte                             | `case-vu-ohne-verletzte`                               | traffic        | street       |
| 5.2                | VU mit Verletzten                             | `case-vu-mit-verletzten`                               | traffic        | street       |
| 5.3                | VU mit mehreren Verletzten                    | `case-vu-mit-mehreren-verletzten`                      | traffic        | street       |
| 5.4                | VU mit eingeklemmter Person                   | `case-vu-mit-eingeklemmter-person`                     | traffic        | street       |
| 5.5                | VU mit Feuer                                  | `case-vu-mit-feuer`                                    | traffic        | street       |
| 5.6                | VU mit auslaufenden Betriebsstoffen           | `case-vu-mit-auslaufenden-betriebsstoffen`             | traffic        | street       |
| 5.7                | Lkw-Unfall                                    | `case-lkw-unfall`                                      | traffic        | street       |
| 5.8                | Busunfall                                     | `case-busunfall`                                       | traffic        | street       |
| 5.9                | Motorradunfall                                | `case-motorradunfall`                                  | traffic        | street       |
| 5.10               | Fahrradunfall                                 | `case-fahrradunfall`                                   | traffic        | street       |
| 5.11               | Mehrfachunfall                                | `case-mehrfachunfall`                                  | traffic        | street       |
| 5.12               | Massenkarambolage                             | `case-massenkarambolage`                               | traffic        | street       |
| 5.13               | Fahrzeug im Graben                            | `case-fahrzeug-im-graben`                              | traffic        | street       |
| 5.14               | Fahrzeug im Wasser                            | `case-fahrzeug-im-wasser`                              | traffic        | water        |
| 5.15               | Fahrzeug gegen Gebäude                        | `case-fahrzeug-gegen-gebaeude`                         | traffic        | street       |
| 5.16               | Fahrzeug gegen Baum                           | `case-fahrzeug-gegen-baum`                             | traffic        | street       |
| 5.17               | Fahrzeug gegen Laterne                        | `case-fahrzeug-gegen-laterne`                          | traffic        | street       |
| 5.18               | Fahrzeug auf Bahnübergang                     | `case-fahrzeug-auf-bahnuebergang`                      | traffic        | rail         |
| 5.19               | Gefahrgutunfall Straße                        | `case-gefahrgutunfall-strasse`                         | traffic        | street       |
| 5.20               | Lkw verliert Ladung                           | `case-lkw-verliert-ladung`                             | traffic        | street       |
| 5.21               | Tankauflieger beschädigt                      | `case-tankauflieger-beschaedigt`                       | traffic        | street       |
| 6.1                | Gasgeruch                                     | `case-gasgeruch`                                       | hazmat         | residential  |
| 6.2                | Gasleck                                       | `case-gasleck`                                         | hazmat         | residential  |
| 6.3                | Gasflasche beschädigt                         | `case-gasflasche-beschaedigt`                          | hazmat         | street       |
| 6.4                | unbekannter Stoff                             | `case-unbekannter-stoff`                               | hazmat         | street       |
| 6.5                | Chemikalienleck                               | `case-chemikalienleck`                                 | hazmat         | industrial   |
| 6.6                | Chemikalienaustritt                           | `case-chemikalienaustritt`                             | hazmat         | industrial   |
| 6.7                | Gefahrgut-Lkw                                 | `case-gefahrgut-lkw`                                   | hazmat         | street       |
| 6.8                | Gefahrgut-Bahn                                | `case-gefahrgut-bahn`                                  | hazmat         | rail         |
| 6.9                | beschädigter Tank                             | `case-beschaedigter-tank`                              | hazmat         | industrial   |
| 6.10               | unbekannte Dämpfe                             | `case-unbekannte-daempfe`                              | hazmat         | street       |
| 6.11               | verdächtiger Behälter                         | `case-verdaechtiger-behaelter`                         | hazmat         | street       |
| 6.12               | kontaminierte Person                          | `case-kontaminierte-person`                            | hazmat         | street       |
| 6.13               | kontaminiertes Gebäude                        | `case-kontaminiertes-gebaeude`                         | hazmat         | residential  |
| 6.14               | Gefahrstoff auf Straße                        | `case-gefahrstoff-auf-strasse`                         | hazmat         | street       |
| 6.15               | Gefahrstoff in Betrieb                        | `case-gefahrstoff-in-betrieb`                          | hazmat         | industrial   |
| 6.16               | Dekontamination erforderlich                  | `case-dekontamination-erforderlich`                    | hazmat         | street       |
| 7.1                | Person im See                                 | `case-person-im-see`                                   | water-rescue   | water        |
| 7.2                | Person im Fluss                               | `case-person-im-fluss`                                 | water-rescue   | water        |
| 7.3                | Person im Wasser                              | `case-person-im-wasser`                                | water-rescue   | water        |
| 7.4                | Fahrzeug im Wasser                            | `case-fahrzeug-im-wasser`                              | water-rescue   | water        |
| 7.5                | gekentertes Boot                              | `case-gekentertes-boot`                                | water-rescue   | water        |
| 7.6                | Bootsunfall                                   | `case-bootsunfall`                                     | water-rescue   | water        |
| 7.7                | vermisster Schwimmer                          | `case-vermisster-schwimmer`                            | water-rescue   | water        |
| 7.8                | Eisunfall                                     | `case-eisunfall`                                       | water-rescue   | water        |
| 7.9                | Hochwasser Keller                             | `case-hochwasser-keller`                               | flood          | residential  |
| 7.10               | Hochwasser Straße                             | `case-hochwasser-strasse`                              | flood          | street       |
| 7.11               | Hochwasser Wohngebiet                         | `case-hochwasser-wohngebiet`                           | flood          | residential  |
| 7.12               | überschwemmtes Gebäude                        | `case-ueberschwemmtes-gebaeude`                        | flood          | residential  |
| 7.13               | Deichproblem                                  | `case-deichproblem`                                    | flood          | residential  |
| 7.14               | Baum durch Sturm                              | `case-baum-durch-sturm`                                | technical      | street       |
| 7.15               | Dachschaden durch Sturm                       | `case-dachschaden-durch-sturm`                         | technical      | residential  |
| 7.16               | Strommast durch Sturm                         | `case-strommast-durch-sturm`                           | technical      | street       |
| 7.17               | Feld-/Waldbrand                               | `case-feld-waldbrand`                                  | vegetation     | forest       |
| 7.18               | Vegetationsbrand                              | `case-vegetationsbrand`                                | vegetation     | field        |
| 8.1                | Bewusstlose Person                            | `case-bewusstlose-person`                              | medical        | residential  |
| 8.2                | Kreislaufproblem                              | `case-kreislaufproblem`                                | medical        | residential  |
| 8.3                | Atemnot                                       | `case-atemnot`                                         | medical        | residential  |
| 8.4                | Brustschmerz                                  | `case-brustschmerz`                                    | medical        | residential  |
| 8.5                | Schlaganfallverdacht                          | `case-schlaganfallverdacht`                            | medical        | residential  |
| 8.6                | Krampfanfall                                  | `case-krampfanfall`                                    | medical        | residential  |
| 8.7                | Sturz                                         | `case-sturz`                                           | medical        | residential  |
| 8.8                | schwerer Sturz                                | `case-schwerer-sturz`                                  | medical        | residential  |
| 8.9                | Kopfverletzung                                | `case-kopfverletzung`                                  | medical        | residential  |
| 8.10               | schwere Blutung                               | `case-schwere-blutung`                                 | medical        | residential  |
| 8.11               | starke Schmerzen                              | `case-starke-schmerzen`                                | medical        | residential  |
| 8.12               | allergische Reaktion                          | `case-allergische-reaktion`                            | medical        | residential  |
| 8.13               | schwere allergische Reaktion                  | `case-schwere-allergische-reaktion`                    | medical        | residential  |
| 8.14               | Vergiftung                                    | `case-vergiftung`                                      | medical        | residential  |
| 8.15               | Intoxikation                                  | `case-intoxikation`                                    | medical        | residential  |
| 8.16               | Unterkühlung                                  | `case-unterkuehlung`                                   | medical        | residential  |
| 8.17               | Überhitzung                                   | `case-ueberhitzung`                                    | medical        | residential  |
| 8.18               | Dehydrierung                                  | `case-dehydrierung`                                    | medical        | residential  |
| 8.19               | Verbrennung                                   | `case-verbrennung`                                     | medical        | residential  |
| 8.20               | Rauchgasexposition                            | `case-rauchgasexposition`                              | medical        | residential  |
| 8.21               | Ertrinkungsunfall                             | `case-ertrinkungsunfall`                               | medical        | water        |
| 8.22               | Badeunfall                                    | `case-badeunfall`                                      | medical        | water        |
| 8.23               | Arbeitsunfall                                 | `case-arbeitsunfall`                                   | medical        | industrial   |
| 8.24               | Sportunfall                                   | `case-sportunfall`                                     | medical        | public       |
| 8.25               | häuslicher Notfall                            | `case-haeuslicher-notfall`                             | medical        | residential  |
| 8.26               | Kindernotfall                                 | `case-kindernotfall`                                   | medical        | residential  |
| 8.27               | Säuglingsnotfall                              | `case-saeuglingsnotfall`                               | medical        | residential  |
| 8.28               | Schwangerschaftsnotfall                       | `case-schwangerschaftsnotfall`                         | medical        | residential  |
| 8.29               | Geburt                                        | `case-geburt`                                          | medical        | residential  |
| 8.30               | Reanimation                                   | `case-reanimation`                                     | medical        | residential  |
| 8.31               | mehrere Verletzte                             | `case-mehrere-verletzte`                               | medical        | residential  |
| 8.32               | MANV                                          | `case-manv`                                            | medical        | residential  |
| 8.33               | medizinischer Notfall in öffentlichem Gebäude | `case-medizinischer-notfall-in-oeffentlichem-gebaeude` | medical        | public       |
| 9.1                | Einbruch                                      | `case-einbruch`                                        | police         | residential  |
| 9.2                | Einbruchalarm                                 | `case-einbruchalarm`                                   | police         | residential  |
| 9.3                | Raub                                          | `case-raub`                                            | police         | street       |
| 9.4                | Diebstahl                                     | `case-diebstahl`                                       | police         | street       |
| 9.5                | Körperverletzung                              | `case-koerperverletzung`                               | police         | street       |
| 9.6                | Schlägerei                                    | `case-schlaegerei`                                     | police         | street       |
| 9.7                | Messerangriff                                 | `case-messerangriff`                                   | police         | street       |
| 9.8                | Bedrohung                                     | `case-bedrohung`                                       | police         | street       |
| 9.9                | häusliche Gewalt                              | `case-haeusliche-gewalt`                               | police         | residential  |
| 9.10               | vermisste Person                              | `case-vermisste-person`                                | police         | street       |
| 9.11               | vermisstes Kind                               | `case-vermisstes-kind`                                 | police         | residential  |
| 9.12               | Suizidandrohung                               | `case-suizidandrohung`                                 | police         | street       |
| 9.13               | gefährliche Person                            | `case-gefaehrliche-person`                             | police         | street       |
| 9.14               | bewaffnete Person                             | `case-bewaffnete-person`                               | police         | street       |
| 9.15               | Geisellage                                    | `case-geisellage`                                      | police         | street       |
| 9.16               | Amoklage                                      | `case-amoklage`                                        | police         | street       |
| 9.17               | Brandstiftung                                 | `case-brandstiftung`                                   | police         | street       |
| 9.18               | Sachbeschädigung                              | `case-sachbeschaedigung`                               | police         | street       |
| 9.19               | Fahrzeugflucht                                | `case-fahrzeugflucht`                                  | police         | street       |
| 9.20               | Verkehrskontrolle                             | `case-verkehrskontrolle`                               | police         | street       |
| 9.21               | größere Menschenansammlung                    | `case-groessere-menschenansammlung`                    | crowd          | public       |
| 9.22               | Absicherung                                   | `case-absicherung`                                     | crowd          | street       |
| 9.23               | Demonstration                                 | `case-demonstration`                                   | crowd          | public       |
| 9.24               | Veranstaltung                                 | `case-veranstaltung`                                   | crowd          | public       |
| 10.1               | schwere technische Bergung                    | `case-schwere-technische-bergung`                      | supply         | residential  |
| 10.2               | Überflutung                                   | `case-ueberflutung`                                    | flood          | residential  |
| 10.3               | Pumpeneinsatz                                 | `case-pumpeneinsatz`                                   | flood          | residential  |
| 10.4               | Stromversorgung                               | `case-stromversorgung`                                 | supply         | residential  |
| 10.5               | Beleuchtung                                   | `case-beleuchtung`                                     | supply         | residential  |
| 10.6               | Trümmer                                       | `case-truemmer`                                        | supply         | construction |
| 10.7               | Abstützung                                    | `case-abstuetzung`                                     | supply         | construction |
| 10.8               | Versorgung nach Stromausfall                  | `case-versorgung-nach-stromausfall`                    | supply         | residential  |
| 10.9               | Katastrophenschutz                            | `case-katastrophenschutz`                              | supply         | residential  |
| 10.10              | Großschadenslage                              | `case-grossschadenslage`                               | supply         | residential  |
