# Verbindungskorrektur 2.2.2

## Fehlerbild

Die Website und Anmeldung können funktionieren, während `/socket.io/?EIO=4&transport=polling` mit 403 antwortet. Ein gewöhnlicher HTTP-Ursprung außerhalb von localhost ist kein sicherer Browserkontext: Der erste Polling-GET kann sowohl ohne Origin als auch ohne Fetch-Metadata ankommen. Die bestehende serverseitige Prüfung lehnt das ab.

Der Client baut deshalb jetzt zuerst eine WebSocket-Verbindung auf. Browser senden dabei den tatsächlichen Origin. Die unveränderte Serverprüfung kontrolliert weiterhin die konfigurierte PUBLIC_URL; Sitzungs-Cookie und CSRF-Nachweis bleiben erforderlich. Bei verfügbaren kompatiblen Voraussetzungen bleibt Polling als nachgeordneter Transport erhalten. Es werden keine fremden Ursprünge, anonymen Spieler oder beliebigen HTTP-Anfragen freigegeben.

Der Knopf „Server erneut verbinden“ aktualisiert weiterhin den Kontostand und den CSRF-Wert, verbindet nun aber auch einen bereits vorhandenen getrennten Socket erneut.

Serveraktionen erzeugen ihre eindeutigen IDs über `src/ids.ts`. Bei fehlendem `crypto.randomUUID` wird UUID v4 aus `crypto.getRandomValues` erzeugt. Kein Math.random, keine Änderung an Kennwörtern oder Sitzungstoken. Ohne sichere Zufallsquelle wird die Aktion abgelehnt. Die Datenbank, sämtliche Serverdateien und der Resetablauf bleiben unverändert.

## AMP-Update

`main` aktualisieren: Spiel stoppen → Aktualisieren → erfolgreichen Build abwarten → normal starten. App Name bleibt `dist/server/index.js`, App Command Line Arguments müssen leer sein. Anschließend alle geöffneten Spielseiten neu laden, bei Bedarf Strg+F5. Keinen weiteren Reset ausführen.

Die bestehende `.env` bleibt erhalten. PUBLIC_URL muss exakt der verwendeten Spieladresse mit Schema und gegebenenfalls Port entsprechen. Eine falsche PUBLIC_URL führt weiterhin absichtlich zur Ablehnung. Keine Firewall- oder DNS-Änderungen werden durch dieses Update vorgenommen.

Die Kennzeichnung „VERSION 2.0“ auf dem bisherigen Startbildschirm ist noch ein statischer Oberflächentext, kein zuverlässiger Nachweis des installierten Commits. Prüfe stattdessen package.json (2.2.2) und den erfolgreichen AMP-Build.

## Grenzen und Abnahme

HTTP und unverschlüsseltes WebSocket schützen keine Passwörter oder Sitzungen auf dem Transportweg. Diese Kompatibilitätskorrektur ist keine HTTPS-Einrichtung; für öffentlichen Betrieb bleibt HTTPS empfohlen. Der Server wird nicht auf HTTP umkonfiguriert.

Die neue Playwright-Abnahme benutzt einen echten lokalen Nicht-Loopback-HTTP-Ursprung ohne deaktivierte Browsersicherheitsfunktionen. Sie prüft zwei unabhängige Registrierungen, sichere Aktions-IDs trotz fehlendem randomUUID, WebSocket mit korrektem Origin, Wachenbau, getrenntes Guthaben, Chat und manuellen Wiederaufbau. Eine headerlose Polling-Anfrage muss weiterhin 403 erhalten. Die bestehenden Tests für falsche Origins, Sitzungen und CSRF bleiben unverändert.

Testerfolge gelten erst nach dem tatsächlichen CI-Lauf des jeweiligen Commits. Die isolierte Browserprüfung ist kein Test des privaten AMP-Servers oder der öffentlichen Domain.

Die Änderung betrifft die Live-Verbindung und Serveraktionen. Der direkte Spielstandexport vom Server bleibt erhalten. Die älteren freiwilligen lokalen Browser-Sicherungspfade sind nicht Bestandteil dieser Korrektur und verwenden teilweise weiterhin randomUUID.
