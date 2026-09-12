# Abnahme 2.25.0 – Leitstellenarbeitsplatz und Serverbetrieb

Stand der lokalen Prüfung: 12.09.2026. Die Änderungen wurden im bestehenden Deutschlandprodukt umgesetzt. Keine Produktionsinstallation, Zertifikate, Router oder privaten Spielstände wurden verändert.

## Umfang

- Neue Notrufe setzen eine authentifizierte aktive Spielansicht voraus. Hauptmenü, Abmeldung und verlorene/abgelaufene Sitzungen geben keine Erzeugung frei. Laufende Einsätze und Transporte bleiben aktiv. Mehrere Tabs und berechtigte Disponenten werden unabhängig berücksichtigt.
- Wiederkehrende Grundfinanzierung und aktives Tutorial sind entfernt. Historische Gelder, Konten, Käufe und Fortschritt bleiben erhalten. Der bestehende Einstieg Feuerwache und TSF-W ist mit dem unveränderten Startgeld finanzierbar.
- Einsätze/Notrufe liegen einklappbar links, Textfunk und Systemereignisse dauerhaft darunter. Das Menü rechts neben dem Namen enthält Verwaltung, Kooperation, Statistik, Suche, Einstellungen, Konto, Sicherungen, Changelogs, Leaderboard, Support und den ausdrücklichen Hauptmenüweg. Funkentscheidungen liegen weiterhin am Einsatz.
- Keine Funk-Sprachausgabe; Telefon, Signale, Musik und eigene Audioeinstellungen bleiben. Lokal sichtbare Verbindungsfehler sperren Schreibaktionen und bieten Neuladen/Support. Ereignisse haben stabile IDs, begrenzte Darstellung und nachladbare Historie.
- Die lokale Vektorkarte zeigt Straßen-/Schienenklassen, Brücken, Tunnel, Ebenen, Gebäude, Landschaft und verfügbare Höhendaten. Allgemeine POI-/Spieler-/Personal-Pins entfallen. Reale Einrichtungen und berechtigte operative Anzeigen bleiben.
- Das Leaderboard berücksichtigt Offline-Spieler, trennt persönliche Beteiligungen von gemeinsamen Beständen und kennzeichnet historische Messlücken. Changelogs und Release-Notizen stammen aus derselben Quelle.
- Fehlerberichte benötigen bereinigte Vorschau und ausdrückliche Veröffentlichung. Fehlende Zugangsdaten, unklarer Versand, Rate-Limits und Wiederholungen besitzen echte Zustände. Diagnose exportiert keine vollständigen Fehler-, Konto- oder Spielstandsobjekte.

## Lokale Prüfungen

| Prüfung                                      | Ergebnis                                                                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Projektstruktur, Format, Lint, Typecheck     | Bestanden                                                                                                                                    |
| Produktionsbuild und Bundlebudgets           | Bestanden; Vites allgemeiner Hinweis auf große Kartenbibliotheks-Chunks bleibt, die projektspezifischen Budgets sind eingehalten             |
| Vollständige Edge-Browserregression          | 105 Abläufe bestanden; nach der abschließenden Kompaktierung der Rangliste weitere 8 betroffene Abläufe bestanden                            |
| Kartenlast                                   | 100 Wachen, 500 Fahrzeuge, 100 laufende Fahrten, 40 Einsätze; bestanden                                                                      |
| Messwerte Kartenlast, lokaler Testrechner    | 1.745 ms Anmeldung/Öffnen, 547 ms Übersicht/Suche/Auswahl; 49 Markerelemente in der geprüften Ansicht; 95. Perzentil der Bildabstände 6,2 ms |
| Langzeitsimulation                           | Alle 7 Prüfungen über 3 Seeds, 2 Fuhrparks und insgesamt 22 simulierte Stunden bestanden; 525 Sekunden Laufzeit                              |
| Abschließende gezielte Logik-/HTTP-Prüfungen | 19 Prüfungen in 7 Dateien bestanden: Ereignisse, lokale Diagnose, Reporter, Rangliste, Support-HTTP, Changelog und Gerätepräferenzen         |
| GitHub-Berichtsablauf im Browser             | Vorschau, Zustimmung, bestätigter Beleg, Reload und Doppelschutz bestanden; GitHub vollständig simuliert, kein echtes Issue erstellt         |

