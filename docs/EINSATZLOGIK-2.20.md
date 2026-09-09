# Einsatzlogik und Bedienung 2.20

Diese Überarbeitung erweitert den vorhandenen autoritativen PC-Multiplayer auf der Deutschlandkarte. Die einzige dauerhafte Bedienleiste bleibt oben. Bestehende Konten, Wachen, Guthaben, Fortschritt, Fahrten und Einsätze werden erhalten. Kein Produktionsupdate und kein Datenreset gehören zur Umsetzung.

## Bereitschaft, Rückfahrt und Störungen

Eine Rückfahrt ist kein Auftrag. Ein geeignet besetztes, leeres und bereites Fahrzeug lässt sich im Fuhrpark, in der freien Disposition und über AAO wieder einsetzen. Der Server vergibt eine neue Zuordnung, übernimmt den tatsächlich angebrochenen gerichteten Straßenabschnitt und ersetzt die alte Route. Ein bereits besetztes Fahrzeug erhält keine vollständige erneute Ausrückezeit. FMS 1 auf Rückfahrt, 3 beim Folgeauftrag und 2 nach Ankunft an der Wache folgen demselben tatsächlichen Zustand.

Patienten und betreute Fahrgäste zählen als Transportbindung; die eigene Besatzung nicht. Tatsächliche Übergabe, konkrete erforderliche Nachbereitung, fehlende geeignete Besatzung und Defekte bleiben Sperren. Ein leerer RTW ohne Nachbereitungsbedarf und ein nicht transportierender NEF sind deshalb ebenso alarmierbar wie ein Feuerwehrfahrzeug. Der Server berechnet diese Entscheidung erneut und vertraut keinem vom Client vorgegebenen Bereitschaftswert.

Gewöhnliche Defekte enden nach 30–150 Simulationssekunden automatisch. Ursache, Beginn, Reparaturende, aktuelle Fahrt und Patientenbindung bleiben gespeichert. Nach der Reparatur wird der passende Zustand hergestellt; fünf Minuten Schutz vor erneuter zufälliger Störung verhindern direkte Defektketten. Die bisherigen manuellen Reparaturaktionen bleiben für ältere Clients kompatibel, sind aber für den Spielablauf nicht erforderlich. [Konkrete Zeiten, Routing und Nachweise](RUECKFAHRT-STOERUNGEN-2.20.md).

## Notrufe und Wissen der Leitstelle

Alle Quellen neuer unabhängiger Einsätze einer Leitstelle teilen eine gespeicherte Frist. Der Einstieg verwendet eine Grundspanne von 300–480 Sekunden. Der Bestand eigener Fahrzeuge an fertiggestellten Wachen und die Zahl ihrer Standorte skalieren sie langsam; offene Gespräche, laufende Einsätze und aktuell nicht alarmierbare Fahrzeuge drosseln neue Erzeugung. Zusätzliche Anrufer verwenden eigene Mindestabstände innerhalb des bestehenden Ereignisses. Zusätzliche Tabs oder Mitglieder derselben Leitstelle erzeugen keine zusätzlichen Generatoren. Bereits bestehende Einsätze werden nicht entfernt. Verpasste Intervalle werden nach Neustart nicht nachgeholt.

Die Kategorien werden vor den Vorlagen gewichtet: technische Hilfe 50, Brand 18, Medizin 24, Polizei 5, Wasser 2, Sonstiges 1. Nur erfüllbare Kategorien nehmen teil; außergewöhnliche Lagen besitzen eine eigene seltene Ziehung. Diese Werte sind eine Spielentscheidung, keine behauptete offizielle Statistik. Die [reproduzierbare Vorher-/Nachhermessung](NOTRUFE-2.20.md) trennt Ereignisse, Anrufe, offene Vorgänge, Auslastung und XP.

Unbekannte Anrufe erscheinen als neutraler Telefonmarker. Erst Aussagen oder Lagemeldungen erlauben eine Einordnung. Die öffentliche Datenprojektion entfernt vorher die wahre Vorlage, Dynamik, Aufgaben, interne Meldedaten und Telemetrie; die Oberfläche erhält keine bloß versteckten Geheimdaten. Allgemeine Beobachtungen ersetzen vorweggenommene Diagnosen und Einsatznamen. Bestätigte Informationen bleiben auch neben widersprüchlichen Anruferaussagen erhalten.

## Fähigkeiten und dauerhafte Aufgaben

Notwendige Fähigkeiten werden getrennt von möglichen Fahrzeugkombinationen angezeigt. Eine neue AAO kann ohne Typvorgabe allein geeignete Löschfähigkeit anfordern. Explizite persönliche Typpräferenzen bleiben bestehen. TSF-W, TLF und HLF können geeignete einfache Brände jeweils allein abschließen; besonderer Wasser-, Spezialgeräte- oder Qualifikationsbedarf bleibt bindend. Die vorhandenen Katalogprofile entscheiden, keine geratenen Eigenschaften aus Fahrzeugnamen.

