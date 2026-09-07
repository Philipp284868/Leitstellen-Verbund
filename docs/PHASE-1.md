# Phase 1 – Leitstellenablauf in Version 2.7.0

Stand: 07.09.2026. Umsetzung im bestehenden Node-24-/React-/SQLite-Spiel. Die Master-Spezifikation bleibt die fachliche Roadmap; dieser Stand ergänzt die acht Phase-1-Module.

## Durchspielbarer Ablauf

**Notruf → Fragen → AAO oder freie Disposition → Alarmierung → Ausrücken/Anfahrt → FMS → erste Lagemeldung → Nachforderung → weitere Kräfte → Abschluss → Historie.**

- Die Seitenleiste enthält getrennte Notruf- und Funkwarteschlangen sowie Zugänge zu **AAO** und **FMS / Funkstatus**. Mobil liegt sie unter **Einsätze**.
- Neue Fälle verbergen Ort und tatsächliche Lage. Erst erfragte Angaben beziehungsweise die Erkundung werden freigegeben. Reguläre HTTP-Antworten, Socket-Snapshots und Exporte enthalten keine internen Szenariodaten und keinen Simulationsseed.
- Orts- und Meldebildabfrage genügen zur ersten Disposition. Weitere Fragen passen sich der Organisation an. Stress beeinflusst Antwortzeit und mögliche Abbrüche; Beruhigen verbessert die Informationsqualität und stabilisiert das Gespräch. Glaubwürdigkeit beeinflusst Aussagen über Betroffene. Widersprüche werden markiert. Gesprächszeit zählt verbundene Abschnitte, nicht die Pause bis zum Rückruf.
- Zusätzliche Anrufe werden demselben Ereignis zugeordnet. Ein abgebrochener, unvollständiger Anruf ohne Rückrufmöglichkeit erhält einen Folgeanruf. Bis zu vier Gespräche je Ereignis; kein zusätzlicher Einsatz durch Mehrfachanruf.
- AAO speichern Stichwort, Alarmstufe, Organisation, Typanzahlen, Zusatzfähigkeiten, Priorität und Alarmierungsart. Vorschläge berücksichtigen tatsächliche Bereitschaft, Besatzung und erreichbare Straßen-/Wasser-/Luftwege. Die Auswahl bleibt vor dem Alarm editierbar. Fehlbedarf wird angezeigt; ungeeignete Fahrzeuge werden nicht als ausreichend ausgegeben.
- **Nur DME / DME + Sirene / Wachalarm** haben 60 / 45 / 30 Sekunden Ausrückzeit. Diese Spielwerte erweitern die bestehende Anfahrtsberechnung. Die Wache kann ein Standardprofil erhalten; ein AAO- oder Einzelprofil überschreibt es. Eigene synthetisierte Effekte nutzen die bestehenden Lautstärke-, Tab- und Stummschaltungsregeln.
- FMS 0–9 besitzen das ausdrücklich spielbezogene Defaultprofil der Spezifikation. Definitionen sind leitstellenweit beziehungsweise pro Organisation überschreibbar. Historie, letzter Wechsel, Kanal und begründete manuelle Korrekturen bleiben gespeichert. FMS 0/5 ändern keine operative Fahrzeugbindung; FMS 6 verhindert eine neue Alarmierung. Transportziel und Übergabe erzeugen FMS 8 vor der Rückfahrt.
- Die erste angekommene Einheit meldet die Erkundung. Die Disposition übernimmt deren bestätigtes Meldebild. Fehlende Fähigkeiten erzeugen eine Nachforderung, die in derselben Fahrzeugauswahl disponiert wird. Sprechwünsche sind nach Dringlichkeit geordnet und werden durch Wiederholung nicht erneut geöffnet.
- Der Server führt Fahrten, Einsatzarbeit, Patienten und Belohnungen weiter. Eine noch nicht bearbeitete Lagemeldung wartet auf einen Disponenten. Abgeschlossene Fälle zeigen den chronologischen Verlauf unter **Einsatzarchiv → Verlauf ansehen**.

