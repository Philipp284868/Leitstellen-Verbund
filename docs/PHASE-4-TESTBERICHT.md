# Prüfbericht Phase 4 – Version 2.10.0

Ausgangspunkt: `main` und `dev` auf Mergecommit `2a4ce808e0459f7e94ee869cfa890c1365bd1de8` (Phase 3). Keine vorhandenen lokalen Änderungen. Entwicklung auf dem vorgesehenen Branch `dev`; Übernahme erst nach vollständigem CI-Erfolg über den normalen Pull Request. Keine Produktionsbereitstellung.

## Lokal tatsächlich geprüft

| Prüfung | Ergebnis |
| --- | --- |
| Unveränderte Ausgangsregression unter Windows | 121 Tests in 17 Dateien bestanden |
| Typecheck und Lint nach Integration | Erfolgreich |
| Produktionsbuild mit Node 24 | Erfolgreich |
| Vollständige Windows-Vitest-Regressionssuite | 140 Tests in 18 Dateien bestanden |
| Neue Phase-4-Logik- und Integrationstests | 19 bestanden |
| Vollständige Edge-Browserregression | 27 Tests bestanden, einschließlich der drei neuen Phase-4-Abläufe |
| Sichtprüfung | Desktop- und Mobilaufnahmen tatsächlich betrachtet; Abstände des neuen Dialogbereichs anschließend angepasst |

Die Linux-spezifische AMP-Autostartprüfung ist im Windows-Vitest-Aufruf ausgeschlossen. Der separate Node-Prozesstestlauf wird für diesen Auftrag vollständig im Linux-CI ausgeführt; er wird hier nicht als erneut lokal unter Windows ausgeführt ausgegeben. Maßgeblich für den Merge ist der vollständige Linux-Lauf am exakten PR-Kopf einschließlich AMP-Setup bei `NODE_ENV=production`, Build, Typecheck, Lint, vollständiger Logik-/Prozesssuite sowie Chromium und Firefox. Der PR dokumentiert dessen tatsächliche Endzahlen, Commit und Lauf-URL.

## Neue automatisierte Abnahme

1. Großlage bleibt vor der Erkundung verborgen; alte Einsätze erhalten keine nachträglichen Pflichtabschnitte. Interne künftige Wellen werden nicht an Clients ausgeliefert.
2. Bereitstellung liefert keine operativen Fähigkeiten. Ein Fahrzeug kann nicht doppelt Abschnitte bedienen; Wiedereinsatz mit neuer Alarmierungskennung übernimmt keine alte Zuweisung.
3. Abschnitte benötigen echte funktionsfähige Kräfte und Einsatzleitung. Offene Abschnitte und fehlende Evakuierung verhindern vorzeitigen Abschluss.
4. Fehlender Löschwassernachschub verbraucht den Puffer und mindert die tatsächliche Löschleistung; passende Zuweisung stellt Versorgung wieder her.
5. MANV findet Patienten in begrenzten zeitlichen Wellen; Speichern und Weiterführen ergeben identische Zustände und Ereignisse.
6. Sichtung benötigt medizinische Kräfte und gesicherten Einsatzort. Klinikwunsch, Priorität und früher Transport sind wirksam; unbekannte fremde Klinik-IDs werden abgewiesen.
7. Ein vollständig disponierter Großbrand erreicht das Archiv und zahlt genau einmal.
8. Die Flächenlage erzeugt einzeln versetzte Meldungen, respektiert das Zweierlimit und archiviert ihren abgeschlossenen Zusammenhang.
9. Hochwasser sperrt reale Straßenkanten und gibt sie nach Beseitigung der Gefahren wieder frei.
10. Automatische Großlagen respektieren Flottenschwelle und Abklingzeit.
11. Der Server verhindert fremde und doppelte Großlagenaktionen; ein Neustart erhält den Zustand.
12. Migration 8→9 erhält beide Spielmodi und laufende Alarmierungen; die Sicherung enthält unverändert das alte Schema und dessen Daten.
13. Nachbarkräfte erhalten erst nach ausdrücklicher Zusage Zugang und bleiben bis zur autorisierten Zuweisung in Bereitstellung.
14. Vollständiger MANV mit elf Patienten: Nacherkundung, tatsächliche dynamische Versorgung, Sichtung, mehrfach eingesetzte RTW, Übergaben und einmaliger Abschluss. Auftretende Defekte werden über reguläre Reparaturaktionen bearbeitet.
15. Benannte Abschnittsleitung kann ausfallen beziehungsweise zurückgenommen und bewusst neu vergeben werden; Abschnittsfortschritt folgt dem tatsächlichen Zustand.
16. Aktive Großlage übersteht echte CLI-Sicherung/Wiederherstellung und setzt identisch fort.
17. Ein ausdrücklich zugesagter fremder RTW baut den Behandlungsabschnitt mit auf und beginnt den freigegebenen MANV-Transport vor Einsatzende. Ein laufender Patiententransport verhindert vorzeitigen Hilfeabbruch.
18. Offline-Aufholen erzeugt keine Meldungsflut. Das Patientenlimit lässt eine Nacherkundung kontrolliert enden und blockiert nicht dauerhaft den Einsatzabschluss.

