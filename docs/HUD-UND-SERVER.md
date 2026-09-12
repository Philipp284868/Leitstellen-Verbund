# HUD und Serverbetrieb

## Spielanwesenheit und Einnahmen

Neue Notrufe benötigen seit dieser Überarbeitung eine authentifizierte aktive Spielansicht. Anmeldung und Hauptmenü reichen nicht. Mehrere Tabs und berechtigte Disponenten derselben Leitstelle zählen getrennt. Dialoge und ausgeblendete Tabs ändern die Spielansicht nicht. Verbindungsabbruch entfernt die betreffende Sitzung; ohne erneuerte Meldung läuft ihre Freigabe spätestens nach zwei Minuten ab. Nach einem Serverstart bestehen zunächst keine Freigaben.

Bestehende Einsätze, Transporte und Weltlagen laufen weiter. Abwesenheit hält neue unabhängige Anrufe, Kampagnenangebote und Folgeanrufe zurück und erzeugt keinen Nachholschwall. Frequenz und variable Intervalle während aktiven Spiels bleiben unverändert.

Die wiederkehrende Grundfinanzierung entfällt. SQLite-Migration 21 entfernt Auszahlungstermine und bewahrt frühere Zahlungen als historische Metadaten. Guthaben, Geldjournal und gekaufte Objekte bleiben erhalten. Einmaliges Startgeld und Einsatz-/Kooperationsvergütungen bleiben bestehen. Der vorhandene Einstieg Feuerwache mit TSF-W lässt 570.000 Euro Reserve; Startpreise und Vergütungen wurden hierfür nicht angehoben.

Strukturierte Betriebsdiagnose verwendet Zeit, Stufe, Komponente, Code und Korrelations-ID. Wiederholungen werden über 30 Sekunden zusammengefasst. Es werden keine kompletten Anfrage-, Fehler- oder Save-Objekte protokolliert.

## Bedienung ab 2.25.0

Die Karte füllt den Arbeitsplatz. Links liegen umschaltbare Einsätze und Notrufe; darunter bleibt das reine Textprotokoll sichtbar. Einträge öffnen ihren Einsatz. Übernahme, Lagemeldung, Rückfrage, Nachforderung und Transportentscheidungen liegen in der Einsatzdisposition. Lesen quittiert keine Meldung. Telefon- und Signaltöne sowie eigene Audiodateien bleiben nutzbar; automatische Browser-Sprachausgabe entfällt.

Rechts neben dem Leitstellennamen öffnet **Menü** sämtliche Arbeitsbereiche: Notrufarbeitsplatz, Fuhrpark, Standortkauf/-verwaltung, AAO/FMS, Kooperation, gemeinsame Lagen/Katastrophenbereitschaft, Archiv, Fortschritt, Rangliste, Changelogs, Suche, Einstellungen, Konto, Sicherungen und Support. **Zurück zum Hauptmenü** beendet die Spielanwesenheit dieses Tabs. Welt-/Wetterlage und Katastrophenalarm bleiben getrennt ablesbar.

Das Hauptmenü enthält Spielen, Leaderboard, Changelogs, Einstellungen, Support und sichere Abmeldung. Gaminglive-Discord öffnet sich erst nach Klick. Datenschutz und Quellen sind vor der Anmeldung und unter Support erreichbar; der Betreiber muss seine tatsächlichen Verantwortlichen, Verarbeitungen und Kontaktmöglichkeiten ergänzen.

Bei Verbindungsabbruch erscheint lokal: **Serververbindung verloren. Bitte die Seite neu laden oder den Support kontaktieren.** Die Aktionen **Seite neu laden** und **Support** bleiben erreichbar. Käufe und Alarmierungen sind gesperrt. Es gibt keine Warteschlange, die später ungefragt Spielbefehle oder öffentliche Fehlerberichte absendet.

## Datenmigration und Grenzen

Vor Schemaänderungen greift die vorhandene Datenbanksicherung. Kein Weltwechsel, Datenreset oder Zurücksetzen bereits verbuchter Gelder.

- SQLite 21: alte Fördertermine entfernen, historische Förderbeträge erhalten.
- SQLite 22: Tutorial-/Übungstabellen stilllegen und private Übungsdaten entfernen; echte Konten, Käufe, Fahrzeuge, XP und Geld bleiben. Alte Tutorial-/Training-APIs antworten mit 410; veraltete Trainingskontexte dürfen keine normalen Spielaktionen ausführen.
- SQLite 23: Ereignisprotokoll und eindeutige Levelereignisse.
- SQLite 24: persönliche Leistungsbelege, einmalig gewertete Einsätze, öffentliche Leitstellenaggregate und technische Ausschlusskennzeichnung.
- SQLite 25: intern gespeicherte manuelle Fehlerberichte mit Versandstatus.

