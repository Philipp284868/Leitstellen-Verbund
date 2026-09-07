# Leitstellen-Verbund – eigener AMP-Server

## Version 2.8.0: Dynamische Einsatzlagen (Phase 2)

Neue Einsätze entwickeln jetzt Gefahren, Brände und einzelne Patienten. Kräfte vor Ort, taktische Entscheidungen und Verzögerungen beeinflussen Eskalation, Nachforderungen, Versorgung und Abschluss. Seltene Folgeereignisse bleiben begrenzt und der eigenen Leitstelle zugeordnet. Simuliertes Wetter, Verkehr, tatsächliche Straßensperren und reparierbare Fahrzeugdefekte verändern Fahrten und Ressourcenverfügbarkeit.

Die neue Lageansicht erscheint nach Erkundung; Patientenverläufe und Gefahren bleiben auch im Archiv erhalten. **Migration auf Schema 7:** vorhandene laufende Einsätze bleiben ohne nachträglich hinzugefügte Gefahren fortsetzbar; die Dynamik beginnt mit neuen Einsätzen. Keine neuen Umgebungsvariablen erforderlich.

[Bedienung und technische Grenzen](docs/PHASE-2.md) · [Testbericht Phase 2](docs/PHASE-2-TESTBERICHT.md).

## Version 2.7.0: Interaktiver Leitstellenablauf (Phase 1)

Neue Ereignisse beginnen als Notruf. Ort und Meldebild erfragen, eine eigene AAO anwenden oder frei disponieren, Alarmierungsart wählen und Ausrücken sowie FMS verfolgen. Nach der ersten Lagemeldung können weitere Kräfte nötig werden. Der Verlauf bleibt im Einsatz und anschließend im Archiv erhalten. DME, Sirene und Wachalarm nutzen unterschiedliche Ausrückzeiten und die vorhandene Audioinfrastruktur.

**Multiplayer-Regel geändert:** Neue Einsätze bleiben innerhalb der eigenen Leitstelle. Unter **Freunde** können bestehende Benutzer nach ausdrücklicher Einladung und Annahme denselben Leitstellenbestand disponieren. Einzelspieler und der persönliche bisherige Multiplayerbestand bleiben getrennt erhalten. Nachbarleitstellen-Anfragen gehören zur späteren Phase 3.

[Bedienung, Migration auf Schema 6, Tests und Abgrenzung](docs/PHASE-1.md).

## Version 2.6.0: Große Region und feste Echtzeit

Die Karte wächst auf die 16-fache Fläche: 62,4 × 40,8 km, zehn zusätzliche Orte und ein verbundenes Netz geschwungener Landstraßen. Die bisherige Stadt bleibt unverändert an ihrem Platz. Gesamte Region, Ortsauswahl und Rücksprung zu den eigenen Wachen erleichtern die Orientierung. Einsätze entstehen im Umkreis von bis zu 7,2 km um passende eigene Wachen; das Limit von zwei Einsätzen bleibt bestehen.

Der Server läuft in beiden Modi fest in Echtzeit. Die Tempowahl entfällt. Alarmierung und Verbundhilfe zeigen Fahrweg und voraussichtliche Fahrzeit; die Fahrtenübersicht zeigt Restkilometer, Zeit bis Ziel und Fortschritt. [Bedienung, Datenübernahme und Grenzen](docs/VERSION-2.6.md).

## Musik und Spielsound

Die eigene Hintergrundmusik „Nachtschicht“ und dezente Ereignisklänge begleiten die Leitstelle. Musik und Effekte sind einzeln regelbar; der Lautsprecher schaltet alles stumm. Der Ton startet nach Interaktion und pausiert in inaktiven Tabs. Keine externen Audiodienste oder Downloads notwendig. [Klang, Bedienung und Update](docs/AUDIO.md).

## Natürlich gewachsene Region statt Straßenraster

Die Spielkarte besitzt ein vollständig neues, geschwungenes Straßennetz: Altstadt, Wohnviertel, Dörfer, Felder, Wald und Seeufer. Fahrzeuge nutzen die dargestellten Straßen. Vorhandene Standorte und laufende Fahrten werden mit einer vorherigen Sicherung auf die neue Karte übertragen. [Karte und Update auf Schema 4](docs/VERSION-2.4.md).

Einzelspieler und Multiplayer haben jeweils eigene Spielstände. Vorhandener Besitz bleibt im Multiplayer. Seit 2.7 bleiben neue Multiplayer-Einsätze und Wachen für unabhängige Leitstellen privat. Maximal zwei eigene offene Einsätze und unregelmäßige Abstände von 90–210 echten Sekunden sorgen für einen ruhigeren Ablauf. [Änderungen und Updatehinweise](docs/VERSION-2.3.md).

