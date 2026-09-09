# Vorbereitete Projektaktualisierung 2.19

Ziel: https://github.com/users/Philipp284868/projects/1

Stand: 09.09.2026. Dies ist ein lokaler Entwurf. Das Projekt wurde in dieser Arbeitsrunde nicht geändert. Die Übernahme ist erst nach bestätigter erfolgreicher CI und erneutem Lesen des aktuellen Projektinhalts vorgesehen.

## Kurzbeschreibung

Entwicklung von Leitstellen-Verbund auf der echten Deutschlandkarte. Version 2.19: kompakte Hauptleiste, einheitliche Kartensymbole, öffentliche Spielerpräsenz und verlässliche Einsatzregeln.

## Ergänzung für die Projektbeschreibung

Den folgenden Abschnitt nach erneutem Lesen in die vorhandene Beschreibung integrieren. Bestehende Beschreibung, Roadmap, Repository-Verknüpfungen, Ansichten, Statusoptionen und Automationen erhalten. Kein blindes Ersetzen der derzeit nicht lesbaren Projektbeschreibung.

### Qualitätsüberarbeitung 2.19

Die Überarbeitung konzentriert sich auf die Bedienung am PC, lesbare Karteninformationen, die gemeinsame Serverwelt und einen konsistenten Einsatzablauf. Die echte Deutschlandkarte, der serverseitige Mehrspielerstand, geschützte historische Archive sowie der vorhandene Installationsweg bleiben Grundlage des Projekts.

- **Kompakte Hauptleiste:** Die Karte nutzt den freien Bildschirm. Einsätze, Fahrzeuge, Gebäude, Funk, Kartenwerkzeuge und Spieler lassen sich gezielt öffnen. Tastaturbedienung, Escape, Fokuswiederherstellung und die Kameraposition beim Wechsel ins Hauptmenü werden berücksichtigt. Fahrzeugnamen lassen sich direkt bearbeiten; Verkäufe erfordern eine Bestätigung.
- **Einheitliche Kartensymbole:** Fahrzeugklasse und Organisation sind unterscheidbar; FMS, Störungen und Verbundfahrzeuge haben eigene Kennzeichnungen. Fahrzeuge am selben Ort bleiben über auflösbare Gruppen vollständig erreichbar. Die POI-Filter verwenden tatsächlich vorhandene Geodaten. Ein kartierter Standort ist nicht automatisch ein gekauftes Gebäude oder eine im Spiel verfügbare Kapazität.
- **Öffentliche Spielerpräsenz:** Angemeldete Spieler derselben Mehrspielerwelt werden nach ihrer Leitstelle gruppiert, mit Suche und Filtern. Mehrere Tabs zählen nur einmal. Kurze Verbindungsabbrüche sind gekennzeichnet; Widerruf, Ablauf und Abmeldung werden serverseitig verarbeitet. Ein Kartensprung ist nur bei einem tatsächlich vorhandenen Leitstellenstandort verfügbar. Private Spielstände, Einsätze, Fahrzeuge, Kontodaten und Kamerapositionen werden darüber nicht freigegeben.
- **Konsistenter Einsatzablauf:** Alarmierung, Besatzung, Ausrücken, FMS, erste Lagemeldung, Nachforderungen, Einsatzabschluss und Nachkontrolle werden zusammenhängend geprüft. Öffentliche Klinikidentität und simulierte Behandlungskapazität bleiben unterscheidbar.
- **Nachvollziehbare Qualität:** Tests und Dokumentation beschreiben den tatsächlich geprüften Stand, Migrationen und bekannte Daten- oder Plattformgrenzen. Produktionsserver werden durch diese Projektpflege nicht aktualisiert.

Die Repository-Issues bleiben die Aufgabenquelle. Erst tatsächlich abgeschlossene und geprüfte Arbeit wird als erledigt markiert; verbleibende Einschränkungen werden im zugehörigen Issue benannt. Ein Implementierungsstand allein ist keine bestätigte CI, Zusammenführung oder Produktionsbereitstellung.

## Vorgehen bei später möglichem Zugriff

1. Aktuellen Titel, Kurzbeschreibung, Hauptbeschreibung, Ansichten, Statusoptionen und verknüpfte Issues lesen.
2. Die Ergänzung mit vorhandenen Angaben abgleichen und einen vorhandenen Abschnitt zur aktuellen Qualitätsüberarbeitung aktualisieren, ohne ältere Zielvorgaben oder Roadmap zu entfernen.
3. Erst die tatsächlich bestätigten Commit-, CI- und main-Angaben übernehmen.
4. Keine Sichtbarkeit, Berechtigungen, Token-Scopes, Statusoptionen, Ansichten oder Projekt-Automationen aus diesem Entwurf ableiten oder ändern.
5. Nach dem Speichern den Inhalt erneut lesen und den tatsächlichen Projektstatus protokollieren.

## Zugriff und Nachweis

Das lokale Dokument `docs/PROJECT-EINRICHTUNG.md` beschreibt eine am 08.09.2026 geprüfte Einrichtung mit den Ansichten „Board nach Status“ und „Bereich und Priorität“ sowie Backlog, Bereit, In Arbeit, Review, Blockiert und Erledigt. Diese Angaben sind historische Dokumentation; sie wurden am 09.09.2026 nicht erneut online bestätigt.

Der zulässige Browser-Einstieg meldete `No browser is available`. Der strukturierte GraphQL-Lesezugriff erreichte HTTP 200, lieferte aber `INSUFFICIENT_SCOPES` statt Projektdaten: `read:project` fehlt. Vorhandene Scopes sind `gist`, `repo` und `workflow`. Es wurden keine Berechtigungen verändert und keine Anmeldung eingefordert. Repository-Issues können unabhängig von dieser Projekteinschränkung über den vorhandenen Repository-Zugriff gepflegt werden.
