# Funkarbeitsplatz und Sprechwünsche

Der nächste Ausbau nach Phase 0 betrifft Funk und Sprechwünsche. Zugang: im Spiel **Funk → Sprechwünsche**, außerdem über die Schnellsuche nach „Funkarbeitsplatz“.

## Bedienung

- Offene Meldungen sind nach Priorität und danach nach längster Wartezeit sortiert. Suche, Funkkanal und Bearbeitungsstand grenzen die Liste ein. Die Kanäle stammen aus den vorhandenen FMS-Fahrzeugdaten; es werden keine echten BOS-Funkverbindungen hergestellt.
- „Sprechwunsch übernehmen“ reserviert die Bearbeitung für drei Minuten Serverzeit. Alle berechtigten Disponenten derselben Leitstelle sehen die Zuständigkeit. „Bearbeitung freigeben“ gibt sie vorzeitig zurück. Ein geschlossenes Fenster, ein Reload oder eine erneute Übernahme verlängert die Frist nicht. Nach Ablauf ist eine neue Übernahme möglich; auch bei abgemeldeten oder entfernten Mitgliedern endet die Sperre spätestens dann.
- Eine freie Meldung kann direkt bearbeitet werden. Bei einer aktiven Reservierung darf ausschließlich deren Inhaber antworten, nachfordern oder erledigen. Die Sperre gilt auch im Einsatzdetail. Verschiedene Tabs desselben Kontos verwenden dieselbe Disponentenidentität.
- Die erste Lagemeldung muss aufgenommen werden, bevor sich weitere Aktionen freischalten. Eine Übernahme verrät keine noch unbekannten Einsatzinformationen.
- „Rückfrage zur Lage“ zeigt die serverseitige Antwort zum Kräftebedarf und lässt den Sprechwunsch offen. „Nachforderung bearbeiten“ protokolliert den Bedarf. Weitere Fahrzeuge werden anschließend über „Einsatz öffnen / weitere Kräfte disponieren“ tatsächlich ausgewählt und alarmiert. Es erfolgt keine automatische Alarmierung.
- Erledigte Gespräche laufender Einsätze bleiben über den Filter erreichbar. Nach Einsatzabschluss liegt der vollständige Funkverlauf im Einsatzarchiv. Der Arbeitsplatz zeigt ausschließlich den eigenen autorisierten Einsatzbestand; er teilt keine fremden Einsätze automatisch.
- Bei unterbrochener Verbindung sind sämtliche Funkaktionen gesperrt. Nach Wiederverbindung gelten der aktuelle Serverstand und die verbliebene Reservierungszeit.

## Speicherung und Kompatibilität

Die bestehende strikte Sprechwunsch-Struktur erhält optionale Felder `handling` (authentifizierter Akteur und Ablaufzeit), `handledBy` und `answer`. Alte Spielstände benötigen keine Umrechnung und bleiben ohne diese Felder lesbar. Die Speicherung erfolgt über die vorhandene SQLite-Transaktion und JSON-Spielstände; es gibt keine SQL-Schemaänderung, keinen Reset und keinen neuen Datenpfad. Neue Daten setzen beim späteren Einlesen die aktualisierte Anwendung voraus; ein Downgrade auf einen älteren strikten Parser ist keine unterstützte Wiederherstellung.

Übernahme und Freigabe erzeugen Ereignisse mit Akteur im vorhandenen Einsatzprotokoll. Bestehende Aktions-IDs verhindern doppelte Verarbeitung. Ablauf und Wiederholung verwenden die gespeicherte Simulationszeit, keine lokale Browseruhr und keinen zusätzlichen Zufall. Die echte Simulation läuft weiter; Serverstillstand verlängert nicht durch einen Browserkontakt die Frist, sondern folgt dem vorhandenen serverseitigen Zeitfortschritt beim Start.

Die Implementierung verteilt sich auf `simulation/radio-state.ts` (gemeinsame Zustandsauswertung), `simulation/radio.ts` (serverseitige Reservierung), die vorhandene Einsatzlogik sowie `RadioRequest.tsx` und `RadioDesk.tsx`. Es sind keine zusätzlichen Pakete, Assets oder externen Dienste erforderlich. Bestehende FMS- und Audioereignisse werden weiterverwendet; bloße Übernahmen erzeugen keinen neuen Sprechwunschton.

Die kleine Funkansicht wird direkt mit der Anwendung eingebunden. Ein eigener dynamischer Einstieg hatte im gemessenen Build das bisher getrennte gemeinsame UI-Paket mit dem Hauptpaket zusammengeführt (312 kB). Die direkte Einbindung erhält die bestehende Aufteilung; sämtliche unveränderten Bundlelimits werden weiterhin geprüft. Die großen bisherigen Ansichten bleiben bedarfsgeladen.

## Regressionen

`tests/radio.test.ts` prüft Zuständigkeit, Ablauf, verborgene Lage, echte Rückfrage/Nachforderung, additive Spielstandkompatibilität, deterministische Wiederholung und Archivierung. `tests/radio-server.test.ts` prüft echte HTTP-/Socket-Zugriffe, konkurrierende Disponenten, manipulierte Identität, doppelte Aktionen, Wiederverbindung, zwei Serverneustarts und Rechteentzug. `tests/e2e/radio.spec.ts` bedient den Arbeitsplatz in zwei getrennten Browserkontexten sowie den Ablauf bis zum Archiv. Die vorhandenen Phase-1-, Mehrspieler-, FMS-, Audio- und Formularprüfungen bleiben Bestandteil der Abnahme.

Die Befehle und CI-Nachweise für tatsächlich ausgeführte Prüfungen werden im Abschlussbericht benannt. Notrufarbeitsplatz, gemeinsame Einsatzlagen, Katastrophenbereitschaft und KatS-Wachen sind inzwischen ebenfalls integriert; Bedienung und Bestandskompatibilität stehen in [Einsatzarbeitsplatz](https://github.com/Philipp284868/Leitstellen-Verbund/blob/8940407e97361c978cd95125922849c97dda9b19/docs/EINSATZARBEITSPLATZ.md).
