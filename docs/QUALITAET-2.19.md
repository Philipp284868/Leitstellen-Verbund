# Qualitätsüberarbeitung 2.19

Die Überarbeitung verbindet die vorhandene Deutschlandkarte mit einer einzigen oberen Bedienleiste, einem gemeinsamen Vektor-Symbolsystem und einer eigenständigen öffentlichen Spielerpräsenz. Die bestehende Serverarchitektur bleibt erhalten. Der fachliche Audit unterscheidet bestätigte Fehler, funktionierende Bestandsfunktionen und bewusst abstrahierte Spielregeln. Dies ist keine Behauptung einer realitätsgetreuen Einsatzleitsoftware.

## Systemübersicht und Integration

| System | Bestehende Funktion, Zuständigkeit und Speicherung | Bestätigtes Problem / Umsetzung | Prüfung |
|---|---|---|---|
| Notruf und Informationsgewinn | `simulation/calls.ts`, `incidents.ts`; `Desk.tsx`; Gespräche und Quellen im SQLite-Spielstand | Nachträgliche unbestätigte Anrufermeldung konnte bestätigte Lage überschreiben; korrigiert. Gesprächskennzahlen in zusätzlichen Details. | Simulationsqualität, Phase 1 und 2, Browserablauf |
| Einsatzgenerator und Entwicklung | `engine.ts`, `incident-location.ts`, `dynamics.ts`, `major-incidents.ts`; Seed, Eskalationen und Folgeereignisse persistent | Initiale Patientenbedarfe und Folgeereignisse teilweise nicht erfüllbar; gemeinsame Machbarkeitsprüfung. Ungeklärte Lage bleibt unbekannt. | Katalog, Fortschritt, Phase 1–5, Determinismus |
| AAO / freie Disposition | `dispatch.ts`, `staffing.ts`, `availability.ts`; serverseitige Aktion, AAO im Leitstellenprofil | Gemeinsame FF-Poolkräfte konnten mehrfach verplant werden; reiner Auswahl-Allocator und erneute Prüfung vor Mutation. | Neue Crewfälle und bestehende Verfügbarkeits-/Sicherheitstests |
| Alarmierung / Ausrücken | `volunteers.ts`, `fms.ts`, `engine.ts`; Person-/Fahrzeugbindungen und Termine gespeichert | Exakte Abfahrtsgrenze ergänzt; Funk, Fahrt und Marker verwenden denselben Zeitpunkt. NPC-Gesamtzahlen entfernt, notwendige Verwaltung in Wache/Fahrzeug. | FF-/FMS-/Fahrt- und Browserfälle |
| Routing / ETA | `server/germany`, `traffic.ts`, `motion.ts`, `travel.ts`; GraphHopper-Straßengeometrie im Auftrag gespeichert | Vorhandenes abschnittsbezogenes Modell bleibt; keine neue direkte Ersatzfahrt oder pauschale Minuten-pro-km. | Deutschland-Routing, Bewegung, realer lokaler Router |
| Funk / Nachforderungen | `incidents.ts`, `NeighborDesk.tsx`, Serveraktionen und persistente Anfragen | Erste Lagemeldung muss ausdrücklich aufgenommen werden. Andere Funkaktionen können sie nicht mehr unbeabsichtigt bestätigen. | Doppelte Aktionen, gezielte Unterstützung, offline Helfer und Neustart |
| Patienten / Klinik / Transport | `patients.ts`, `hospitals.ts`, `hospital-profiles.ts`; Patienten, Reservierungen, Betten und Fahrten persistent | Geografische Kliniken waren pauschal universal geeignet; jetzt stabile, benannte Spielprofile mit unterschiedlichen Fachbereichen/Kapazitäten. | Fachbereiche, Intensiv-/Verbrennung, Kapazität, Transport und bestehende Belegung |
| Einsatzabschluss / Nachbereitung | `dynamics.ts`, `engine.ts`, `post-incident.ts`, `responder-recovery.ts` | Neue offene Gefahren/Organisationsaufgaben konnten in Transportphase übergangen werden; unmittelbare Abschlussprüfung. | Kein vorzeitiger/doppelter Abschluss, Rückfahrt und Wiederverfügbarkeit |
| Wetter / Verkehr | `weather.ts`, `traffic.ts`, `EnvironmentPanel`; reproduzierbarer Umweltzustand | Funktionierendes Spielmodell beibehalten; kompakter Uhrhinweis und Details unter Karte. Keine Live-Wetterbehauptung. | Umwelt-/Routing-/Fahrtenregressionen |
| Gebäude / Fahrzeugkatalog | `catalog`, `Resources.tsx`, `Organizations.tsx`; IDs, Ausbau und Besatzung persistent | Zentrale explizite Icons aller 50 Typen; kontextbezogene Besatzungsverwaltung, einheitliche Inline-Bestätigung/Umbenennung, paginierter Fuhrpark. | Vollständiges Mapping, UI-Formulare und Bestandsschutz |
| Credits / XP / Level | `progression.ts`, `engine.ts`, `reports.ts`; getrennte Werte und persistente Belohnungsquittungen | Bestehende Stufen über 10 und serverseitige Freischaltungen beibehalten; Abschlussfehler korrigiert statt neue Belohnungsmultiplikatoren einzuführen. | Fortschritt, genau eine Auszahlung, Wiederholung und Archiv |
| Mehrspieler / Rollen | `server/game.ts`, `server/index.ts`, `auth.ts`; SQLite-Konten, Mitgliedschaft, Sitzungen | Neues enges Präsenz-DTO. Alle öffentlichen Serverwelt-Spieler sind auffindbar; Rechte und private Einsätze bleiben getrennt. | Zwei Konten, gemeinsame Leitstelle, 35-Spieler-Liste, Tabs, Grace, Widerruf, Aktionen |
| Speichern / Wiederverbinden | `database.ts`, `store.ts`, `network.ts`; Schema 13, Revisionen und Aktionsquittungen | Präsenz separat von privatem Spielstand; Authentifizierung wird auch bei pausierter Simulation bereinigt. | Migrationen, Wiederanlauf, Restore, Logout und Reconnect |
| HUD / Dialoge / Karte | `Topbar.tsx`, `GameHud.tsx`, `ui.tsx`, `Hud.css`; lokale Arbeitsplatz-/Kameraeinstellungen | Untere Toolbar inklusive Komponenten und Styles entfernt; 62px-Topbar, initial geschlossene Arbeitsbereiche, gemeinsame Fokus-/Escape-Logik. | Desktopgrößen, Scroll-/Pointer-/Tastaturtests, tatsächliche Aufnahmen |
| Geografische Einrichtungen | `poi-index.ts`, `poi-layer.ts`, `poi-data.ts`; unveränderte Geodaten, flüchtiger Ausschnittcache | Echte POIs, räumliche Aggregate, Kategorien, Deduplizierung und gezielter Index. Eigenes Kartenbudget verhindert API-Sperren durch Schwenken. | Echte Datenabfragen, Symbol-/POI-Tests, HTTP-Budgettrennung und Messungen |