Der frühere lokale Gesamtlauf fand vier Fehler: zwei veraltete beziehungsweise unter Last zu knappe Testannahmen sowie zwei Laufzeitüberschreitungen der Langzeitsimulation. Die betroffenen Prüfungen wurden nach Korrektur erneut erfolgreich ausgeführt. Der Ereigniscache verhindert jetzt wiederholte Schreibvorgänge für unveränderte Historie; der Simulationsumfang und seine Zeitgrenzen wurden dafür nicht verringert.

## Echte Deutschlanddaten und Serverprozess

Zusätzliche lokale Prüfung mit vollständigem vorhandenem Datenpaket, eigenem Testkonto, isoliertem Spielverzeichnis und dem regulären Deutschlandstarter einschließlich eigenem GraphHopper-Prozess:

- Paketstand 07.09.2026, Datensatz `155596c0041a76f05d3b5fb03a36f2b9e26540b517fde8b4b9884c62c4fc1a90`.
- GraphHopper 11.0, OSM-Datenstand 07.09.2026, 20:21:20 UTC; lokale Terrarium-Höhendaten wurden geladen.
- Berlin, Frankfurter Schienenanlagen und Hamburger Hafen wurden tatsächlich gerendert. Kein externer Ressourcenabruf, keine allgemeinen POI-Abfragen, keine Browserfehler im abgeschlossenen Lauf.
- Eine gültige Straßenroute antwortete mit 200, eine Verbindung außerhalb des Datensatzes mit 400. Routine-Zugriffsprotokolle bleiben still; Lebenszyklusmeldungen bleiben sichtbar.
- Die Feuerwache Mitte wurde über den normalen Kaufdialog erworben; die Buchung erschien im Textprotokoll. Bei Feuerwache Buckow wies die vorhandene Zufahrtsprüfung den Kauf ab. Die Katalogkennzeichnung allein beweist deshalb keine aktuell nutzbare Verbindung: die verbindliche Prüfung erfolgt beim Kauf.
- Letzter abgeschlossener Lauf: 2.684 ms Start, 109 ms Stopp bei bereits vorhandenem Datenpaket und lokalem Dateicache. Das sind keine Zusagen für AMP-Hardware oder einen Erstimport.
- SQLite-Integrität, Datensatzidentität, freigegebene Ports und Datenbanksperre sowie das Ende aller selbst gestarteten Prozesse wurden bestätigt.

Dies ist kein Test der privaten AMP-Instanz, ihrer öffentlichen Erreichbarkeit oder ihrer HTTPS-Konfiguration. Verbleibende OSM-/Zufahrtslücken werden nicht durch erfundene Verbindungen überbrückt.

## Migrationen und Betrieb

Die vorhandene Sicherung vor Schemaänderungen bleibt aktiv. SQLite 21 entfernt Fördertermine, 22 legt isolierte Tutorialwelten still, 23 führt den Ereignisverlauf ein, 24 die eindeutige Leistungswertung und 25 persistente Fehlerberichte. Bestehende reale Spielstände benötigen keinen Reset.

Für normales Spielen sind keine neuen AMP-Werte nötig. Optionaler GitHub-Direktversand verwendet ausschließlich serverseitig `GITHUB_ISSUES_TOKEN`, auf dieses Repository begrenzt, mit `Issues: Read and write`. Ohne Token funktionieren Spiel, Vorschau, Download und manueller Meldeweg weiter. Details, Aufbewahrungsgrenzen und Betreiberpflichten stehen in [HUD und Serverbetrieb](HUD-UND-SERVER.md) sowie [AMP](AMP.md).

## Geänderte Bereiche

