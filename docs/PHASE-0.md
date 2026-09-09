# Phase 0: Bereinigung und Entwicklungsqualität

Ausgangsstand: `ba79033a8a1aebba15d3e425cb963796fb448e23` auf sauberem `main`, mit `origin/main` abgeglichen. Keine Produktionsinstallation. Die neuen Fachfunktionen des nächsten Auftrags sind nicht Teil dieser Änderung.

## Bestandsaufnahme und Maßnahmen

| Befund                                                                             | Nachweis                                                                                            | Änderung                                                                                                           | Risiko                                           | Prüfung                                                                           |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Produktionsbuild übersetzt zwei Weltvarianten und Typen nacheinander               | `scripts/build.mjs`, `build-germany.mjs`; kalter lokaler Build 11,363 s, Wiederholung 7,889 s       | Gemeinsamer begrenzter Buildablauf, ausdrücklich inkrementeller Wiederholungsbuild mit geprüften Eingaben/Ausgaben | Vermischte Weltdateien oder ungültiger Cache     | Kalter Build aus Git-Archiv; beide Server; Manipulations- und Invalidierungstests |
| Dev überwacht ausschließlich `dist/server/index.js`                                | `scripts/dev.mjs` erzeugt nur einen initialen Serverbuild                                           | Dauerhafter esbuild-Kontext, serverseitige Änderungen automatisch übersetzen und geordnet neu starten              | Verlorene Entwürfe, Port-/SQLite-Sperren         | Echter Dev-Start, sichtbares CSS-HMR, Serveränderung, Konto nach Neustart         |
| Unit-Stufe enthält nur fünf Namen, alle anderen gelten als Integration             | `scripts/tests.mjs`; 18 Tests im bisherigen Quick-Lauf                                              | Vollständige nachvollziehbare Testgruppen, schnelles gezieltes Prüfen ohne Änderung der vollständigen Testmenge    | Testdateien fallen aus der Gesamtprüfung         | Vollständigkeitsprüfung der Gruppen; alle Tests in CI                             |
| Historischer Serverbuild läuft auch vor reinen Audiotests                          | Globales `tests/legacy-build.ts`                                                                    | Artefakte nur für benötigte Gruppen bereitstellen                                                                  | Veralteter Testserver                            | Eingabebindung und echte Server-/Migrationsprüfung                                |
| Verwaiste CSS-Regeln für Navigation unten/links und alten Startbildschirm          | Kein Aufruf in JSX, Templates oder dynamischen Registrierungen; aktuelle Navigation in `Topbar.tsx` | Nur belegte ungenutzte Selektoren entfernen                                                                        | Versehentlich aktive gemeinsame Regeln entfernen | CSS-Referenzprüfung und Desktop-Browserabnahme                                    |
| Informationsseiten berechnen unveränderte Katalogdaten bei jedem Snapshot          | `ProgressionPanel.tsx`, `MenuPanels.tsx`                                                            | Statische Aufbereitung außerhalb des Renders, Filter an ihre wirklichen Eingaben binden                            | Veraltete Stufen-/Filterdaten                    | Filter-/Stufenregression und sichtbare Bedienung                                  |
| Lange Einleitung und uneinheitliche Hilfsflächen in Arbeitsmenüs                   | Katalog, Wachen, Hilfe, Details; Vorher-Aufnahmen                                                   | Kompakte Übersicht, aufklappbare Erläuterungen, gemeinsame Leer-/Ladezustände                                      | Informationen oder Fokus verschwinden            | Öffnen, Benutzen, Schließen, Escape, Textfelder, vier Desktopgrößen               |
| Keine sichere gezielte Bereinigung und keine gemeinsamen Struktur-/Größenprüfungen | package.json, CONTRIBUTING.md                                                                       | Vorschau als Standard; strikte Ausgabe-Allowlist; Struktur-, Link- und Bundle-Prüfung                              | Löschen von Daten oder Fehlalarme                | Negative Tests mit Daten, Verknüpfungen und fremden Pfaden                        |

## Bewusst erhalten

