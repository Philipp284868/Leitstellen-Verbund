# AMP-Kurzanleitung · Version 2.21

**Jeder erstellt sein eigenes normales Spielerkonto direkt auf der Spielwebsite. Es gibt keine Admin-Konten und keine Einladungen mehr.** Diese Anleitung ersetzt das frühere Admin-Dateiverfahren aus Version 2.1.

Aktuell ist PC-Multiplayer der einzige normale Spielmodus; ein einzelner Spieler darf allein auf dem Server disponieren. Das persönliche Tutorial kann eine getrennte Übungswelt mit eigenem Budget verwenden. Alte Einzelspielerstände bleiben inaktive Archive. [Aktuelle Spielanleitung](SPIELANLEITUNG.md) · [Tutorial](TUTORIAL-2.21.md).

## Update

Eine Deutschland-Instanz verwendet Branch `main`, Node.js 24, `npm Install Type: None`, Setup `node scripts/install-germany.mjs` und App Name `scripts/start-germany.mjs`. Vorhandenes Rivermere behält Setup `node scripts/amp-setup.mjs` und App Name `dist/server/index.js`. Spiel stoppen, konsistent sichern, konkret geprüften Stand aktualisieren und erfolgreichen Build abwarten. `.env.germany` beziehungsweise `.env` und dauerhafte Datenordner behalten. [Neue Deutschland-Instanz](AMP-NEUINSTALLATION.md).

Vor dem ersten Start mit 2.21 ist eine schreibgeschützte Migrationsvorschau möglich. Der reguläre Start sichert die bisherige SQLite-Datei und migriert auf Schema 14: exakte Eurocent, separater einmaliger Kaufkraftausgleich, automatische Wachbesetzung und persönliche Tutorialtabellen. Bestehende XP, Orte, Fahrzeuge und laufende Bindungen bleiben geschützt. Keine Daten löschen. Genaue CLI-Befehle einschließlich Deutschland-Routervoraussetzung: [AMP-Migration](AMP.md#update-und-migration-auf-schema-14).

## Konto anlegen

Spieladresse öffnen, **Neues Konto erstellen** anklicken und Benutzername, Passwort, Anzeigename und Leitstellenname eingeben. Mit **Konto erstellen** abschließen. Auch das allererste Konto wird nur Spieler. Neue normale Leitstellen erhalten 1.400.000,00 € Startbudget; Besetzung ist in fertigen Wachen enthalten. [Wirtschaft und Bestandsschutz](EURO-WIRTSCHAFT.md).

Benutzername: 3–32 Zeichen, Kleinbuchstaben, Ziffern, `_` und `-`; Großbuchstaben werden vereinheitlicht. Passwort: 12–128 Zeichen. Anzeigename und Leitstellenname: je 1–48 Zeichen. Bereits belegte Benutzernamen werden nicht erneut vergeben.

## Bestehende Konten

Alle bisherigen Benutzer können ihre Zugangsdaten weiterverwenden. Frühere Admin-Konten werden ohne Verlust von Besitz und Fortschritt normale Spieler. Deren alte Sitzungen werden einmalig abgemeldet. Es wird kein Konto gelöscht, kein Passwort neu gewürfelt und kein Konto `philipp` automatisch nachgebaut.

Die Datei `admin-konto.json` und frühere Hilfsdateien werden nicht mehr ausgewertet. Darin vorgenommene Änderungen ändern keine Konten mehr. Passwörter werden in der Kontoverwaltung geändert, erreichbar über **Einstellungen → Hinweise & Hilfe → Konto & Sicherheit**. Die alten Dateien dürfen nicht veröffentlicht werden, insbesondere wenn sie noch ein Passwort enthalten.

## Serverwartung

Die täglichen Spielaktionen benötigen keinerlei Serververwaltungsrechte. Sicherungen laufen weiterhin stündlich sowie beim sauberen Stopp. Die optionale Offline-CLI bleibt dem Serverbetreiber vorbehalten; sie verleiht keinem Spielkonto Sonderrechte. Details zu Datenpfad, HTTPS, Sicherungen und Restore: [AMP.md](AMP.md).

Dieses Update richtet keine öffentliche Internetverbindung ein. Die zuvor festgelegte Spieladresse und die dazu passende `.env` bleiben erforderlich. HTTP überträgt Anmeldedaten unverschlüsselt; HTTPS für öffentlichen Zugriff verwenden.