## Freie Registrierung, ausschließlich normale Spieler

Jeder Besucher kann über **Neues Konto erstellen** einen Benutzernamen, ein Passwort, einen Anzeigenamen und einen Leitstellennamen festlegen. Kein Einladungscode, keine Freigabe und kein externes Konto. Auch das erste registrierte Konto erhält ausschließlich normale Spielerrechte. Bestehende Administratoren werden beim ersten Start nach dem Update automatisch in normale Spieler umgewandelt: Kontokennung, Passwort-Hash, Wachen, Fahrzeuge, Geld und Fortschritt bleiben erhalten. Frühere Admin-Sitzungen werden einmalig widerrufen; anschließend mit den bisherigen Zugangsdaten neu anmelden.

Die automatische Admin-Erstellung, der Adminbereich, alle `/api/admin/*`-Funktionen, Registrierungseinladungen und die Verarbeitung von `admin-konto.json` sind entfernt. Alte lokale Admin-Dateien werden ignoriert und nicht über HTTP ausgeliefert. Sie dürfen weiterhin nicht veröffentlicht werden; darin verbliebene Klartextpasswörter nach Sicherung der eigenen Zugangsdaten privat entfernen.

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

Die Migration von Schema 1 auf 2 sichert vor der Migration eine konsistente `pre-migration-v2-*.sqlite`, entfernt nur Sonderrechte und alte Einladungen, verhindert neue Adminrollen durch Datenbankregeln und übernimmt alle Spielstände unverändert. Schema 3 ergänzt getrennte Einzelspielerstände mit eigener Sicherung vor der Migration. Schema 4 übernimmt anschließend die Koordinaten beider Spielwelten auf die neue Karte. Schema 5 übernimmt alte Tempi in beiden Modi als feste Echtzeit; aktive Termine und Besitz bleiben erhalten. Schema 6 ergänzt Notrufe, AAO, Funkstatus, Historien sowie berechtigte Leitstellenmitglieder. Alte Einsätze werden mit ihren bestehenden Aufträgen übernommen; ungenutzte alte automatische Freigaben werden geschlossen. Kein älteres Programm gegen die aktuelle Datenbank starten. Ein Rollback erfordert passende alte Software und passende Sicherung zusammen. Die frühere Rolle bleibt nur in historischen Backups erhalten, nicht im laufenden Spiel.

Automatische Datenbanksicherungen stündlich und beim sauberen Stoppen bleiben erhalten. Serverwartung erfolgt ausschließlich mit Serverzugriff in AMP beziehungsweise über die optionale Offline-CLI, niemals über privilegierte Spielkonten. Keine Verwaltungsrechte werden an normale Spieler weitergereicht.

Passwörter bleiben gesalzen mit scrypt gehasht, Sitzungen widerrufbar. Origin-/CSRF-Prüfungen, Eingabevalidierung sowie dauerhafte Anmelde- und Registrierungsratenlimits bleiben aktiv. Ein erster Grundschutz gegen massenhafte Registrierungen ist vorhanden, keine Garantie gegen verteilten Missbrauch. Für öffentlichen Betrieb HTTPS verwenden. Diese Registrierungserweiterung ändert weder Router-/DNS-/TLS-Konfiguration noch die bestehenden Einschränkungen beim HTTP-Browserbetrieb.

## Entwicklung und Tests

Node.js 24 und die festgelegte pnpm-Version aus `package.json` verwenden. `node scripts/amp-setup.mjs` installiert ohne globales pnpm reproduzierbar und baut `dist/server/index.js`, `dist/server/cli.js` und `dist/client`. `node_modules` wird zur Laufzeit benötigt.

Die Befehle `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` und `pnpm test:e2e` prüfen den tatsächlichen Stand. Die vorhandene Engine-, Speicher-, Server-, Sicherheits- und Browserabnahme bleibt erhalten und wird an freie Registrierung angepasst. Neue Prüfungen decken Migration mit Besitzbewahrung, ausbleibendes Bootstrap, fremde Rollenfelder, doppelte Namen, abgeschaltete Admin-Endpunkte und begrenzte offene Registrierung ab. Maßgeblich sind die CI-Ergebnisse des jeweiligen Commits; historische Testberichte gelten nicht automatisch für 2.2.

[AMP-Kurzanleitung](docs/AMP-EINFACH.md) · [Betrieb, Daten, HTTPS und Wiederherstellung](docs/AMP.md) · [Gemeinsam spielen](docs/MULTIPLAYER.md) · [Spielanleitung](docs/SPIELANLEITUNG.md)
