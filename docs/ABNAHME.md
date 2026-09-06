# Abnahme des AMP-Umbaus

Die Architekturänderung ersetzt die frühere Pages-/P2P-Abnahme. Historische Nachweise sind in der Git-Historie erhalten und werden nicht als Belege für den neuen Server ausgegeben.

| Anforderung                       | Implementierung / Nachweis                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| Vorhandene Inhalte und Oberfläche | Gemeinsame Kataloge, Engine, Karte und Verwaltungsansichten erhalten                 |
| Ein Node-24-Port                  | Gebauter HTTP-Server mit dist/client, /api und Socket.IO                             |
| SQLite und eigener Besitz         | Konten, Spielstände und Belege transaktional gespeichert                             |
| Autoritative Regeln               | Aktionsschema, eigene Objektzuordnung, Preise/Besatzung/Zeit im Server               |
| Anmeldung                         | scrypt, Hash-Sitzungstoken, Widerruf, HTTPS-Cookies, CSRF/Origin, Loginlimits        |
| Registrierung                     | Einmalige Einladungen; Erstadministrator ausschließlich lokale CLI                   |
| Gemeinsame Einsätze               | Server prüft Unterstützung, Bewegung, Patiententransport und Auszahlung              |
| Mehrere Tabs / Browser zu         | Server simuliert unabhängig; Snapshots nach Wiederverbindung                         |
| AMP-Setup                         | Node-only Bootstrap für festes pnpm, eingefrorene Installation, Produktionsbuild     |
| Konfiguration                     | .env ausdrücklich geladen; HOST/PORT/PUBLIC_URL/DATA_DIR; begrenztes Proxy-Vertrauen |
| Persistente Daten                 | DATA_DIR außerhalb des Programms; kein Daten-/Secret-Commit                          |
| Betrieb                           | Exklusives Lock, Migration, konsistentes Backup, Restore, SIGTERM/SIGINT             |
| Altdaten                          | Lokale Export-/Sicherungsmöglichkeit; kein freier Besitzimport; explizite Admin-CLI  |
| Caching                           | Keine privaten API-/Socket-Caches; alter Offline-Worker wird stillgelegt             |
| GitHub                            | Eigener Branch und PR; automatisches Pages-Deployment im Branch entfernt             |
| Privater AMP-Server               | Kein Zugriff, keine dortige Installation behauptet; Betreiberabnahme erforderlich    |

Tatsächlich ausgeführte Tests und gefundene Fehler stehen im [Testbericht](TESTBERICHT.md). Der bestehende Lastfall ist kein Nachweis für beliebig viele gleichzeitig angemeldete Konten. Der Betrieb ist für eine einzelne Node-Instanz vorgesehen.