Die Aufgaben eines aktiven dynamischen Einsatzes besitzen eigenen gespeicherten Fortschritt und Abschluss. Unvereinbare Arbeiten derselben Crew erfolgen nacheinander. Abgeschlossene Brandbekämpfung wird durch einen späteren Fahrzeugabzug nicht zurückgesetzt. Tatsächlich vorhandene Restgefahren, Nachkontrolle, technische Aufgaben, Patientenversorgung, Transport und Großlagenabschnitte werden weiterhin geprüft. Der Aufgabenbalken zählt dauerhaft erledigte Aufgaben, beispielsweise 2 von 3; ein bereits voller alter Arbeitstimer überdeckt keine offene Restaufgabe. Abgeschlossene Aufgaben sind nicht automatisch gleichbedeutend mit einem abgeschlossenen Patiententransport oder Gesamteinsatz.

Im geöffneten Einsatz zeigt **Brandentwicklung** zwei getrennte Balken für Intensität und Löschfortschritt, einen Trend und den tatsächlichen Zustand. Vor Erkundung erscheint nur der bekannte Verdacht. Die Anzeige verwendet Serverwerte und respektiert reduzierte Bewegung. „Unter Kontrolle“ ist nicht „gelöscht“; Nacharbeiten bleiben benannt. [Fachliche Einzelheiten](FAEHIGKEITEN-BRANDAUFGABEN-2.20.md).

Unter **Anfahrt → Eingesetzte Fahrzeuge** gibt es **Zurückschicken** und eine gemeinsame Auswahl. Die Prüfung berücksichtigt alle ausgewählten Fahrzeuge zugleich, verbleibende Fähigkeiten, Patientenbindung und Abschnittsleitung. Bei echter Unterdeckung steht ein konkreter Grund am Fahrzeug. Überzählige Fahrzeuge können vor dem gesamten Einsatzabschluss zurückkehren. Nachbarhilfe und deren Beendigung verwenden dieselbe Bedarfsprüfung. Abziehen erzeugt keine Belohnung; der spätere tatsächliche Abschluss erhält Credits und XP genau einmal.

## Konsistente Kartenanzeige

Medizinische Einsätze bleiben grün mit Kreuz – auch ausgewählt, nach Statuswechsel, Wiederverbindung oder mit Priorität NOTFALL. Ein zusätzliches gelbes Ausrufezeichen kennzeichnet höchste Dringlichkeit. Brände sind rot, ungeklärte Anrufe neutral. Rein medizinische Gruppen bleiben grün; gemischte Gruppen zeigen ihre Zusammensetzung und lassen jedes Mitglied auswählen. Ein Brand mit Verletzten bleibt Brand und erhält eine zusätzliche medizinische Kennzeichnung. Legende, Einsatzliste und Detailkopf verwenden dieselbe Darstellung.

## Migration und geänderte Module

SQLite-Schema 13 und die vorhandenen Welt-/Datensatzkennungen bleiben unverändert. Es gibt keine neue Pflichtspalte und keinen Eingriff in Programm- oder Produktionsdatenordner.

- `Save.callPacing.version=1` wird beim ersten Simulationsschritt additiv initialisiert. Vorhandene Fristen und Vorgänge werden konservativ berücksichtigt; alte kurze Startfristen lösen keine Welle aus.
- `Mission.tasks.version=1` wird für aktive Dynamik idempotent ergänzt. Bestehender Arbeitsfortschritt und schon erledigte physische Gefahren werden übernommen. Statische Legacy-Einsätze bleiben im bisherigen Abschlussweg.
- Optionale Brandfelder speichern Trend, letzte Intensität und endgültigen Löschzeitpunkt. Eine bereits als erledigt gespeicherte Brandgefahr bleibt erledigt.
- Alte wartende Defekte verwenden ihren ursprünglichen Beginn zur einmaligen Bestimmung des automatischen Endes. Browserwechsel erzeugen keine neue Frist.
- Bestehende AAO-Typpräferenzen, Personalbindungen und laufende Transport-/Nachbereitungsaufgaben werden nicht überschrieben.

Die Kernänderungen liegen in `src/simulation/{availability,dispatch,traffic,faults,post-incident,pacing,incident-selection,call-observations,calls,incidents,hazards,fire,major-resources,mission-tasks,withdrawal}.ts`. `src/model.ts` und die passenden Schemas definieren optionale versionierte Zustände. `server/game.ts` und `server/aid.ts` prüfen Rechte und atomare Aktionen. Die Oberfläche nutzt `FireLiveStatus.tsx`, `IncidentUnits.tsx`, `mission-presentation.ts`, die vorhandenen Desk/HUD-Komponenten und `germany/game-markers.ts`. Gezielte Tests ergänzen die vorhandene Gesamtregression und den echten Browserablauf. [Tatsächlicher Abnahmebericht](EINSATZLOGIK-TESTBERICHT-2.20.md).

Dies bleibt ein Spielmodell. Wasser- und Arbeitsstärken sind keine litergenaue Löschphysik; Patienten- und Reparaturwerte sind keine realen medizinischen oder Werkstattangaben. Die Deutschlandabnahme beweist einen konkreten Ablauf auf echten lokalen Daten, keine Prüfung jeder deutschen Straße.
