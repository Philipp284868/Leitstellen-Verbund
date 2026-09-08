# Sicherheit

Unterstützt wird der aktuelle geprüfte main-Stand. Vor produktiven Updates Sicherungen erstellen und Migrationshinweise lesen.

Bitte Schwachstellen über den [aktivierten privaten Sicherheitsmeldeweg](https://github.com/Philipp284868/Leitstellen-Verbund/security/advisories/new) melden. Keine Spielstände, Cookies, Passwörter oder Serverprotokolle in öffentliche Issues hochladen.

Konten, Sitzungen, serverseitige Besitzprüfung, Origin-/CSRF-Prüfungen und SQLite-Bestandsschutz sind zentrale Sicherheitsgrenzen. Eine lokale Sicherungsdatei ist keine Berechtigung zur Übernahme in die Multiplayer-Wirtschaft. Abhängigkeiten kontrolliert aktualisieren; keine automatischen ungeprüften Major-Upgrades.

Dependabot-Warnungen, Secret Scanning und Push Protection sind aktiviert. Der Workflow Code-Sicherheit analysiert JavaScript/TypeScript mit CodeQL; die CI prüft Produktionsabhängigkeiten ab hohem Schweregrad. Keine automatischen Dependency-Branches oder ungeprüften Versionssprünge.