Im Textprotokoll bleiben 10.000 erledigte Einträge je Konto plus offene Meldungen gespeichert. Bereinigung erfolgt gebündelt nach 100 Änderungen, weshalb vorübergehend weitere Einträge vorhanden sein können. Der Browser hält 600 erledigte und bis zu 1.000 offene Einträge; Überlauf wird ausdrücklich angezeigt, keine fachliche Anforderung dadurch quittiert. Historie wird in unabhängigen Seiten von 100 Einträgen geladen. Das vollständige Einsatzarchiv bleibt separat erhalten. Kritische offene Meldungen stehen in einem eigenen sichtbaren Bereich.

## Leaderboard

Alle regulären Konten einschließlich Offline-Spielern erscheinen. Rangfolge: Wertungs-XP absteigend, danach Erstellungszeit und stabile Konto-ID. Historische eigene Konto-XP werden getrennt ausgewiesen. Seit 2.25 werden bestätigte Einsatz-XP gleichmäßig auf tatsächlich handelnde Disponenten verteilt; Restpunkte gehen in stabiler ID-Reihenfolge. Angenommene Notrufe, Beteiligungen und aktive Spielzeit besitzen eigene Belege. Mehrere Tabs verdoppeln keine Spielzeit. Technische Einsatzaufhebungen erzeugen keine Punkte.

Standorte, Fahrzeuge, Personal, Patientenresultate, Fahrleistung, Vergütungen und Durchschnittszeiten gehören zur gemeinsamen Leitstelle. Organisations-/Einsatztypzählung und Einsätze mit externer Unterstützung beginnen ausdrücklich mit 2.25. Fehlende ältere Messwerte werden nicht erfunden. Kontolöschung entfernt Ranglistenwerte, persönlicher Reset setzt sie zurück und erhält die technische Ausschlusskennzeichnung.

Technische/Testkonten kennzeichnet der Betreiber bei gestopptem Server über `node dist/server/cli.js leaderboard-exclude --username KONTO --excluded true`. Mit `false` wird ein reguläres Konto wieder aufgenommen. Dies ist keine Spieler-API.

## Optionale GitHub-Berichte

**Für den normalen Spielbetrieb sind keine neuen Werte erforderlich.** AMP-Startdatei, Ports, DATA_DIR, GEODATA_DIR und Proxy bleiben wie bisher.

Optional kann ausschließlich serverseitig in `.env` gesetzt werden:

```dotenv
# Fine-grained Token, ausschließlich für Philipp284868/Leitstellen-Verbund,
# Repository permission Issues: Read and write. Niemals VITE_-Variable verwenden.
GITHUB_ISSUES_TOKEN=
```

Tokenformat wird beim Start geprüft. Der Betreiber muss Repository-Auswahl und Berechtigung im GitHub-Konto korrekt begrenzen; das Format allein beweist keine Zugriffsrechte. Ohne Token zeigt Support **Direktversand nicht eingerichtet** und bietet bereinigten Download/manuellen GitHub-Weg. Eine leere Variable deaktiviert den Direktversand.

Ablauf: Angaben eingeben → bereinigte Vorschau intern speichern → Vorschau prüfen → ausdrückliche Zustimmung → öffentlich veröffentlichen → bestätigten Issue-Link anzeigen. Nur Spielversion und Kartentyp werden auf Wunsch automatisch beigefügt. Lokale Diagnose enthält keine Konto-/Standortdaten. Es gibt keine automatische Screenshot-/Log-/Save-Übertragung. Sicherheitslücken gehören in die private GitHub-Sicherheitsmeldung bzw. an den Betreiber.

Begrenzung: 10 gespeicherte Berichte pro Konto, 200 insgesamt, 30 Tage Aufbewahrung. Gleicher bereinigter Inhalt erhält dieselbe Berichts-ID. Maximal fünf ausdrückliche Sendeversuche. 403/429 erhalten eine Wartezeit; Timeout/5xx oder Neustart während des Versands führen zum unklaren Status. Dann wird bei ausdrücklicher erneuter Aktion zuerst auf GitHub anhand der Berichts-ID abgeglichen. Ein fehlender Treffer beweist keinen fehlgeschlagenen Versand: es erfolgt kein zweites blindes POST. Falls der Abgleich keinen bestätigten Treffer liefert, bleiben Betreiberprüfung bzw. bewusster manueller Meldeweg notwendig. Es gibt keine automatische öffentliche Wiederholung.

