# GitHub Project: eingerichtet

Am 08.09.2026 wurde [Leitstellen-Verbund – Entwicklung](https://github.com/users/Philipp284868/projects/1) über die angemeldete Browsersitzung des Inhabers eingerichtet. Das Projekt ist mit dem Repository verknüpft; Leitstellen-Verbund ist auch das Standardrepository für neue Issues aus dem Projekt. Die private Standardsichtbarkeit wurde beibehalten. Der Inhaber und ausdrücklich berechtigte Personen können das Board öffnen; die Repository-Issues bleiben unabhängig davon öffentlich erreichbar.

## Status und Ansichten

- Statusreihenfolge: Backlog, Bereit, In Arbeit, Review, Blockiert, Erledigt. Jede Option hat eine kurze Erklärung; Blockiert ist rot markiert.
- [Board nach Status](https://github.com/users/Philipp284868/projects/1/views/1): Aufgaben in Statusspalten.
- [Bereich und Priorität](https://github.com/users/Philipp284868/projects/1/views/2): Tabelle mit Labels und dauerhaft gespeichertem seitlichen Label-Filter. Die vorhandenen Labels `area:ui`, `area:server`, `area:ci`, `priority:normal`, `type:feature` und `type:maintenance` werden direkt aus den Issues verwendet. Es gibt keine zweite, unabhängig gepflegte Bereichs- oder Prioritätsangabe.
- Die vorhandene GitHub-Automatik übernimmt abgeschlossene Issues nach Erledigt. Das wurde beim Hinzufügen der bereits geschlossenen Issues #20, #21 und #26 tatsächlich beobachtet.

## Verknüpfte Aufgaben

Die tatsächlichen Repository-Issues #19 (Gesamtauftrag), #20 (PC-Multiplayer/Oberfläche), #21 (Tests/CI), #22 (GitHub-Plattform) und #26 (Rivermere/Kartensteuerung) sind einzeln verknüpft. Es wurden keine Platzhalteraufgaben, erfundenen Verantwortlichen, Termine oder Reviewfreigaben angelegt. Issues bleiben die einzige Aufgabenquelle.

## Prüfung und früheres Zugriffshindernis

Die Projektansichten, fünf Issue-Verknüpfungen, Statusreihenfolge, gespeicherten Einstellungen und der Eintrag in der Repository-Projektliste wurden im Browser kontrolliert. Die Tabellenansicht verwendet die vorhandenen Labels als Filter statt einer Gruppierung, die GitHub für Labels in Tabellen nicht anbietet.

Der frühere GraphQL-Fehler `INSUFFICIENT_SCOPES` ist kein offener Einrichtungsblocker mehr: Die Einrichtung erfolgte über die autorisierte Browsersitzung. API-Scopes wurden nicht erweitert. Eine spätere Verwaltung über GraphQL benötigt weiterhin die passenden Projects-Berechtigungen. Die Einrichtung veröffentlicht keinen stabilen Release und installiert keinen Produktionsserver.