Die ausführlichen fachlichen Korrekturen und Spielabstraktionen stehen in [QUALITAET-SIMULATION.md](QUALITAET-SIMULATION.md). [QUALITAET-KARTENSYMBOLE.md](QUALITAET-KARTENSYMBOLE.md) enthält jede Katalog-ID, Kategorien, tatsächliche Datenabdeckung und Leistungsmessungen. [QUALITAET-PRAESENZ.md](QUALITAET-PRAESENZ.md) beschreibt den vollständigen öffentlichen Datenumfang und die Rechteprüfungen.

## Bisherige untere Funktionen und neue Bedienwege

| Bisher | Neuer Zugang |
|---|---|
| Karte / Layer | **Karte** oben: Ortssuche, Filter, Beschriftung, Fahrwege, POI-Kategorien, Spielerstandorte, Legende, Zoom, Steuerung, Wetter und Betrieb |
| Fahrzeuge | **Fahrzeuge** oben: Such-/Favoritenliste, Typicon, FMS, Verfügbarkeit und konkrete Sperrgründe. Besatzungsdetails pro Fahrzeug aufklappen. |
| Personal | Globaler Menüpunkt entfällt. **Gebäude → Wache → Besatzung & Ausbildung** und Fahrzeugdetails enthalten notwendige Verwaltungsaktionen. |
| Gebäude | **Gebäude** oben: Wachenliste, Bau, Ausbau, Erweiterungen und Beschaffung |
| Alarmieren | Einsatz auswählen → **Fahrzeuge → Alarmieren**; Auswahl/AAO und echte Verfügbarkeit bestimmen den Auftrag. |
| Funk | **Funk → Sprechwünsche** führt direkt zum nächsten offenen Sprechwunsch. |
| Verbund | **Funk → Verbund & Leitstellenfunk**; Zähler schließt offene Hilfsanfragen ein. |
| Einsatzprotokoll | Gewählter Einsatz → **Protokoll**; Bericht und Verlauf bleiben kopier- und exportierbar. |
| Globales Archiv | **Einsätze → Archiv** |
| AAO | **Einsätze → AAO**; gespeicherte Regeln im Einsatz auswählbar |
| Suche | Lupe oben öffnet und fokussiert die Kartensuche. Fuhrpark, Archiv und Spieler besitzen kontextbezogene Suche. |
| Stumm / Audio | **Einstellungen → Audio**; vorhandene Tastenkürzel und gespeicherte Audiowerte bleiben wirksam. |
| Einstellungen / Hilfe | Zahnrad oben; **Hilfe** im Einstellungsbereich oder Hauptmenü |
| Fortschritt / Profil | Kompaktes Stufensymbol oben rechts; Konto und Abmeldung unter Einstellungen |

