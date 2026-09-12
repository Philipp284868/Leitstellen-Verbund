# Funkübertragungen und Fahrzeugwünsche

FMS beschreibt den tatsächlichen Simulationszustand. Die dazugehörige Funkmeldung ist eine getrennte Übertragung mit stabiler ID, Absender, Kanal, Priorität und Zustandsverlauf. Jede Leitstelle verarbeitet ihre Kanäle unabhängig. Ein geschlossener oder stummer Browser hält keinen Kanal auf.

Gleiche Prioritäten laufen nach Reihenfolgenummer. Dringende Meldungen werden vorgezogen; nach 60 Sekunden Wartezeit gilt Vorrang nach Eingangsreihenfolge. Eine Notfallmeldung kann eine jüngere normale Meldung einmal unterbrechen. Diese bleibt erhalten und wird wiederholt. Nach großen Zeitsprüngen werden über 180 Sekunden alte wartende Meldungen als nur im Verlauf verfügbar markiert. Maximal 160 Meldungen warten, bis zu 2.000 bleiben gespeichert. Überlastung ist sichtbar; die zugehörigen Einsatzereignisse bleiben zusätzlich im Einsatzarchiv.

Seit 2.25 werden Meldungstexte ausschließlich gelesen. Es gibt keine Browser-Sprachausgabe, kein Mikrofon und kein Schreibfeld im Textprotokoll. Telefon-, Funkhinweis- und Alarmtöne sowie Musik bleiben getrennt regelbar. Wiederverbindung startet keine historische Tonfolge; eine Kontolease verhindert doppelte Tonausgabe aus mehreren Tabs.

Das permanente Textprotokoll unten links führt Ereignisse mit stabilen IDs zusammen. Lesen oder Anklicken quittiert keinen Sprechwunsch. Ein Einsatzverweis öffnet die Detailansicht; dort bleiben Übernahme, Lagemeldung und Nachforderung bedienbar. Ältere Protokollseiten lassen sich nachladen, offene wichtige Meldungen bleiben hervorgehoben. Die Grenzen und Migrationen stehen in [HUD und Serverbetrieb](HUD-UND-SERVER.md).

Unterstützungsanfragen speichern bis zu 20 frei eingetragene Fahrzeugwünsche mit je 80 Zeichen. Ein Wunsch pro Zeile; unbekannte Funkrufnamen sind zulässig. Diese Texte erteilen keine Berechtigung und werden nicht als Fahrzeug-IDs ausgewertet. Der Empfänger wählt eigene tatsächlich verfügbare Kräfte. Eine Alternative muss Fahrprofil, Transportkapazität und sämtliche Fähigkeiten des gewünschten Typs abdecken. Originalwunsch, gewünschter Typ, zugewiesene stabile Fahrzeug-ID und Name bei Zusage bleiben getrennt. Vor der Zusage werden tatsächliche Anreise und Ausrücken berechnet. Eine überörtliche Hilfe darf länger dauern als ein eigener regulärer Einsatz.

DB-Version 16 ergänzt einen leeren Funkzustand für Altstände und versioniert bestehende Anfragen. Alte Einsatzereignisse werden nicht erneut abgespielt. Bestehende Zuordnungen, Fahrten, Personal, Patienten, Geld und XP bleiben erhalten. `node dist/server/cli.js migration-preview` zeigt den lesenden Plan; der Server legt vor einer notwendigen Migration weiterhin eine vollständige SQLite-Sicherung an. Wiederholtes Starten migriert denselben Stand nicht erneut.

Die genannten Zeit-, Mengen- und Prioritätsgrenzen sind Spielparameter, keine reale BOS-Dienstvorschrift.