19. Massenereignisse benötigen wirksame Besucherlenkung und weiterlaufende Evakuierung auch nach dem Aufbau ihres Abschnitts. Eine unterbrochene Evakuierung bleibt als Handlungsbedarf sichtbar.

## Browserabläufe

- Großbrand in der Oberfläche ausrufen, vier echte Fahrzeuge frei alarmieren, Abschnitte beauftragen, Fahrzeuge und Abschnittsleitung zuweisen, laufende Führung ansehen und vollständigen Abschluss samt Historie prüfen.
- MANV ausrufen, Sichtung und Klinikwunsch bestätigen, frühe Transporte freigeben, tatsächliche Fahrzeug-/Patientenbindung kontrollieren, Browser und Server neu starten und den Zustand erneut prüfen. Die Ankunftsvorbereitung dieses fokussierten Falls erfolgt im Fixture; der erste Fall prüft den realen Alarmierungs-/Anfahrtsweg.
- Hochwasserführung auf 390 × 844 Pixeln, zeitlich versetzte Folgeeinsätze und veränderbare Dispositionspriorität. Ein zweiter Browser mit unabhängiger Leitstelle erhält weder die Großlage noch eine automatische Unterstützungsanfrage.

Bei den ersten neuen Browserläufen passten zwei Testselektoren nicht zur tatsächlichen Oberfläche: Die Sichtungsfelder besitzen eindeutige zugängliche Namen, und mobil muss zuerst zur Einsatzliste gewechselt werden. Beides wurde im Test korrigiert; keine Produktionsprüfung wurde deaktiviert. Der erste CLI-Testaufruf wurde auf die tatsächlich erforderlichen Argumente `restore --file … --confirm` berichtigt. Anschließend bestanden die jeweiligen vollständigen neuen Prüfreihen.

Der erste Linux-CI-Lauf bestand 141 Logiktests, 16 Prozessprüfungen und 53 von 54 Browserabläufen, darunter alle sechs neuen Großlagenfälle. Ein bestehender Chromium-Test scheiterte vor seinem Ablauf mit `EADDRINUSE` an der bisherigen zufälligen Portauswahl. Der gemeinsame Browser-Testaufbau lässt freie Ports jetzt vom Betriebssystem auswählen und wiederholt ausschließlich eine mögliche Portbelegung zwischen Auswahl und Bindung. Testfehler selbst werden nicht wiederholt. Der zweite Linux-Lauf bestand wieder 141 Logik- und 16 Prozessprüfungen sowie 53 von 54 Browserabläufen. Ein anderer bestehender Test erwartete nach einem festen 61-Sekunden-Sprung zwingend den vorübergehenden Fahrstatus, obwohl eine kurze Anfahrt dann bereits beendet sein kann. Er schließt den zweiten Browser jetzt vor der weiteren Simulation und prüft den persistenten Ausrücknachweis samt FMS 3 sowie anschließend weiterhin Ankunft, Abschluss, Neustart und Wiederherstellung. Der abschließende vollständige CI-Lauf am korrigierten PR-Kopf ist im PR verlinkt.

## Technische Grenzen

Die fachlichen Spielvereinfachungen sind in [PHASE-4.md](PHASE-4.md) dokumentiert: logische Bereitstellung am vorhandenen Einsatzort, abstrakte Löschwassermengen, Evakuierungsgruppen, vorhandener Fahrzeugkatalog und begrenzte Ereigniswellen. Das bestehende Hauptbundle bleibt über 500 kB und erzeugt die bekannte Build-Warnung; der Build ist erfolgreich. Keine Simulation von Hochwassergeometrie oder realen klinischen Behandlungsvorgaben wird behauptet. Phase 5 bleibt weitere Roadmap.
