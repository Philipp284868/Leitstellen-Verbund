# HUD und Serverbetrieb

## Spielanwesenheit und Einnahmen

Neue Notrufe benötigen seit dieser Überarbeitung eine authentifizierte aktive Spielansicht. Anmeldung und Hauptmenü reichen nicht. Mehrere Tabs und berechtigte Disponenten derselben Leitstelle zählen getrennt. Dialoge und ausgeblendete Tabs ändern die Spielansicht nicht. Verbindungsabbruch entfernt die betreffende Sitzung; ohne erneuerte Meldung läuft ihre Freigabe spätestens nach zwei Minuten ab. Nach einem Serverstart bestehen zunächst keine Freigaben.

Bestehende Einsätze, Transporte und Weltlagen laufen weiter. Abwesenheit hält neue unabhängige Anrufe, Kampagnenangebote und Folgeanrufe zurück und erzeugt keinen Nachholschwall. Frequenz und variable Intervalle während aktiven Spiels bleiben unverändert.

Die wiederkehrende Grundfinanzierung entfällt. SQLite-Migration 21 entfernt Auszahlungstermine und bewahrt frühere Zahlungen als historische Metadaten. Guthaben, Geldjournal und gekaufte Objekte bleiben erhalten. Einmaliges Startgeld und Einsatz-/Kooperationsvergütungen bleiben bestehen. Der vorhandene Einstieg Feuerwache mit TSF-W lässt 570.000 Euro Reserve; Startpreise und Vergütungen wurden hierfür nicht angehoben.

Strukturierte Betriebsdiagnose verwendet Zeit, Stufe, Komponente, Code und Korrelations-ID. Wiederholungen werden über 30 Sekunden zusammengefasst. Es werden keine kompletten Anfrage-, Fehler- oder Save-Objekte protokolliert.

Die Überarbeitung wird im bestehenden System schrittweise integriert. Bedienstruktur, optionale Berichtsvariablen und abschließende Prüfnachweise werden mit den folgenden Implementierungsschritten ergänzt.
