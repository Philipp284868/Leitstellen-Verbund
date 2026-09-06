# Architektur

## Module und Zuständigkeiten

| Modul                                    | Verantwortung                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `catalog.ts`                             | Balancing, acht Gebäude, 20 Fahrzeugtypen, 40 Einsatzvorlagen, Fähigkeiten und Wachenerweiterungen |
| `world.ts`                               | Versionierte lokale Region, Straßengraph, A\*, Wasser- und Luftwege, Positionsinterpolation        |
| `model.ts`                               | Zod-Schemas, Referenzprüfung, lokale IDs, Stufen und Erfolge                                       |
| `engine.ts`                              | Testbare Zustandsübergänge, Käufe, Personal, Routen, Patienten und Abschlussbuchung                |
| `storage.ts`                             | IndexedDB/Dexie, Migrationen, Transaktionen, Sicherungen und Dateiimport                           |
| `store.ts`                               | Serialisierte Änderungen, ein Simulationstakt pro Tab, Web Lock, React-Abonnement                  |
| `network.ts`                             | WebRTC, Signaling, validiertes Protokoll, freigegebene Ansichten und Kooperation                   |
| `Map.tsx`                                | Lokale Kartendarstellung, Auswahl, Pan, Zoom, Marker und Routen                                    |
| `Resources.tsx`, `Panels.tsx`, `App.tsx` | Deutsche Spieloberfläche                                                                           |
| `pwa.ts`, `scripts/build-sw.mjs`         | Kontrollierte Updates und Cache des tatsächlichen statischen Builds                                |

## Simulation und Transaktionen

`apply(save, action)` und `tick(save, targetTime, confirmedRemoteSkills, offline)` arbeiten unabhängig von React. Der Aufrufer übergibt die Zeit; Zufall beruht auf einem im Spielstand gespeicherten LCG-Seed. Das macht Abläufe im Test reproduzierbar. IDs verwenden `crypto.randomUUID()` und beeinflussen keine Zufallsentscheidungen.

Die Anwendung bearbeitet eine Kopie des letzten bestätigten Spielstands in einer Promise-Warteschlange. Erst wenn die validierte Kopie vollständig in einer IndexedDB-Transaktion gespeichert wurde, wird sie als React-Snapshot veröffentlicht. Ungültige Aktionen verändern deshalb keinen teilweise übernommenen Besitz. Speicherfehler pausieren weitere Simulation, bis der Speicher erneut erfolgreich geprüft wurde. Normale abgelehnte Spielaktionen erzeugen keine wirtschaftliche Teilbuchung.

Der Takt wird außerhalb von React-Komponenten einmalig gestartet. Re-Mounts und Strict-Mode können keinen zweiten Simulationslauf erzeugen. Zeitfortschritt beruht auf Zeitdifferenzen und gespeicherten Ankunftszeitpunkten, nicht auf einer gezählten Anzahl Intervalle. Offline-Nachberechnung ist auf vier Stunden Simulationszeit und 1.200 Teilschritte begrenzt. Neue Einsatzangebote entstehen offline nicht. Rückwärts laufende Systemzeit erzeugt keinen negativen Fortschritt.

Geld besteht aus ganzzahligen Spielcredits. Alle Buchungen landen im begrenzten Journal. Abschlussbelege bleiben getrennt vom Journal erhalten, damit dessen Rotation keine erneute Auszahlung ermöglicht. Geld, Besitz, Phase und Beleg werden gemeinsam gespeichert.

## Patienten

Ein Einsatz wechselt erst nach erfüllten Fähigkeiten und ausreichender Arbeitszeit in die Transportphase. Persistierte Transportaufträge ordnen Patientenzahlen eindeutigen Fahrzeugzuweisungen zu. Fahrzeugkapazitäten und Krankenhausplätze werden geprüft. Ein öffentliches Klinikum verhindert die Abhängigkeit von einem frühen eigenen Krankenhaus.

Bei Kooperation verschickt der Koordinator zuvor gespeicherte Transportaufträge an bestätigte Helfer. Der Eigentümer prüft Zuweisung, Kapazität und Runde, fährt zum eigenen geeigneten Krankenhaus und speichert eine Lieferbestätigung. Erst die bestätigte Übergabe zählt beim Koordinator. Wiederholte Aufträge erzeugen keinen zweiten Transport.

## Besitz und lokale Nebenläufigkeit

Ein Browser bleibt allein maßgeblich für seinen Besitz. Fremde Ansichten und empfangene Kräfte liegen im Netzwerkmodul, nicht in der eigenen Gebäudeliste. Jeder Peer wird an die explizit akzeptierte Verbindung samt Spieler-ID und Spielstandgeneration gebunden. Fremde Nachrichten können weder lokale Käufe ausführen noch das eigene Guthaben frei setzen.

Web Locks erlauben nur einen schreibenden Tab je Installation. Beim Zurückkehren aus dem Browser-Back/Forward-Cache wird neu geladen und das Lock neu erworben. Ein Profilwechsel trennt laufende Verbindungen. Ein Import erzeugt eine neue Spielstandgeneration; es werden keine Gerätestände zusammengeführt.

## Darstellung und Grenzen

Die Hauptoberfläche erhält einmal pro Sekunde einen bestätigten Snapshot. Straßen, Grundkarte und Marker sind SVG; aktive Fahrzeuge verwenden aus Routen und Zeitpunkten abgeleitete Positionen. Die Fahrzeugsymbole interpolieren ihre Bewegung in einem eigenen requestAnimationFrame-Lauf, der ausschließlich die SVG-Transformationen aktualisiert und keine React-Komplettrenderings auslöst. Reduzierte Bewegung verwendet nur bestätigte Positionsschritte. Große Spielstände werden getrennt als Logik- und Browserlast getestet; konkrete Messwerte stehen im Testbericht. Eine weitergehende Entkopplung sämtlicher statischer Oberflächenteile vom Spiel-Snapshot ist als Optimierungsgrenze dokumentiert, nicht als bereits implementierte Eigenschaft behauptet.
