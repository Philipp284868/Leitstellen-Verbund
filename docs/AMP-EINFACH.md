# AMP-Kurzanleitung – ab Version 2.2

**Jeder erstellt sein eigenes normales Spielerkonto direkt auf der Spielwebsite. Es gibt keine Admin-Konten und keine Einladungen mehr.** Diese Anleitung ersetzt das frühere Admin-Dateiverfahren aus Version 2.1.

Version 2.3 bietet im Hauptmenü **Einzelspieler** und **Multiplayer** mit getrennten Wachen und Guthaben. Bestehender Besitz bleibt im Multiplayer. [Alle Änderungen](VERSION-2.3.md).

## Update

In der vorhandenen Instanz bleiben Branch `main`, Node.js 24, `npm Install Type: None`, Setup `node scripts/amp-setup.mjs` und App Name `dist/server/index.js` eingestellt. Spiel stoppen, Aktualisieren, erfolgreichen Build abwarten und starten. `.env` und den dauerhaften Datenordner behalten. Keine zusätzlichen Dateien hochladen, kein SSH und kein Wechsel der Startdatei.

## Konto anlegen

Spieladresse öffnen, **Neues Konto erstellen** anklicken und Benutzername, Passwort, Anzeigename und Leitstellenname eingeben. Mit **Konto erstellen** abschließen. Auch das allererste Konto wird nur Spieler. Jeder erhält einen getrennten Spielstand mit dem regulären Startguthaben.

Benutzername: 3–32 Zeichen, Kleinbuchstaben, Ziffern, `_` und `-`; Großbuchstaben werden vereinheitlicht. Passwort: 12–128 Zeichen. Anzeigename und Leitstellenname: je 1–48 Zeichen. Bereits belegte Benutzernamen werden nicht erneut vergeben.

## Bestehende Konten

Alle bisherigen Benutzer können ihre Zugangsdaten weiterverwenden. Frühere Admin-Konten werden ohne Verlust von Besitz und Fortschritt normale Spieler. Deren alte Sitzungen werden einmalig abgemeldet. Es wird kein Konto gelöscht, kein Passwort neu gewürfelt und kein Konto `philipp` automatisch nachgebaut.

Die Datei `admin-konto.json` und frühere Hilfsdateien werden nicht mehr ausgewertet. Darin vorgenommene Änderungen ändern keine Konten mehr. Passwörter werden im angemeldeten Spiel unter Einstellungen geändert. Die alten Dateien dürfen nicht veröffentlicht werden, insbesondere wenn sie noch ein Passwort enthalten.

## Serverwartung

Die täglichen Spielaktionen benötigen keinerlei Serververwaltungsrechte. Sicherungen laufen weiterhin stündlich sowie beim sauberen Stopp. Die optionale Offline-CLI bleibt dem Serverbetreiber vorbehalten; sie verleiht keinem Spielkonto Sonderrechte. Details zu Datenpfad, HTTPS, Sicherungen und Restore: [AMP.md](AMP.md).

Dieses Update richtet keine öffentliche Internetverbindung ein. Die zuvor festgelegte Spieladresse und die dazu passende `.env` bleiben erforderlich. HTTP überträgt Anmeldedaten unverschlüsselt; HTTPS für öffentlichen Zugriff verwenden.