Die Hauptleiste ist die einzige dauerhafte globale Navigation. Karte reicht von y=62 bis zum unteren Bildschirmrand. Maßstab und Attribution bleiben dezent sichtbar. Meldungen erscheinen kurzzeitig oben und können geschlossen werden; Verbindungsfehler bleiben erkennbar. Kritische Gefahren, verletzte Einsatzkräfte und Sperrgründe werden nicht mit allgemeinen Personalzahlen entfernt.

## Daten und fachliche Grenzen

- Keine neue SQLite-Schemaversion, keine Weltkonvertierung und kein Datenreset. Konten, Fahrzeuge, Personal, XP, Credits, Freischaltungen, Fahrten und Historien behalten ihre IDs.
- Die Deutschlandwelt bleibt geografische Grundlage. Der separate frühere Servereinstieg wird ausschließlich aus Bestandsschutz weiter gebaut und geprüft; es gibt keinen Kartenumschalter in der produktiven Deutschlandoberfläche.
- Öffentliche Anwesenheit umfasst Spielnamen, zugeordnete Leitstelle, Verbindungszustand und optional den zugeordneten Wachenstandort. Keine IP-Ortung oder Geräte-Geolokalisierung; kein erfundener Standort für neue Konten.
- Geografische Einrichtungen stammen aus dem installierten OSM-Datenstand. Der vorhandene Paketindex enthält 37.622 Feuerwachen, Polizeiwachen und Kliniken; weitere Kategorien stammen aus geladenen Vektorkacheln. Rettungswachen/THW sind im konkreten Paket nicht flächendeckend als eigene POI-Klasse enthalten. Fehlende Daten werden nicht durch erfundene Standorte ersetzt.
- Klinikfähigkeiten, Betten, Patientenwerte, Wetter, Verkehr und Einsatzregeln sind ausdrücklich Spielsimulation. Die Überarbeitung führt keine neuen angeblich deutschlandweit verbindlichen Fachwerte oder regionalen Vorschriften ein.
- Konfigurierte FMS-Definitionen und notwendige Besatzungsregeln bleiben wirksam. Ein günstiger angezeigter FMS-Code umgeht keine technische oder personelle Sperre.
- Vorhandene Phase-1–5-Systeme bleiben umgesetzt; echte Live-Leitstellenanbindung, Live-Klinikbetten, Avatar-Geolokalisierung und eine universelle medizinische Simulation werden weder hinzugefügt noch als vorhanden dargestellt.

## Prüfnachweis

Der abschließende Bericht [QUALITAET-TESTBERICHT.md](QUALITAET-TESTBERICHT.md) trennt lokale Windows-Ergebnisse, echte Deutschland-/Router-Abnahme, Browsermessungen und Linux-CI. Er nennt auch Fehlversuche und Plattformgrenzen. Die Bildschirmaufnahmen stammen aus der gestarteten Anwendung mit isolierten Testkonten und tatsächlichen lokalen Deutschlanddaten; sie sind keine Entwürfe oder Fotomontagen.

Der ursprüngliche Master-Auftrag unter Downloads war nicht mehr vorhanden. Für den Audit wurden der aktuelle vollständige Qualitätsauftrag, die tatsächlichen Module und die vorhandenen Phase-1–5-Spezifikationen des Repositorys herangezogen.
