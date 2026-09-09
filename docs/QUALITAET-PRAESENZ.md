# Öffentliche Spielerpräsenz und Qualitätssicherung

## Ausgangslage und Trennung

Der bisherige private Socket-Snapshot übertrug die eigene Leitstelle und ausdrücklich berechtigte Unterstützung. Er war keine Liste aller anwesenden Spieler. Die neue Präsenz wird unabhängig davon als `presence`-Ereignis übertragen. `Game.view`, private Einsätze und die Berechtigungen für Spielaktionen werden dafür nicht geöffnet.

Die öffentliche Liste umfasst alle authentifizierten, verbundenen Spielerkonten derselben Serverinstanz und Spielwelt. Ein Konto zählt auch bei mehreren Browser-Tabs nur einmal. Mitglieder einer gemeinsamen Leitstelle werden zusammengefasst und behalten ihren eigenen öffentlichen Anzeigenamen. Konten ohne verbundenen Browser erscheinen nicht als online; nach einer unterbrochenen Verbindung bleibt der letzte Eintrag maximal acht Sekunden ausdrücklich mit „Verbindet neu“ sichtbar. Abmeldung, Sitzungswiderruf und Ablauf entfernen den betreffenden Eintrag ohne diese Schonfrist, sofern keine weitere gültige Verbindung desselben Kontos besteht.

## Datenmodell und Standort

`PublicPlayer` in `src/presence.ts` ist eine strikte Positivliste:

| Feld                 | Inhalt                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `id`                 | Öffentliche Spielerkonto-ID; kein Sitzungstoken                                                               |
| `name`               | Öffentlicher Anzeigename aus dem persönlichen Spielprofil                                                     |
| `deskId`, `deskName` | Tatsächlich zugewiesene Leitstelle, einschließlich bestehender Mitgliedschaft                                 |
| `status`             | `online` oder `reconnecting`                                                                                  |
| `location`           | Erster eigener Wachenstandort der zugewiesenen Leitstelle, mit Kartenkoordinaten und Wachenname; sonst `null` |

Der Standort ist ein gewählter Standort im Spiel. Krankenhäuser und Schulen sind keine Wachenposition für die öffentliche Präsenz. Es werden keine vollständigen Gebäudeobjekte, Gebäude-IDs oder Ausbaustufen ausgegeben. Es gibt keine erfundenen Koordinaten, Browser-/IP-Ortung, reale Privatadressen oder Synchronisierung der Kamera.

`server/presence.ts` lässt SQLite ausschließlich diese Felder aus den bestehenden, gültigen Spielständen projizieren. Es lädt oder serialisiert keinen vollständigen privaten `Save`. Die kleine öffentliche Projektion wird bei neu verbundenen Konten und erfolgreichen Serveraktionen aktualisiert. Normale Simulationsticks verwenden diese Projektion weiter und gleichen Sitzungsstatus und Änderungen ab. Dadurch müssen umfangreiche private Spielstände nicht allein für die Spielerliste in jedem Tick erneut geparst werden.

Es ist keine Datenbankmigration nötig. Präsenz ist flüchtig und wird nach Serverneustart aus gültigen Verbindungen und vorhandenen Konten/Leitstellen neu aufgebaut. Spielstände, Konten und archivierte Einzelspielerstände bleiben in ihren vorhandenen Speichern.

## Übertragung und Rechte

Das Protokoll `lv-presence-1` enthält eine Weltkennung, eine zufällige Kennung des Serverlaufs, monotone Revisionen sowie vollständige oder inkrementelle Änderungen. Pro Nachrichtenblock werden höchstens 128 geänderte oder entfernte Einträge übertragen; die Gesamtzahl ist nicht auf 128 beschränkt. Ein vollständiger Zustand mit mehreren Blöcken wird im Client erst nach erfolgreichem Abschluss sichtbar. Fehlende, doppelte, fremdweltige oder strukturell unerwartete Daten werden abgelehnt und eine vollständige erneute Übertragung angefordert.

Unveränderte öffentliche Daten verursachen keine wiederholten Präsenzereignisse. Neue Verbindungen erhalten die vollständige Liste; bestehende Verbindungen nur Änderungen. `presence:sync` ist die einzige Clientanfrage und unterliegt Authentifizierung und Ratenbegrenzung. Der Client kann keine Namen, Positionen oder fremde Anwesenheit setzen. Die vorhandenen Origin-, CSRF-, Sitzungs- und Leitstellenprüfungen bleiben aktiv. Eine eigene Bereinigung läuft auch bei pausierter Simulation, damit ungültige Sitzungen nicht weiter öffentlich erscheinen.

## Bedienung

Die Schaltfläche „Spieler“ im In-Game-HUD öffnet `Players.tsx`. Suche erfolgt über alle empfangenen Spieler-, Leitstellen- und Standortnamen, bevor die Ergebnisse auf Seiten verteilt werden. Filter zeigen alle Spieler, die eigene Leitstelle, Einträge ohne Standort oder wiederverbindende Konten. Je Seite werden höchstens 16 Leitstellengruppen angezeigt; Ergebniszahl, Seitenzahl und Vor-/Zurück-Navigation machen weitere Einträge erreichbar. Es gibt keine still abgeschnittene Liste.

