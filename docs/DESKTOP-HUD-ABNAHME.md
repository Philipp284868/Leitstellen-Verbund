# Helles Desktop-HUD · 2.27.0

## Umfang und Referenz

Der Auftrag vom 13.09.2026 wird im bestehenden Deutschland-Spiel umgesetzt. Die aktuelle Anlage enthält ausschließlich den Textauftrag. Das darin erwähnte zuletzt bestätigte **helle Referenzbild fehlt**. Deshalb wurde nach dessen ausführlichen Positions-, Größen-, Farb- und Bedienvorgaben gearbeitet; ein abschließender Bildabgleich oder Pixelgleichheit wird nicht behauptet. Frühere dunkle Entwürfe sind keine Ersatzreferenz.

Es gibt im aktuellen Fortschrittsmodell keine tatsächliche Rangbezeichnung. Die gemeinsame Kachel heißt deshalb neutral **Fortschritt**, verwendet Level und Stufen-XP der bestehenden Fortschrittsfunktion und erfindet keinen Rang. Serverzeit, simuliertes Wetter und Eurobeträge stammen aus dem autorisierten Spielstand.

## Komponenten und Bedienung

- `src/client/HudNavigation.tsx`: geschlossen startendes Menü, vorgegebene Reihenfolge, Tastatur, Fokus-Rückgabe und abfangender Außenklick. Unterfunktionen bleiben über die bestehenden Dialoge erreichbar.
- `src/client/Topbar.tsx`: vier Statuskarten; Wetter mit Weltlage und Zugang zur Katastrophenbereitschaft. Keine weitere Dauerkachel und kein zusätzlicher Abruf.
- `src/client/CompactDesk.tsx`: genau zwei Reiter, Textfunk mit stabilen Ereignis-IDs, Filter, Suche, offene/ kritische Hinweise, vollständiger Verlauf und seitenweise Einsatzliste. Notrufe bleiben ungeklärt, bis die vorhandene Abfrage Informationen liefert. Bestehende Dringlichkeitsfarben und Großlagenkennzeichnung bleiben sichtbar.
- `src/client/GameHud.tsx` und `App.tsx`: eine aktive HUD-Struktur, bestehende Einsatzbearbeitung links, Anbindung aller Menüziele und Kartenwerkzeuge. Besitzer-/Generationswechsel erzeugt einen neuen HUD-Kontext. Menü- und Reiterwechsel behalten die Karte.
- `src/client/DesktopHud.css`: helle Oberflächen, kompakte Vorschau, schwebende Kartenwerkzeuge und lesbare Unterdialoge. Ersetzte Leisten-/Listenregeln wurden aus `Hud.css` und `ControlRoom.css` entfernt.
- `src/client/germany/GermanyMap.tsx`: vorhandene Aktionen für Zentrieren/Zoom/Ebenen; keine Änderung an Geodaten, Routing oder Kaufregeln. Maßstab und Quellenangaben bleiben sichtbar.
- `Reports.tsx`, `navigation.ts`, `Settings.tsx`, `device-preferences.ts`, `EventLog.tsx`, `main.tsx`: echte Statistiknavigation, UI-Skalierung 125/150 Prozent, kontextabhängiger Verlaufsreset und Integration der Gestaltung.

Lesen, Öffnen oder Reiterwechsel quittiert keinen Sprechwunsch. Bei Verbindungsverlust erscheint der geforderte lokale Hinweis mit Neuladen/Support; schreibende Aktionen verwenden die bestehende Offline-Sperre. Die Vorschau begrenzt nur sichtbare Zeilen, niemals die serverseitige Einsatzanzahl. Die Leseposition bleibt bei Reiterwechsel und neu eintreffenden Meldungen erhalten.

## Lokale Prüfung

Der Produktionsbuild wurde mit Node 24.19.0 und dem vorhandenen pnpm 11.19.0 erstellt. Projekt-/Formatprüfung, Lint und Typecheck bestanden. Die drei gezielten Logikdateien `device-preferences`, `call-workspace` und `game-events` bestanden mit acht Tests.

Ein breiter Edge-Browserlauf lieferte zunächst 104 erfolgreiche und zehn fehlgeschlagene Abläufe. Die Fehler betrafen überholte Zugänge/Selektoren sowie fehlende Dringlichkeits-/Großlagen-/Seitenangaben und doppelte Verbindungshinweise im neuen HUD. Nach Korrektur bestanden alle 27 gezielt wiederholten Abläufe. Der anschließende Layoutlauf bestätigte alle sechs Größen; der ergänzte Test für eine neue Meldung während des Lesens wurde danach separat erfolgreich geprüft.

