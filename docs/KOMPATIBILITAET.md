# Begrenzte Datenbrücken

Deutschland (`germany-1`) ist die einzige laufende Welt. Alte Weltformate werden erkannt, aber ihre fiktiven Koordinaten nicht in deutsche Standorte umgerechnet.

| Format | Zweck und Verhalten | Prüfung | Entfernung möglich, wenn |
|---|---|---|---|
| Falkenried 1/2 und Rivermere 1 in SQLite | Schreibgeschützte Identifikation und vollständiger Export der Datenbank; keine neue Simulation | `save-compatibility.test.ts`, `server-security.test.ts` | Betreiberbestände exportiert sind und der dokumentierte Exportzeitraum beendet ist |
| Falkenried-/Rivermere-JSON | Klare Ablehnung vor Import in Deutschland; Quelldatei bleibt erhalten | `save-compatibility.test.ts` | Keine unterstützten Altarchive mehr übernommen werden müssen |
| Frühere Deutschland-Schemata bis Schema 18 | Versionierte, transaktionale Migration einschließlich Geld, Besitz, Tutorial und Personal | Wirtschafts-, Besetzungs-, Wiederherstellungs- und Archivtests | Nach explizit angekündigtem Ende der jeweiligen Quellversion |
| Inaktive frühere Einzelspielerbestände derselben gültigen Welt | Eigener Archivexport, keine aktive Einzelspielersimulation und kein Wirtschaftsimport | `modes.test.ts`, `economy-migration.test.ts` | Bestände exportiert und Unterstützung ausdrücklich beendet ist |
| Frühere Klinikpräferenz `public` | Beim Lesen auf die erste bestätigte öffentliche Klinik beziehen; neue Auswahl speichert die stabile OSM-Kennung | `hospital-preference.test.ts`, `mutual-aid.spec.ts` | Keine gespeicherte pauschale Präferenz mehr vorhanden ist |
| Alter Offline-Serviceworker | `public/sw.js` löscht ausschließlich alte eigene Offline-Caches und meldet sich ab; kein Offline-Spiel | `offline-policy.test.ts` | Unterstützte Browserbestände den Übergang vollständig durchlaufen haben |
| Frühere Fahrbewegungen ohne abschnittsweise Beschleunigung | Bestehenden Weg zu Ende lesen, keine Teleportation oder neue fiktive Route | `progression-motion.test.ts`, `realtime.test.ts` | Keine gespeicherten alten Fahrten mehr vorhanden sind |

## Weltkonflikt ohne Datenverlust sichern

Anwendung zuerst stoppen. Die neue CLI kann einen alten SQLite-Stand **ohne Deutschland-Geodaten oder Änderung der Quelle** exportieren:

```text
node dist/server/cli.js retired-export --source /ABSOLUTER/ALTER/DATENORDNER --file /ABSOLUTER/SICHERUNGSORDNER/altbestand.sqlite
```

Die Zieldatei muss neu sein. Der Export erhält Konten, Guthaben, XP, Besitz, Historie, aktive Aufgaben und alle weiteren Tabellen. Er eröffnet keine Deutschlandwelt und erstellt keine willkürliche Standortzuordnung. Einen solchen Export nur mit dem historischen, dazu passenden Programm lesen; historische Quellstände bleiben über [die Historie](HISTORIE.md) erreichbar.

Der normale Start prüft SQLite-Kopf, Schema, Welt- und Datensatzkennung vor schreibender Öffnung. Ein zukünftiges Schema, alte Welt oder fremder Datensatz führt zu einem konkreten Fehler. `.env`, alte Datenordner und Sicherungen werden weder durch Build noch durch Push zurückgesetzt. Für Deutschland einen ausdrücklich gewählten getrennten externen Datenordner verwenden. Fehlende Pfade oder Karten führen zu einer Fehlermeldung und nicht zu einer stillen Ersatzwelt.

Die bestehenden Deutschland-Migrationen bleiben in der Datenbankverwaltung; ausschließlich die Welt-Erkennung und der Altweltexport liegen in `src/compatibility/` und `server/compatibility/`. Änderungen daran benötigen erneut die vollständige Abnahme.