- Deutschland (`src/germany`, Geodatenpipeline, GraphHopper, Kartenassets) ist das aktuelle Produkt. Keine Datenaufbereitung im gewöhnlichen UI-Build.
- Rivermere-Server und Falkenried-Testbuild sind weiterhin konkrete Kompatibilitäts-/Migrationsziele. Bestehende Koordinaten, IDs und Sicherungen dürfen nicht umgedeutet werden. Daher keine pauschale Löschung von `Map.tsx`, `MapTerrain.tsx`, `world.ts`, `mode.ts` oder historischen Regressionen.
- `SoundProfiles` und `WorkspaceSettings` werden von den aktuellen Einstellungen verwendet. `Operations` wird auch von der Deutschlandkarte geöffnet. Diese Komponenten sind keine Altlasten.
- Alte Abnahmebilder und Berichte sind historische Nachweise, keine aktuellen Bedienanleitungen. Bestehende Quelldesigns, Audioquellen und Attributionen bleiben erhalten. Neue Rohaufnahmen gehören in ignorierte Prüfartefakte.
- Datenbankversion, Euro-Umrechnung, automatische Besatzung, Tutorial, FMS, Patienten, Einsätze, Rechte und Wiederherstellung bleiben fachlich unverändert.

## Messmethode

Lokale Ausgangsmessung: Windows, Node 24.19.0, Intel i7-13700K, 24 logische CPUs, 32 GiB RAM. Exaktes Git-Archiv in eigenem temporären Projektverzeichnis; eigener `node_modules`-Baum, vorhandener pnpm-Paketstore, fixiertes pnpm 11.19.0 und Lockfile. `LV_OFFLINE_NEWS=1` verhindert, dass wechselnde GitHub-Nachrichten die Buildzeit verfälschen. Schritte laufen nacheinander. Kalter Build bedeutet leere Buildausgabe; kein behaupteter leerer Betriebssystem-/Paketcache. Der unveränderte zweite Build misst Wiederholung unter denselben Bedingungen.