Die eigene Leitstelle und der eigene Spieler sind erkennbar. Ohne gültigen Standort gibt es keinen Sprungknopf. „Auf Karte zeigen“ löst ausschließlich das lokale Ereignis `lv:map-focus` aus. Der gemeinsame Serverzustand und die Kameras anderer Browser werden dabei nicht verändert. Bei Verbindungsverlust wird die Liste sichtbar als unbestätigt gekennzeichnet, bis wieder eine vollständige Übertragung vorliegt.

## Prüfungen

Automatisierte Modulprüfungen in `tests/presence.test.ts` decken Tab-Deduplizierung, Reconnect-Schonfrist, Widerruf, Sitzungsablauf, gemeinsame Leitstellen, fehlende/ungültige Standorte, Whitelist-Sicherheit, atomare Übertragung mit 1.000 Spielern, 257 tatsächlich per SQLite projizierte Konten, Wiederanlauf und fehlerhafte Protokolldaten ab.

Zusätzliche Fälle in `tests/germany-http.test.ts` nutzen den echten Deutschland-Server mit kleinen synthetischen Geodaten, echten Cookies/CSRF-Werten und Socket.IO-Verbindungen. Geprüft werden öffentliche Präsenz bei weiterhin privaten Snapshots, mehrere Konten/Tabs, Wiederverbindung, Logout, Änderungen der Leitstellenmitgliedschaft, abgelaufene Sitzungen, verweigerte unberechtigte Aktionen, fehlende Authentifizierung und wirkungslose gefälschte Client-Präsenzereignisse.

`tests/e2e/presence.spec.ts` prüft im echten Browser mit isolierten Testservern die vollständige Spieleroberfläche, zwei getrennte Browserkonten, eigene/fehlende Standorte, lokale Karten-Sprungereignisse, zusätzliche Tabs, Offline/Reconnect, Mitgliedschaft, Serverneustart und Abmeldung. Ein weiterer Fall verbindet 35 echte, authentifizierte Testkonten und prüft alle drei Ergebnisseiten sowie die Suche nach dem letzten Spieler. Diese Browserfälle verwenden die bestehende lokale Testwelt; die reale Deutschland-Kartendarstellung wird zusätzlich in den Kartenprüfungen getestet.

Auch die öffentlichen POI-Kacheln erhalten ein eigenes Budget von 1.200 Anfragen pro Minute je gültigem Spielerkonto; ohne gültige Sitzung gilt es je Quell-IP. Sie verbrauchen nicht das niedrigere Budget der Ortssuche und Straßenpunktabfragen. Die bestehenden räumlichen Abfragegrenzen, Größenprüfungen und Kachel-Caches bleiben aktiv. Ein echter HTTP-Test ruft 125 POI-Kacheln ab, prüft beide Budgetgrenzen unabhängig, Nutzertrennung hinter derselben IP und die Ablehnung ungültiger Kacheln/Methoden.

Ausführungsstand dieser Dokumentfassung: 10 neue Modulprüfungen und alle 13 damaligen Deutschland-HTTP-/Socket-Fälle gemeinsam erfolgreich, einschließlich vier neuer Präsenzfälle. Der anschließend ergänzte POI-Budget-Test wurde separat erfolgreich ausgeführt. Nach dem gemeinsamen Produktionsbuild bestanden **vier Browserfälle mit Microsoft Edge**: die beiden Präsenzfälle erneut mit dem endgültigen kompakten Layout sowie zwei neue Fälle in `tests/e2e/topbar-quality.spec.ts`. Der Lauf dauerte 106,1 Sekunden, ohne Fehler, Wiederholungen oder übersprungene Fälle. Die Screenshots wurden zusätzlich visuell geprüft. Der Bericht liegt lokal unter `.tools/test-runs/presence-topbar-edge-final.json`.

Die beiden zusätzlichen Bedienfälle bestätigen die 62 Pixel hohe Hauptleiste, den vollständig verbleibenden Kartenausschnitt, zunächst geschlossene Einsatz-/Werkzeugleisten, Suchfokus und Escape, Funkmenü-Navigation per Pfeiltasten und Fokusrückkehr sowie unveränderte Kamera nach Zoom, Verschieben und Hauptmenürückkehr. Der Fahrzeugfall prüft die echte serverseitige Namensänderung; Abbrechen und Escape verwerfen die weitere Eingabe. Der abgebrochene Verkauf sendet keinen weiteren Spielbefehl und verändert weder Guthaben noch Fahrzeug- oder Personalbestand. Ein read-only Gegenreview des Servermoduls und Decoders fand keine bestätigte Privatsphäre- oder Sitzungslücke.

Firefox wurde lokal nicht ausgeführt: Der zur festgeschriebenen Playwright-Version gehörende Browser war nicht installiert; der offizielle Installer scheiterte nach fünf Downloadversuchen an Zeitüberschreitungen bei den offiziellen CDN- und Microsoft-Endpunkten. Die davon getrennten tatsächlichen Firefox-CI-Ergebnisse und vollständigen Projektläufe stehen im [Gesamtprüfbericht](QUALITAET-TESTBERICHT.md). Eine bestandene lokale Prüfung ist keine Produktionsbereitstellung und keine Aussage über eine beliebige Anzahl gleichzeitiger Internetspieler.
