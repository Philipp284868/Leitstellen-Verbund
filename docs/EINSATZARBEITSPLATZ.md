# Notrufe, gemeinsame Einsatzlagen und Katastrophenbereitschaft

Dieser Ausbau schließt die nach Phase 0 benannten Folgethemen zusammen mit dem bereits umgesetzten [Funkarbeitsplatz](FUNK.md) ab. Die historischen Phasen 1–5 werden weiterverwendet. Das Spiel bleibt PC-Multiplayer mit Deutschlandkarte, serverseitiger Echtzeitsimulation und einer oberen Werkzeugleiste.

## Notrufarbeitsplatz

Das Telefon in der oberen Leiste und das konfigurierte Notruf-Tastenkürzel öffnen den Notrufarbeitsplatz. Die Liste bietet offene Gespräche, eigene Gespräche, ausstehende Rückrufe und alle Gespräche laufender Einsätze. Suche berücksichtigt ausschließlich bereits bekannte Angaben. Eigene aktive Gespräche stehen zuerst, danach gelten Priorität und Eingangszeit.

Das Gespräch lässt sich direkt annehmen, befragen, beruhigen, beenden oder bei bestehender Rückrufmöglichkeit erneut verbinden. Bereits erfragte Angaben stehen neben dem Gespräch. Eine bearbeitete Auswahl bleibt sichtbar, auch wenn sie gerade aus dem Filter für offene Gespräche fällt. Über **Einsatz und Disposition öffnen** geht es weiter zu AAO, freier Fahrzeugwahl, Alarmierung und dem bisherigen Einsatzablauf.

**Gespräch zur Übernahme freigeben** übergibt ein aktives Gespräch an die Warteschlange der eigenen Leitstelle. Ein berechtigter anderer Disponent kann es sofort annehmen. Gesprächsdauer, Angaben, bereits gestellte Fragen und noch laufende Antwortwartezeit bleiben erhalten. Ein angekündigter Abbruch bei hohem Stress wird dadurch nicht verschoben. Wer das Gespräch abgegeben hat, kann es nicht anschließend als vermeintlicher Bearbeiter beenden. Die bisherige Übernahme nach 60 Sekunden ohne Bearbeitung bleibt als Rückfallebene bestehen. Pro Disponent ist weiterhin nur ein aktives Gespräch möglich.

Notrufanzahl, zusätzliche Anrufer, Rückrufe und Erzeugungsabstände verwenden weiterhin das vorhandene Balancing. Der neue Arbeitsplatz erzeugt keine zusätzlichen Einsätze.

## Gemeinsame Einsatzlagen

**Funk → Gemeinsame Einsatzlagen** bündelt drei Ansichten:

- **Eigene Lage:** laufende Einsätze, Priorität, bisherige Dauer, zugeordnete eigene und autorisierte fremde Kräfte vor Ort beziehungsweise auf Anfahrt sowie offene Sprechwünsche. Ein Klick öffnet die Einsatzführung.
- **Lagebuch:** Arbeitsnotizen mit Bearbeiter und Serverzeit, gemeinsam sichtbar für alle berechtigten Disponenten derselben Leitstelle. Zuerst müssen Ort und Meldebild bekannt sein. Notizen mit bis zu 600 Zeichen werden als `SITUATION_NOTE` im vorhandenen Einsatzverlauf gespeichert und sind später im Archiv sichtbar. Sie ersetzen keine Alarmierungs- oder Einsatzbefehle. Entwürfe werden bei Navigation geschützt; bei Einsatzabschluss bleibt ein begonnener Entwurf zum Kopieren erhalten.
- **Gemeinsame Hilfe:** die bereits vorhandenen gezielten Unterstützungsanfragen mit tatsächlicher Zusage, Fahrzeugauswahl, Rückfrage, Nachrichtenverlauf und Beendigung. Abgeschlossene Anfragen können eingeblendet werden. Die Groß- und Flächenlagenansicht verwendet die vorhandene Übersicht und öffnet die bestehende Abschnittsführung.

Zwischen unabhängigen Leitstellen gibt es weiterhin keine automatische allgemeine Einsatzfreigabe. Eine Anfrage zeigt nur den vorgesehenen Ausschnitt; eine Zusage bindet tatsächlich verfügbare Fahrzeuge. Die fremde Einsatzleitung erhält weder das interne KatS-Protokoll einer Helferwache noch Zugriff auf ihre übrigen Ressourcen. Derselbe Lagebucheintrag oder Alarm wird bei Wiederholung derselben Aktions-ID nur einmal verarbeitet. Mitgliedschaft und Rechteentzug gelten für alle neuen Aktionen.

## KatS-Wachen und Katastrophenbereitschaft

**Funk → Katastrophenbereitschaft & KatS-Wachen** zeigt geeignete Standorte und die gemeinsame Mobilisierung. Die Einrichtung ist außerdem in den Wachendetails verfügbar.