Die Ausgangs-CI wurde über die GitHub-API erneut gelesen: [Prüfung 34378957792](https://github.com/Philipp284868/Leitstellen-Verbund/actions/runs/34378957792). Build/Test-Job 248 s; Geodatenfixtures 60 s; Browserjobs Chromium 530/518 s und Firefox 530/558 s; Zeit vom ersten Jobstart bis zum letzten Jobende 811 s. Lokale Zeiten werden nicht gegen Linux-CI als Beschleunigungsfaktor verglichen.

## Umgesetzte Bereinigung

Entfernt wurden die unaufgerufene `Friends`-Ansicht, ihr ausschließlich dort benutztes `SharedMission`, der unbenutzte `SoundSettings`-Wrapper und belegte CSS-Reste der verworfenen Navigation. TeamPanel, NeighborDesk und der gemeinsame Audioeditor bleiben die tatsächlichen Bedienwege. Alle zehn Produktionsabhängigkeiten haben weiterhin aktive Laufzeitimporte; keine spekulative Paketlöschung und kein Versionsupgrade.

Die [Menüinventur](MENUES.md) beschreibt die erreichbaren Ansichten und Unterdialoge. Katalog und Hilfen zeigen ihre Grundinformationen kompakt; ausführliche Erläuterungen sind aufklappbar. Gemeinsame Ressourcenübersichten, Leerzustände und Abstände ersetzen unnötige Einzelrahmen. Im Hauptmenü steht die Anzahl aktiver Einsätze nur noch in der Leitstellenübersicht statt zusätzlich in der Serverkarte. Einstellungen, Fortschritt, Spieler, HUD und Menüs werden bei Bedarf geladen. Die Deutschlandkarte und eine obere Leiste bleiben erhalten.

Statische Freischaltungskataloge werden einmal aufbereitet, Suchfilter anhand ihrer tatsächlichen Eingaben berechnet. Spiel-, Präsenz-, Netzwerk- und Geräteeinstellungen besitzen stabile Abonnementfunktionen; ein Render meldet diese nicht mehr unnötig ab und wieder an. Netzwerkprotokoll, Aktualisierungsfrequenz, Routenberechnung und Berechtigungen wurden nicht verändert.

Lokal wurden 91 regenerierbare Browserdateien mit 93.104.749 Bytes sowie 22 veraltete Ausgabeprotokolle mit 53.412 Bytes entfernt. Die freigegebene Bereinigung bietet zuerst eine Vorschau und verweigert Datenbanken, Sicherungen, Geheimnisdateien, fremde Pfade und Verknüpfungen. Bestehende Abnahmepakete blieben erhalten.

## Gemessener Vergleich

Die folgenden Messungen vergleichen das Archiv des Ausgangscommits mit dem Implementierungsstand `2cde09eb110188cbd41ab74bb57eb4ba7b97fb52`. Nachfolgende Korrekturen betreffen die CI-Paketquellen, die isolierte Reihenfolge des Labor-CLI-Tests, die Dokumentation und die Entfernung der doppelten Einsatzzahl im Hauptmenü. Die gemessene Build-/Dev-Implementierung bleibt identisch; der endgültige Quellstand wird erneut kalt aufgebaut und im Browser geprüft. Rohdaten liegen in den Phase-0-Abnahmeartefakten; ausführbare Wiederholungen siehe [Entwicklung](ENTWICKLUNG.md).

| Messung | Vorher | Nachher | Einordnung |
|---|---:|---:|---|
| `pnpm install --frozen-lockfile --prod=false` | 3,484 s | 4,159 s | Je ein eigener Abhängigkeitsbaum, gemeinsamer vorhandener Paketstore; kein belegter Gewinn |
| `node scripts/build.mjs`, leere Ausgabe | 11,363 s | 11,155 s | Praktisch unverändert; beide Weltvarianten und Typprüfung |
| Derselbe vollständige Build wiederholt | 7,889 s | 8,693 s | Hash-/Ausgabeschutz kostet Arbeit; kein beschönigter Beschleunigungswert |
| Explizites `build:fast`, erster Lauf | nicht vorhanden | 9,004 s | Initiale vollständige inkrementelle Typprüfung |
| `build:fast`, unveränderte Wiederholung | vorheriger Vollbuild 7,889 s | 2,059 s | Gleiche vollständige Typprüfung, bytegeprüfte Artefakte; Tests werden nicht gecacht |
| Vollständige Typprüfung + dieselben 18 Tests, zwei Worker | Median 10,055 s | Median 4,810 s | Drei abwechselnde warme Läufe; gleicher fachlicher Umfang, rund 52 % kürzer |
| Dev bis benutzbarer Anmeldung, Rivermere-Vergleich | Median 7,544 s | Median 8,429 s | Drei Läufe; kein Startgewinn, dafür automatischer Server-Watch/Neustart |
| Sichtbares CSS-HMR ohne Seitenneuladen | Median 107 ms | Median 102 ms | Drei Läufe; praktisch unverändert, kein erzwungener HMR-Neustart |
| Deutschland-Dev mit vorhandenen echten Geodaten/Router | kein vergleichbarer alter Dev-Standard | 2,780 s, HMR 75 ms | Separater einzelner Funktionsnachweis; nicht mit der anderen Welt verrechnen |

Die drei identischen Kurzprüfungen lagen vorher bei 10,025 / 10,055 / 10,282 s, nachher bei 5,323 / 4,545 / 4,810 s. Der neue eigenständige `test:quick` enthält 50 statt 18 Fälle und benötigt 5,524 / 5,268 s; er enthält absichtlich nicht die gesonderte `check:quick`-Stufe. Die neue vollständige Unit-Stufe umfasst 29 statt zuvor fünf Dateien und dauerte 17,833 s. Unterschiedliche Testumfänge werden nicht als Geschwindigkeit derselben Prüfung ausgegeben.

Das Deutschland-Einstiegsmodul sinkt von 421.766 auf 235.295 Bytes. Das bedeutet gezieltes Laden: Sämtliche JavaScript-Dateien einschließlich Kartenworker zusammen ändern sich von 2.319.848 auf 2.323.712 Bytes. Es wird keine entsprechende Reduktion der Gesamtübertragung behauptet. MapLibre bleibt mit 990.762 Bytes groß; es besitzt ein eigenes überprüftes Budget statt einer abgeschalteten Warnung.

## Prüfungen und gefundene Grenzen

- Kalter Build aus dem isolierten Git-Archiv mit eigenem `node_modules`, ohne ungetrackte Projekt-Hilfsdateien: bestanden. Der endgültige Commit wird zusätzlich separat kalt aufgebaut.
- Struktur, aktive Links, vollständige Testgruppierung, Formatierung, ESLint, Typprüfung und Bundlebudgets: lokal bestanden. 22 gezielte Werkzeug-/Dev-/Speicherkontextfälle, anschließend der isolierte Laborblock mit 16 Fällen: bestanden.
- Lokaler vollständiger Logiklauf aus dem Archiv: 1.151 Vitest-Fälle bestanden und ein bereits vorhandener Linux-Signaltest unter Windows übersprungen. 14 von 16 Node-Fällen bestanden; zwei unveränderte Dateisymlink-Fälle scheitern an fehlenden Windows-Symlinkrechten (`EPERM`). Dieser Lauf ist ausdrücklich kein vollständig grüner Plattformnachweis. Linux-CI führt alle 1.152 Vitest- und 16 Node-Fälle aus.
- Der Ausgangslauf hatte zusätzlich einen Windows-SIGTERM-Abbruch im AMP-Test. Windows nutzt nun die bestehende geordnete IPC-Abschaltung; Linux prüft weiterhin echtes SIGTERM. Konten, Sperren und Wiederanlauf werden unverändert geprüft.
- Lokale Browser-Vorprüfung: 15 reale Abläufe für Topbar, vier Desktopgrößen, Formulare, AAO/FMS, Entwurfsschutz und Escape bestanden. Die gesonderte echte Deutschland-Abnahme durchlief 58 Ansichten, das gesamte Tutorial und einen Serverneustart ohne Browserfehler. Repräsentative Vorher-/Nachherbilder wurden visuell geprüft. Die vollständigen Chromium-/Firefox-Suiten bleiben zusätzliche Pflichtprüfungen.
- Im ersten CI-Lauf scheiterte der vorhandene Labor-CLI-Test unter CPU-Konkurrenz am unveränderten 20-Sekunden-Limit. Der komplette Laborblock läuft jetzt nach den anderen Tests allein; keine Assertion, Szenariomenge oder Zeitgrenze wurde reduziert. Der Ausgangs- und neue lokale Gesamtlauf sind wegen des früheren Abbruchs und der neuen Dev-Prüfung kein gleichartiger Geschwindigkeitsvergleich.
- Die Browserinstallation desselben CI-Laufs scheiterte vor Testbeginn an einem `Hash Sum mismatch` der vorinstallierten Google-Chrome-Paketquelle. Die CI bezieht Systembibliotheken jetzt ausschließlich aus den bestehenden signierten Ubuntu-Quellen; Playwright liefert die festgelegten Browser. Paketprüfsummen, Sicherheitsprüfung und Browserfälle bleiben aktiv. Grundlage: [Ubuntu-Paketquellen](https://ubuntu.com/project/docs/how-ubuntu-is-made/concepts/package-archive/) und [Playwright-Systemabhängigkeiten](https://playwright.dev/docs/browsers).
- Die zusätzliche vollständige Edge-Prüfung deckte ein Rennen beim ersten Größenabgleich der erhaltenen Rivermere-Karte auf: Der anfängliche Ersatz-ViewBox konnte sich während des ersten Klicks verändern. Die tatsächliche Größe wird jetzt in einem Layout-Effekt vor dem ersten sichtbaren Frame übernommen; der ResizeObserver behandelt weitere Größenänderungen. Die bestehende strenge Prüfung bei doppelter Pixeldichte und ihre Assertions bleiben unverändert. Die Deutschlandkarte verwendet weiterhin ihren eigenen Renderer.

Die verbindlichen Ergebnisse und Joblaufzeiten des endgültigen Commits stehen im zugehörigen GitHub-Lauf und im ausgelieferten Abschlussbericht. Ein fehlgeschlagener Zwischenlauf wird nicht als erfolgreiche Abnahme ausgewiesen. CI baut einmal und beginnt Logik-/Betriebstests und Browserjobs danach parallel; jede Nutzung prüft Commit, sauberen Quellstand und Node-Version. Browserartefakte bleiben sieben Tage, das gemeinsame Buildartefakt zwei Tage erhalten. Es gibt weder automatische Produktionseinrichtung noch zusätzliche kostenpflichtige Runner.

## Dauerhafte Regeln und weitere Arbeit

[CONTRIBUTING](../CONTRIBUTING.md) und [Entwicklung](ENTWICKLUNG.md) verankern die acht Arbeitsschritte, Befehle, Cachegrenzen und Browserpflicht. Automatische Prüfungen melden Verstöße, löschen aber keine Dateien. Der vollständige kalte Auslieferungsweg bleibt verfügbar; keine Erfolgsergebnisse werden aus einem Testcache übernommen.

Keine Datenbankmigration, kein Weltreset und keine Änderung an Konten, Geld, XP, Einsätzen oder gespeicherten IDs war erforderlich. Erhaltene historische Weltvarianten dienen der Kompatibilität und ihren Regressionstests. Größere Eingriffe wie neue Zustandsprotokolle, eine andere Kartenbibliothek oder eine Aufteilung der Engine sind eigene Folgevorhaben. Der nächste Funktionsauftrag zu Funk, Notrufen und Katastrophenschutz wurde hier nicht begonnen.
