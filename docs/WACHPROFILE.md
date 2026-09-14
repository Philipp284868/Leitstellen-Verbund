# Standortgebundene Wachprofile – Daten und Migration 29

Die Spielwerte, Preise und Bedienung stehen in der maßgeblichen [Spielerhilfe](wiki/Wachen-und-Personal.md). Personalstärken, Stellplätze und Ausrückvorbereitung sind ausdrücklich Spielwerte. Reale Organisationsform, Besetzungsform, Quellen und Aktualitätsstand stehen getrennt im Standortprofil. Ein Name allein, Gebäudefläche oder Einwohnerzahl erzeugt keine Typzuordnung.

## Tatsächliche Datenabdeckung

Das vorbereitete OSM-Zusatzprofil wurde aus dem bereits vorhandenen Deutschland-Datenstand **07.09.2026** erzeugt. Quellhash: `c0fd971d9e6b75116e2ecb7fe70bc74da9a8cf6ee461b73d3a89d47c89914529`. Von **29.099 Quellobjekten** sind anhand übereinstimmender Typtags und Einheits-/Betreiberangaben **334 als FF und 4 als BF** klassifiziert. **28.761 bleiben ungeklärt.** Diese Zahlen zählen OSM-Quellobjekte vor kanonischer Zusammenführung, keine behauptete Vollerhebung deutscher Wachen.

| Bundeslandkennung | FF-Quellobjekte | BF-Quellobjekte | Ungeklärt |
| --- | ---: | ---: | ---: |
| DE-BB | 40 | 0 | 1.498 |
| DE-BE | 3 | 3 | 93 |
| DE-BW | 36 | 1 | 2.777 |
| DE-BY | 37 | 0 | 6.606 |
| DE-HB | 2 | 0 | 34 |
| DE-HE | 4 | 0 | 2.312 |
| DE-HH | 0 | 0 | 116 |
| DE-MV | 1 | 0 | 878 |
| DE-NI | 99 | 0 | 3.351 |
| DE-NW | 28 | 0 | 2.672 |
| DE-RP | 3 | 0 | 2.169 |
| DE-SH | 7 | 0 | 1.392 |
| DE-SL | 72 | 0 | 240 |
| DE-SN | 1 | 0 | 1.740 |
| DE-ST | 0 | 0 | 1.313 |
| DE-TH | 1 | 0 | 1.570 |

Zusätzlich enthält der versionierte Ergänzungskatalog sechs einzeln belegte Profile, Prüfstand 14.09.2026:

- [FF Heiligensee](https://www.berliner-feuerwehr.de/ueber-uns/standorte/freiwillige-feuerwehr-heiligensee/): ehrenamtliche FF.
- [Feuerwache Wittenau](https://www.berliner-feuerwehr.de/ueber-uns/standorte/feuerwache-wittenau/) und [FF Wittenau](https://www.berliner-feuerwehr.de/ueber-uns/standorte/freiwillige-feuerwehr-wittenau/): ausdrücklich gemeinsam untergebracht, ein kanonisches Wachobjekt mit BF-/FF-Einheiten.
- [Feuerwache Wedding](https://www.berliner-feuerwehr.de/ueber-uns/standorte/feuerwache-wedding/): BF. Eine betreute FF wird dadurch nicht automatisch Teil desselben Gebäudes.
- [Feuerwehr Kerpen](https://www.feuerwehr-kerpen.de/feuerwehr-kerpen/) und [Einheiten](https://www.feuerwehr-kerpen.de/einheiten/): FF mit hauptamtlichem Abmarsch; keine BF. Benachbartes eigenständiges Löschzugobjekt bleibt getrennt.
- [BASF Werkfeuerwehr](https://www.basf.com/global/de/who-we-are/organization/locations/europe/german-sites/ludwigshafen/the-site/environment-and-safety/fire-department): Feuerwache Ost, hauptberufliche Werkfeuerwehr.
- [Flughafenbetreiber BER](https://corporate.berlin-airport.de/de/jobs-karriere/arbeiten-am-ber/was-macht-eigentlich.html): Flughafenfeuerwehr, Wache West. Historische Inbetriebnahme und aktuelle Organisationsbeschreibung sind getrennte Belege.

Diese Korrekturen überlagern gezielt Quellkennungen. Sie machen aus den übrigen ungeklärten Standorten keine erfundenen FF/BF. Betriebsfeuerwehr wird als unterstütztes Profil korrekt unterschieden, hat im derzeitigen amtlichen Ergänzungskatalog aber noch keinen einzeln bestätigten Standort. Neue typspezifische Käufe ungeklärter Standorte bleiben gezielt gesperrt; Eigentum, Altbetrieb und die übrige Installation bleiben nutzbar. Die deutschlandweite Einstiegssuche zeigt frei erwerbbare belegte FF und bietet andere Orte an, wenn der Wunschort keinen geeigneten freien Standort hat.

## Persistenz und Abwicklung

Schema 29 ergänzt Wachprofile, unveränderliche Kaufbelege sowie Ergebnis- und Rückkehraufträge. Vor jeder erforderlichen Fachmigration wird die Datenbank konsistent gesichert. Die SQL-Version allein gilt nicht als abgeschlossene Fachmigration: Der Starter kann SQL 29 vor dem ersten Spielstart anwenden; ein separater Inhaltsfingerabdruck stellt dann trotzdem die gesicherte Katalogmigration sicher. Künftige Ergänzungskataloge lösen gezielt eine neue Profilprüfung aus.

Aktive Besatzungen, Transporte und Nachbereitung werden nicht umgestellt. Die neue Besetzung wird nach der sicheren Rückkehr angewendet. Personenkennungen, Qualifikationen, Geld, XP, bezahlte Kapazität und historische Kaufbelege bleiben erhalten; aus alten größeren Personalbeständen entsteht keine unbegrenzte BF-Schicht.

Belegte gemeinsame Immobilien erhalten eine gemeinsame Identität. Bei beweisbarer Reihenfolge gilt der erste Kaufbeleg; eine doppelt bezahlte spätere Immobilie wird gezielt genau einmal zum historischen Belegwert erstattet und deren Personal/Fahrzeuge erhalten. Mehrdeutige Altbelege bleiben erhalten und sperren nur das betroffene neue Kaufangebot, bis der Betreiber den Konflikt klärt. Es gibt keine Erstattung allein wegen einer geänderten FF-/BF-Preistabelle.

Erfolg, endgültig unerreichbares zwingendes Rettungsziel und ausdrückliche Aufgabe werden getrennt archiviert. Technische Störungen sind kein spielerischer Fehlschlag. Eine externe Szenenabwicklung benötigt 180 Sekunden Ankunft und 480 Sekunden bis zur Übernahme ab Auftrag; das sind zentrale Spielwerte. Bereits eingeladene Patienten werden regulär zur Klinik gebracht. Externe Szenenübernahme ist keine Kliniklieferung und erzeugt keine Erfolgsvergütung.