1. Eine bestehende Feuerwehr-, Rettungsdienst- oder THW-Wache wählen oder über **Neuen Standort bauen** den bisherigen Bauprozess benutzen. Baupreis, Freischaltung und Standortprüfung bleiben bestehen.
2. Vorbereitungszeit zwischen einer und 30 Minuten festlegen; Vorgabe sind zehn Minuten. **Als KatS-Wache führen** bestätigt die Einordnung. Das ist ein Betriebsprofil auf dem vorhandenen Standort, kein zusätzlicher Gebäudekatalog mit kostenlos erzeugten Stellplätzen oder Fahrzeugen.
3. Eine oder mehrere KatS-Wachen auswählen und **Ausgewählte Wachen mobilisieren** bestätigen. Die Organisations- und Materialvorbereitung beginnt gleichzeitig für diese Standorte; unterschiedliche Vorbereitungszeiten bleiben möglich.
4. Der Server speichert den Fertigstellungstermin. Der Fortschritt bleibt nach Browser-Schließen, Wiederverbindung und Serverneustart erhalten. Wiederholte Mobilisierung verschiebt einen bereits laufenden Termin nicht.
5. Vor Ablauf sind die Fahrzeuge für freie Disposition, AAO und zugesagte Nachbarhilfe gesperrt. Danach gelten weiterhin Fahrzeugdefekte, Nachbereitung, FMS 6, passende Besatzung und alle bisherigen Ausrück- und Anfahrtsregeln. Insbesondere freiwillige Kräfte werden durch Mobilisierung nicht zur Wache teleportiert.
6. **Bereitschaft beenden** ist erst nach Rückkehr und Nachbereitung aller Fahrzeuge möglich. Das gilt für die komplette ausgewählte Gruppe: ein ungültiger Standort verhindert den gesamten Auftrag. Eine noch laufende Vorbereitung kann beendet werden, sofern keine Kräfte gebunden sind.
7. Nach Beendigung kann der Standort wieder als reguläre Wache geführt werden. Der Bereitschaftsverlauf bleibt dabei erhalten. Auch ein erneutes Einrichten löscht diesen Verlauf nicht.

Die letzten 200 Bereitschaftseinträge je Standort nennen Serverzeit, Bearbeiter und Vorgang. Es gibt keine zusätzlichen Guthabenbuchungen oder frei erzeugtes Personal. Die Vorbereitungszeit ist eine konfigurierbare Spielregel für organisatorische Bereitschaft; sie behauptet keinen tatsächlichen, für alle Bundesländer einheitlichen KatS-Ausrückstandard.

## Integration, Speicherung und Kompatibilität

- `CallConversation.tsx` ist die gemeinsame Gesprächskomponente für Notrufarbeitsplatz und Einsatzdetail. `CallDesk.tsx`, `SituationDesk.tsx` und `CivilProtection.tsx` liefern die neuen Ansichten. Die Navigation ist in `App.tsx`, `GameHud.tsx`, `Topbar.tsx`, `Resources.tsx` und `navigation.ts` verbunden.
- `simulation/calls.ts` ergänzt die kontrollierte Übergabe. `simulation/commands.ts` schreibt Lagenotizen über die vorhandene Ereignisverwaltung. Notizen und Übergaben sind in der Wissensfilterung ausdrücklich freigegeben; die verdeckte tatsächliche Lage bleibt verborgen.
- `simulation/civil-protection-schema.ts` und `simulation/civil-protection.ts` enthalten KatS-Zustand, strikte Aktionsschemata, Gruppenprüfung, Zeitfortschritt und Verlaufsführung. Die allgemeine Fahrzeugverfügbarkeit berücksichtigt den Zustand. `server/game.ts` nutzt die vorhandene SQLite-Transaktion, Identität und persistenten Aktionsbelege.
- `Building.civilProtection` ist ein optionales, streng validiertes JSON-Feld mit Einordnung, Vorbereitungsdauer, Zustand, Termin und Verlauf. Alte Gebäude ohne dieses Feld behalten ihr Verhalten. Es werden keine bestehenden Gebäude automatisch umgestellt. Konten, Geld, XP, Besitz, Karte, Routen und historische Einzelspielerstände bleiben erhalten.
- Keine SQL-Strukturänderung und keine neue SQL-Migrationsstufe: Datenbankversion 14 bleibt bestehen. Die neuen optionalen Gebäudedaten werden über den bisherigen validierten Spielstand gespeichert. Notruf- und Lagebuchereignisse verwenden die vorhandene Historie. Ein älterer Programmstand versteht neu eingerichtete KatS-Profile nicht; für ein Downgrade ist eine dazu passende frühere Sicherung erforderlich.
- Keine neue Abhängigkeit, kein neuer Port, kein neuer Dienst und keine neue Umgebungsvariable. Reguläres Update nach Sicherung über den bestehenden AMP-Prozess. Produktionsinstallation ist ein eigener Betreiber-Schritt.

## Prüfungen

Die neuen Regressionen stehen in `tests/operations-expansion.test.ts`, `tests/operations-expansion-server.test.ts` und `tests/e2e/operations-expansion.spec.ts`. Sie prüfen Vorbereitung und Terminbindung, AAO/Dispositionssperre, echte Besatzung, atomare Gruppenauswahl, Gesprächsübergabe und Antwortsperre, deterministische Fortsetzung, alte Spielstände, wiederholte Aktionen, HTTP/Socket-Wiederverbindung, Serverneustart, gezielte Nachbarhilfe, Rechteentzug und den Browserablauf bis zum persistenten Einsatzarchiv. Bestehende Dispositions-, Funk-, Großlagen- und Migrationsprüfungen bleiben aktiv. Die finalen Ausführungsergebnisse gehören zum jeweiligen Commit/CI-Lauf; diese Anleitung ersetzt keinen aktuellen Prüfbericht.