Grundlage: [GitHub Issues API](https://docs.github.com/en/rest/issues/issues) und [Fine-grained permissions](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens). Token niemals in Frontend, Freigaben, Screenshots oder Projektartefakte kopieren.

## Karte und Changelogs

Die bestehende lokale OpenMapTiles-/DEM-Pipeline bleibt bestehen. Tatsächlich vorhandene Attribute `class`, `subclass`, `brunnel` und `layer` steuern Schienen, Straßenbahn, Bahnsteige, Straßenklassen und gestaffelte Brücken/Tunnel. Zeichnungsreihenfolge folgt den Ebenen; sie erzeugt keine neuen befahrbaren Kreuzungen. Das Routing verwendet weiterhin den tatsächlichen GraphHopper-Graphen.

Allgemeine POIs und Spieler-/Personal-Pins werden nicht geladen oder gezeichnet. Kaufbare und eigene reale Einrichtungen, berechtigte Einsatzfahrzeuge, Einsätze und relevante Routen bleiben. Kein freies Bauen/Verschieben. Gelände, Gebäude und Namen sind Kartengeometrie, keine dekorativen POI-Pins. Abdeckung und Alter folgen dem installierten Datenpaket; fehlende OSM-Angaben werden nicht ergänzt. Attribution bleibt an der Karte.

`CHANGELOG.md` ist die Quelle für den ausgelieferten Versionsverlauf und Release-Notizen. Der Build erzeugt `changelog.json`; Suche und Versionenauswahl laden diese lokale Datei bedarfsgerecht. Historische Einträge ohne Datum bleiben undatiert. HTML wird als Text behandelt, nicht ausgeführt. Die CI verlangt Änderungsnotizen für funktionale Änderungen; reine Wartung kann eine mindestens 80 Zeichen lange konkrete Begründung in einer mitgeänderten `docs/CHANGELOG-AUSNAHME.md` verwenden.

## AMP-Diagnose

Spielserverausgaben erfolgen als strukturierte JSON-Zeilen auf stdout/stderr mit Zeit, Stufe, Komponente, Code und Korrelations-ID. Beispiele: DATABASE_READY, SERVER_READY, PLAY_ENTER/LEAVE/DISCONNECTED, CALLS_SUPPRESSED_ABSENT, ROUTING_REQUEST_FAILED, BACKUP_FAILED und REPORT_SENT/UNCERTAIN. Wiederholungen innerhalb 30 Sekunden werden gezählt und beim nächsten Eintrag zusammengefasst. Keine Zeile pro Fahrzeug oder Tick; kein Debugmodus als Standard. Berichtstexte, Tokens, Cookies, kompletten Fehlerobjekte und Save-Dumps werden nicht ausgegeben.

Der bereits vorhandene Start-/Setup-Prozess und GraphHoppers Java-Lebenszyklus liefern zusätzlich ihre eigenen Betriebszeilen. Die Routine-Zugriffsprotokolle des Routers bleiben abgeschaltet; Warnungen, Fehler und Start/Stop bleiben sichtbar. Es werden keine zusätzlichen dauerhaften Logdateien durch die neue Diagnose erzeugt. Aufbewahrung und Rotation der AMP-Konsole verwaltet der Betreiber in AMP. Lokale Testberichte sind keine Produktionslogs.

Eine private AMP-Installation wird durch einen Git-Push nicht aktualisiert. Update und Wiederanlauf erfolgen ausdrücklich durch den Betreiber nach dessen Sicherungsablauf.

Lokale technische Diagnose speichert höchstens 100 Zeit-/Fehlercode-Einträge im Arbeitsspeicher des Tabs. Wiederholungen innerhalb 30 Sekunden werden gezählt. Keine Rohfehler, Stacktraces, Adressen oder Eingaben werden erfasst; ein Export erfolgt nur durch den Spieler. Schließen/Neuladen des Tabs verwirft diesen lokalen Puffer. Die öffentliche Berichtsvorschau ergänzt ausschließlich die darin sichtbaren Versions-/Kartenangaben, keine automatische Konsolenübertragung.