## Szenarien und Umfang

Der vorhandene Katalog mit 40 Einsatztypen bleibt bestehen; alle regulär neu erzeugten Fälle beginnen über den Notrufzugang. Die Datenprofile in `src/simulation/calls.ts` unterscheiden unter anderem gemeldeten Kleinbrand von tatsächlichem Pkw-, Wohnungs- oder Flächenbrand sowie medizinische Meldungen. Andere Katalogfälle verwenden die vorhandenen Anforderungen mit schrittweiser Informationsfreigabe.

Das reproduzierbare Abnahmeszenario meldet zunächst einen Kleinbrand. Ein HLF reicht für das vorläufige Bild, nach der Erkundung eines Flächenbrands fehlt Löschwasser und ein TLF wird nachgefordert. Diese gezielte Testvorbereitung erzeugt keine Fahrzeuge im produktiven Generator. Dort bleibt die Auswahl an den tatsächlich vorhandenen Fuhrpark und die Stufe gebunden. Höchstens zwei neue aktive Fälle, unregelmäßige Abstände von 90–210 echten Sekunden und die große bestehende Region bleiben unverändert.

Phase 2 bis 5 bleiben offen: vollständige Brand-/Gefahren-/Patienten-/Wetter-/Verkehrssimulation; Nachbarleitstellen-Anfragen; umfassendere Betriebs- und Ausbauwerkzeuge; erweiterte Auswertung, Replay und Audio-Polishing. Es wird nicht behauptet, der gesamte zusätzliche Master-Einsatzkatalog oder diese Engines seien fertig.

## Module und Autorität

| Bereich | Dateien |
| --- | --- |
| Strikte neue Zustände und Aktionen | `src/simulation/schema.ts`, `actions.ts`, `src/model.ts`, `server/actions.ts` |
| Gespräche und Szenariodaten | `src/simulation/calls.ts` |
| AAO, Auswahl, Alarmierung und Routenprüfung | `src/simulation/dispatch.ts`, `commands.ts` |
| Funkstatus, Sprechwünsche, Erkundung und Abschluss | `src/simulation/fms.ts`, `incidents.ts` |
| Reproduzierbare IDs und bestätigte Historieneinträge | `src/simulation/events.ts` |
| Bestehende Tick-/Transportintegration | `src/engine.ts`, `server/game.ts` |
| Mitgliedschaft und Zugriffsauflösung | `server/workspaces.ts`, `server/index.ts`, `src/store.ts` |
| Bedienung | `src/Desk.tsx`, `Desk.css`, `App.tsx`, bestehende Karte und Hilfe |
| Ereignisklänge | `src/audio/events.ts`, `synth.ts` |

Der Server entscheidet und speichert vor der Bestätigung. Aktionen bleiben an authentifiziertes Konto und Aktions-ID gebunden; Fingerprints verhindern eine andere Wiederverwendung. Dieselbe ID wirkt nur einmal. Eine zweite Alarmierung eines schon gebundenen Fahrzeugs wird auch mit anderer ID abgelehnt. Alle Fahrzeug- und Routenprüfungen erfolgen vor der Bindung; SQLite rollt fehlgeschlagene Aktionen vollständig zurück.

Simulation benutzt die vorhandene deterministische Seed-Folge und einen persistenten Sequenzzähler für Ereignis-/Objekt-IDs. Gleicher Zustand, Seed, Zeitpunkt und Aktionen liefern denselben Verlauf. Konto-/Sitzungsgeheimnisse bleiben kryptografisch zufällig und sind davon getrennt.

## Schema 6 und alte Spielstände

Vor dem ersten Start gegen eine ältere Datenbank wird eine vollständige konsistente Sicherung im bisherigen kompatiblen Namensschema `pre-migration-v2-…sqlite` erzeugt. Schema 6 ergänzt `desk_members` und `desk_invites` sowie die strukturierten Zustände in beiden Spielstandtabellen.