- Oberfläche: `App`, `GameHud`, `Topbar`, `MainMenu`, `ControlRoom.css`, `EventLog`, `Players`, `ProjectNews`, `Support`, `LegalInfo`, Einstellungen und Navigation.
- Spiel und Daten: Anwesenheit, serverseitige Erzeugungsfreigabe, Wirtschafts-/Tutorialmigrationen, Ereignisse, Leistungswertung, Fehlerberichte, Kontolöschung und Wiederherstellung.
- Karte: vorhandener Deutschlandstil, eigenes Modul für Transport-/Ebenendarstellung, bereinigte Marker- und Präferenzpfade.
- Betrieb: strukturierte Diagnose, optionale Reportingkonfiguration, Schemaerkennung, Changelog-Build und CI-Prüfung.
- Tests und Dokumentation: Bedienabläufe folgen der neuen Navigation; entfernte Tutorial-/Finanzierungsannahmen wurden durch Migrations- und Abwehrprüfungen ersetzt. Nicht mehr benutzte Funk-/Ranglistenansichten und Styles wurden entfernt.

## GitHub-Abnahme

Produktstand: `ade0eb45b872895848d37a7cc06eec39907c31df`, regulär auf `main` gepusht. [Produktprüfung einschließlich verbindlicher Gesamtabnahme](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34714811664) und [Code-Sicherheit](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34714811667) sind vollständig bestanden. Die Ergebnisartefakte wurden für genau diesen Commit gelesen; keine Produktionsbereitstellung wurde ausgelöst. Die anschließende Dokumentationsänderung ergänzt diesen Bericht, ohne Produktcode zu verändern.

| Pflichtgruppe auf Linux                                                      | Tatsächliches Ergebnis                                          |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Logik und Integration                                                        | 1.321 bestanden, 0 fehlgeschlagen, 0 übersprungen; 663 Sekunden |
| Zusätzliche Node-Prüfungen                                                   | 16 bestanden                                                    |
| Reguläre Browser Chromium / Firefox                                          | 105 / 104 bestanden                                             |
| Zusätzliche Kartenlast Chromium / Firefox                                    | 1 / 1 bestanden                                                 |
| Laufzeitpaket                                                                | 3 Prüfungen bestanden                                           |
| Abhängigkeitsprüfung                                                         | Bestanden                                                       |
| Projektstruktur, Build, Geodaten, AMP, CodeQL und verbindliche Gesamtabnahme | Bestanden                                                       |

Die Linux-AMP-Abnahme bestätigte frische und wiederholte Installation, Caddy-Konfiguration, TLS-Anmeldung mit geschütztem Cookie, Origin-/WebSocket-/Polling-Verhalten, Trennung privater Dateien und Geodaten, Portumleitung, Wiederherstellung verlorener Konfiguration sowie sauberen Stopp mit persistentem Neustart. Grundlage war ein kleiner geprüfter Deutschlanddatensatz und ein Routingvertrag; keine öffentliche ACME-Zertifikatsausstellung und kein Zugriff auf die private AMP-Instanz.

Die regulären Linux-Browsergruppen bestanden mit 105 Chromium- und 104 Firefox-Abläufen. Keine übersprungenen Fälle, keine Wiederholungen zum Bestehen. Die Browserumfänge unterscheiden sich um eine ausschließlich in Chromium verfügbare Berechtigungsprüfung; die verbindliche Dateizuordnung wurde durch den bestehenden CI-Vertrag geprüft.

Die zusätzliche Kartenlastprüfung bestand in beiden Linux-Browsern ohne übersprungene oder beim Wiederholen erst bestandene Fälle. Die Softwaregrafik des CI-Rechners war deutlich langsamer als der lokale Rechner: Übersicht/Suche/Auswahl 1.787 ms in Chromium und 793 ms in Firefox, Bildabstände am 95. Perzentil 166,7 beziehungsweise 84,9 ms. Der Test prüft Funktionsfähigkeit, Eingabeverarbeitung und Suchbudget; diese Messung ist keine Zusage durchgehend flüssiger Grafik auf jeder Hardware.

Die Abnahmebilder wurden separat bereitgestellt: Hauptmenü, HUD in 1366 und 1920 Pixel Breite, tatsächliches Kaufereignis im Textfunk, Schienenkarte, Leaderboard und Support. Kartenbilder verwenden den lokalen echten Datensatz; die Ranglistenabbildung enthält ausdrücklich Testkonten.