Die integrierten Browserprüfungen verwenden den **gebauten Server und Client** mit kleinen isolierten Deutschland-Fixtures, keine Komponenten-Demo. Sie decken unter anderem ab:

- 1366×768, 1920×1080, 2560×1440 bei 100 Prozent; 1366×768 bei 125/150 Prozent und 1920×1080 bei 150 Prozent.
- Alle elf Menüziele plus Hauptmenürückkehr, Suchnavigation, Escape und Fokus, geschlossene/geöffnete Menüs sowie beide Reiter. Keine Überlappung von Menü und Statusanzeigen bei großer Schrift.
- Notrufannahme, Alarmierung, Sprechwünsche, Zwei-Disponenten-Bearbeitung, Nachforderung, Transport, Historie, Wiederverbindung und Neustart über die vorhandenen Browserabläufe.
- 73 aktive Einsätze, sechs Prioritäten und 137 paginierte Berichte; leere Listen und große Geldwerte.
- Kritische Meldung bei inaktivem Reiter ohne automatische Umschaltung, keine Quittierung durch Lesen, stabile Leseposition bei neuer Meldung und keine doppelten Ereignisse nach Wiederverbindung/Neuladen.

Zusätzlich wurde das gebaute Spiel mit dem bereits lokal vorhandenen vollständigen Deutschlandpaket und dem echten GraphHopper-Router geöffnet. Ein isoliertes Testkonto kaufte einen echten Berliner Feuerwehrstandort und Fahrzeuge. Vier Screenshots zeigen offenes/geschlossenes Menü und beide Reiter bei 1920×1080. Es wurden keine Browser-Skriptfehler festgestellt. Keine private AMP-Instanz wurde dafür benutzt.

Die neuen Tests liegen in `tests/e2e/desktop-hud.spec.ts`, `hud-measurement.chromium.spec.ts` und `radio.spec.ts`; bestehende Tests verwenden die aktualisierten tatsächlichen Wege in `ui-navigation.ts`. Screenshots und Messdaten liegen als Abnahmeartefakte in `.tools/hud-acceptance/`. CI lädt sie mit den Browserartefakten hoch. Sie gehören nicht zum AMP-Laufzeitpaket.

## Vorher-/Nachhermessung

Verglichen wurden der unveränderte Ausgangscommit `1fbf9ea7953058e5f319a906edee011d6bcced20` (2.26.2) und der gebaute HUD-Stand 2.27.0, jeweils lokal in Edge/Chromium bei 1920×1080. Nach initialem Laden wurden zehn Menü-Auf-/Zuzyklen und zwanzig Wechsel der jeweiligen vorhandenen Reiter ausgeführt. Die Messung verwendet Chromium-Performancezähler und zählt tatsächlich ausgelöste Browseranfragen.

| Messwert für die gesamte Bedienfolge      |     Vorher |    Nachher |
| ----------------------------------------- | ---------: | ---------: |
| Zusätzliche HTTP-Anfragen                 |          0 |          0 |
| Darunter Standort-/Geodatenabfragen       |          0 |          0 |
| TaskDuration                              | 663,426 ms | 453,293 ms |
| ScriptDuration                            | 128,973 ms |  75,969 ms |
| LayoutDuration                            |  15,065 ms |  12,356 ms |
| RecalcStyleDuration                       |  90,343 ms |  66,718 ms |
| LayoutCount                               |         61 |         60 |
| RecalcStyleCount                          |        450 |        381 |
| Kartenposition und Karteninstanz erhalten |         Ja |         Ja |

Das sind **Einzelmessungen**, keine statistische Geschwindigkeitsgarantie und keine Startladezeitmessung. Sie belegen für diese Bedienfolge ausbleibende Zusatzabfragen und keinen Karten-Neustart. Es wurde kein neues Polling eingeführt. Vorhandene Ratenbegrenzung, Caches, verzögerte Suche und Anfragezusammenfassung bleiben erhalten.

## Daten und Veröffentlichung

Keine Datenmigration, keine neue Abhängigkeit, kein Reset und keine Änderung an privaten Datenpfaden, Caddy oder Routerfreigaben. Gameplay, Weltgenerierung, Wirtschaft und serverseitige Simulation bleiben unverändert.

Die Veröffentlichung erfolgt auf `main` über den bestehenden Prüf-/Paket-/Releaseweg. Maßgeblich für den tatsächlichen Endstand sind die zum Release gehörende `acceptance.json`, der vollständige Commit und die erfolgreichen GitHub-Läufe. Ein bereitgestelltes GitHub-Update ist keine Behauptung, es sei schon auf einem privaten AMP-Server installiert.