Alte aktive und abgeschlossene Einsätze werden als bekannte Altfälle übernommen. Vorhandene IDs, Besitz, Guthaben, Fortschritt, Fahrzeugbindungen, Fahrwege und Termine bleiben erhalten. Ein Migrationshinweis ersetzt keine erfundene frühere Gesprächshistorie. Bestehende nichtleere Alarmierungsvorlagen werden zusätzlich als AAO übernommen. FMS wird aus dem tatsächlichen Fahrzeugzustand initialisiert.

Alte Freigaben ohne bereits zugeordnetes fremdes Fahrzeug werden geschlossen. Bereits laufende fremde Unterstützung einschließlich Transport und Abrechnung bleibt erhalten. **Neue Fälle werden nicht an unabhängige Leitstellen freigegeben.** Berechtigte gemeinsame Disposition benötigt eine angenommene Leitstelleneinladung; siehe [Multiplayer](MULTIPLAYER.md).

SQLite-Backup und CLI-Restore erhalten die neuen Zustände einschließlich Mitgliedschaften. Der bisherige ausdrücklich bestätigte Offline-Altimport übernimmt weiterhin nur den Bestand und verwirft aktive Vorgänge; seine Funkstatusdaten werden passend zum neu zugeordneten Bestand initialisiert. Ein normaler Kontoexport ist eine freigegebene Ansicht und ersetzt keine vollständige SQLite-Sicherung.

## Betriebsgrenzen

- Bestehende Begrenzung auf 500 archivierte Fälle; je Fahrzeug werden die letzten 2.000 FMS-Einträge vorgehalten. Fallhistorien bleiben innerhalb des jeweiligen archivierten Falls erhalten. Für längerfristige Aufbewahrung dienen die SQLite-Sicherungen.
- Pro Fall höchstens 20.000 Historieneinträge; neue manuelle Vorgänge werden vor Erreichen der Grenze begrenzt, damit Raum für automatische Abschlussereignisse bleibt. Einträge sind auf 600 Zeichen begrenzt, vollständige aktuelle Anforderungen stehen separat im Dispositionszustand.
- Maximal 30 AAO mit jeweils höchstens 30 angeforderten Fahrzeugen; maximal acht Disponenten je Leitstelle. Ein Konto ist gleichzeitig Mitglied höchstens einer fremden Leitstelle. Seine privaten Einzelspieler- und bisherigen Multiplayerbestände bleiben separat gespeichert.
- Eine SQLite-/Node-Instanz bleibt maßgeblich. Der vorhandene Lasttest mit 100 Wachen, 300 Fahrzeugen und 50 Fällen ist kein Nachweis unbegrenzter Mehrbenutzerlast.
- Es gibt keine automatische AMP-Produktionsbereitstellung. Das Update benötigt keine neuen Umgebungsvariablen. Server stoppen, sichern, main aktualisieren, reguläres Setup/Build abwarten und starten. Kein älteres Programm gegen Schema 6 starten.

## Abnahme

Die Tests `tests/phase-one.test.ts`, `phase-http.test.ts` und `e2e/phase-one.spec.ts` ergänzen die vorhandene Abnahme. Sie prüfen den vollständigen HLF-/Nachforderungsablauf, freie Disposition, AAO/FMS-Konfiguration, Patiententransport, Gesprächsabbruch und -übernahme, widersprüchliche Angaben, doppelte Aktionen, Mitgliedschaft/Rechteentzug, API-/Socket-/Export-Abgrenzung, Migration, laufende Zustände nach Neustart und deterministische Wiederholung. Der gemeinsame Browserablauf prüft zusätzlich eine tatsächliche CLI-Wiederherstellung.

Auszuführende Repository-Befehle: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm test:e2e`. Die Linux-CI prüft das AMP-Setup bei `NODE_ENV=production`, Prozessstopp/Restore und Chromium/Firefox. Lokale Windows-Browserabnahme erfolgt mit Edge über `PW_EDGE=1`; Linux-Prozesstests werden nicht als lokal unter Windows bestanden ausgegeben. Die konkreten Ergebnisse und der geprüfte Commit stehen im PR beziehungsweise Abschlussbericht.
