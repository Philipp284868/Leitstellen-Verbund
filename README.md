# Leitstellen-Verbund – eigener AMP-Server

## Version 2.4.0: natürlich gewachsene Region statt Straßenraster

Die Spielkarte besitzt ein vollständig neues, geschwungenes Straßennetz: Altstadt, Wohnviertel, Dörfer, Felder, Wald und Seeufer. Fahrzeuge nutzen die dargestellten Straßen. Vorhandene Standorte und laufende Fahrten werden mit einer vorherigen Sicherung auf die neue Karte übertragen. [Karte und Update auf Schema 4](docs/VERSION-2.4.md).

Einzelspieler und Multiplayer haben jeweils eigene Spielstände. Vorhandener Besitz bleibt im Multiplayer. Neue Multiplayer-Einsätze werden automatisch geteilt, Wachen bleiben sichtbar. Maximal zwei eigene offene Einsätze und unregelmäßige Abstände von 90–210 echten Sekunden sorgen für einen ruhigeren Ablauf. [Änderungen und Updatehinweise](docs/VERSION-2.3.md).

## Freie Registrierung, ausschließlich normale Spieler

Jeder Besucher kann über **Neues Konto erstellen** einen Benutzernamen, ein Passwort, einen Anzeigenamen und einen Leitstellennamen festlegen. Kein Einladungscode, keine Freigabe und kein externes Konto. Auch das erste registrierte Konto erhält ausschließlich normale Spielerrechte. Bestehende Administratoren werden beim ersten Start nach dem Update automatisch in normale Spieler umgewandelt: Kontokennung, Passwort-Hash, Wachen, Fahrzeuge, Geld und Fortschritt bleiben erhalten. Frühere Admin-Sitzungen werden einmalig widerrufen; anschließend mit den bisherigen Zugangsdaten neu anmelden.

Die automatische Admin-Erstellung, der Adminbereich, alle `/api/admin/*`-Funktionen, Einladungen und die Verarbeitung von `admin-konto.json` sind entfernt. Alte lokale Admin-Dateien werden ignoriert und nicht über HTTP ausgeliefert. Sie dürfen weiterhin nicht veröffentlicht werden; darin verbliebene Klartextpasswörter nach Sicherung der eigenen Zugangsdaten privat entfernen.

Die vorhandene Karte, acht Gebäudetypen, 20 Fahrzeugtypen, 40 Einsätze, Personal, Ausbildung, Patienten, Wirtschaft und gemeinsames Spielen bleiben bestehen. Node.js verwaltet SQLite und die Simulation auch bei geschlossenem Browser. Es wird kein dauerhafter Spielserver durch einen Spielerbrowser ersetzt.

## In AMP aktualisieren

Branch **main** für den Spielserver, **dev** für Entwicklung. Es werden keine zusätzlichen dauerhaften Branches benötigt.

| Einstellung | Wert |
| --- | --- |
| Node.js Release Stream | 24 |
| Node.js Version | leer |
| npm Install Type | None |
| Run App Setup Commands | aktiviert |
| App Setup Commands | `node scripts/amp-setup.mjs` |
| App Name | `dist/server/index.js` |
| App Installation Location | leer |
| Run App Pre-start Commands | deaktiviert |

Stoppen → Aktualisieren → erfolgreichen Build abwarten → Start. Vorhandene `.env` und den dauerhaften Datenordner nicht löschen. Keine neue Konfigurationsdatei und keine einmalige Startdatei notwendig. Nach dem Start Browser neu laden und **Neues Konto erstellen** wählen oder das bestehende Konto verwenden.

## Daten und Betrieb

Die Migration von Schema 1 auf 2 sichert vor der Migration eine konsistente `pre-migration-v2-*.sqlite`, entfernt nur Sonderrechte und alte Einladungen, verhindert neue Adminrollen durch Datenbankregeln und übernimmt alle Spielstände unverändert. Schema 3 ergänzt getrennte Einzelspielerstände mit eigener Sicherung vor der Migration. Schema 4 übernimmt anschließend die Koordinaten beider Spielwelten auf die neue Karte. Kein älteres Programm gegen die aktuelle Datenbank starten. Ein Rollback erfordert passende alte Software und passende Sicherung zusammen. Die frühere Rolle bleibt nur in historischen Backups erhalten, nicht im laufenden Spiel.

Automatische Datenbanksicherungen stündlich und beim sauberen Stoppen bleiben erhalten. Serverwartung erfolgt ausschließlich mit Serverzugriff in AMP beziehungsweise über die optionale Offline-CLI, niemals über privilegierte Spielkonten. Keine Verwaltungsrechte werden an normale Spieler weitergereicht.

Passwörter bleiben gesalzen mit scrypt gehasht, Sitzungen widerrufbar. Origin-/CSRF-Prüfungen, Eingabevalidierung sowie dauerhafte Anmelde- und Registrierungsratenlimits bleiben aktiv. Ein erster Grundschutz gegen massenhafte Registrierungen ist vorhanden, keine Garantie gegen verteilten Missbrauch. Für öffentlichen Betrieb HTTPS verwenden. Diese Registrierungserweiterung ändert weder Router-/DNS-/TLS-Konfiguration noch die bestehenden Einschränkungen beim HTTP-Browserbetrieb.

## Entwicklung und Tests

Node.js 24 und die festgelegte pnpm-Version aus `package.json` verwenden. `node scripts/amp-setup.mjs` installiert ohne globales pnpm reproduzierbar und baut `dist/server/index.js`, `dist/server/cli.js` und `dist/client`. `node_modules` wird zur Laufzeit benötigt.

Die Befehle `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` und `pnpm test:e2e` prüfen den tatsächlichen Stand. Die vorhandene Engine-, Speicher-, Server-, Sicherheits- und Browserabnahme bleibt erhalten und wird an freie Registrierung angepasst. Neue Prüfungen decken Migration mit Besitzbewahrung, ausbleibendes Bootstrap, fremde Rollenfelder, doppelte Namen, abgeschaltete Admin-Endpunkte und begrenzte offene Registrierung ab. Maßgeblich sind die CI-Ergebnisse des jeweiligen Commits; historische Testberichte gelten nicht automatisch für 2.2.

[AMP-Kurzanleitung](docs/AMP-EINFACH.md) · [Betrieb, Daten, HTTPS und Wiederherstellung](docs/AMP.md) · [Gemeinsam spielen](docs/MULTIPLAYER.md) · [Spielanleitung](docs/SPIELANLEITUNG.md)
