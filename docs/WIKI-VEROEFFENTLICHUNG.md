# Echte Wiki veröffentlichen

Quelle: docs/wiki im Hauptrepository; einseitige Veröffentlichung aus einem konkret geprüften main-Commit. Keine gegenseitige automatische Synchronisierung. Vor Veröffentlichung Remote-Wiki klonen und fremde Änderungen vergleichen. Nur die verwalteten Seiten aktualisieren, keinen Force-Push verwenden, keine fremden Seiten entfernen.

Aktuell nachgewiesener Blocker am 08.09.2026: has_wiki=true, aber `git ls-remote https://github.com/Philipp284868/Leitstellen-Verbund.wiki.git` meldet Repository not found. Der verfügbare In-App-Browser ist nicht bei GitHub angemeldet. Es fehlt die initiale Wiki-Seite im angemeldeten GitHub-Webinterface (Repository → Wiki → Create the first page). Die fertigen Inhalte hier sind damit noch keine online veröffentlichte Wiki.

Nach Initialisierung kann das separate Wiki-Repository regulär geklont werden. Die main-only-Regel des Hauptrepositorys verändert dessen eigenen Branch nicht. Vor dem Kopieren vorhandene Inhalte vergleichen; bei abweichender fremder Arbeit manuell zusammenführen. Erst nach geprüftem main-Stand committen, normal pushen und die veröffentlichten Seiten im Browser überprüfen.
