# Echte Wiki veröffentlichen

Quelle: docs/wiki im Hauptrepository; einseitige Veröffentlichung aus einem konkret geprüften main-Commit. Keine gegenseitige automatische Synchronisierung. Vor Veröffentlichung Remote-Wiki klonen und fremde Änderungen vergleichen. Nur die verwalteten Seiten aktualisieren, keinen Force-Push verwenden, keine fremden Seiten entfernen.

Am 08.09.2026 wurde die erste Seite nach Anmeldung des Repository-Inhabers im GitHub-Webinterface angelegt. Anschließend wurde das separate Wiki-Repository geklont und der Bestand verglichen: Die einzige vorhandene Seite Home entsprach der vorbereiteten Quelle. Alle 13 Markdown-Dateien aus dem vollständig geprüften main-Commit `3445f6d74c1f487f2c188f8ce1874c5eb375b618` wurden veröffentlicht: zwölf Inhaltsseiten und die Seitennavigation.

Die [öffentliche Wiki](https://github.com/Philipp284868/Leitstellen-Verbund/wiki) ist erreichbar. Commit der Erstveröffentlichung: `71a2906` (Initialisierung: `d9e3538`). Der frühere Fehler „Repository not found“ ist behoben. Wiki-Veröffentlichung ändert weder Spielcode noch Produktivserver. Auch das separate [Entwicklungsboard](PROJECT-EINRICHTUNG.md) wurde inzwischen über die angemeldete Browsersitzung eingerichtet; fehlende ProjectsV2-API-Rechte verhindern diesen Abschluss nicht.

Nach Initialisierung kann das separate Wiki-Repository regulär geklont werden. Die main-only-Regel des Hauptrepositorys verändert dessen eigenen Branch nicht. Vor dem Kopieren vorhandene Inhalte vergleichen; bei abweichender fremder Arbeit manuell zusammenführen. Erst nach geprüftem main-Stand committen, normal pushen und die veröffentlichten Seiten im Browser überprüfen.
