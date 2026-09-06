# HTTP- und Socket.IO-Protokoll

Alle Endpunkte liegen auf derselben PUBLIC_URL. Mutierende HTTP-Anfragen verwenden POST mit application/json und exaktem Origin. Nach Anmeldung muss zusätzlich X-CSRF-Token aus GET /api/me mitgesendet werden. Das Sitzungscookie ist HttpOnly und wird nicht per JavaScript gespeichert. Antworten mit Kontodaten verwenden Cache-Control: no-store.

| Endpunkt                          | Zweck                                                                   |
| --------------------------------- | ----------------------------------------------------------------------- |
| GET /api/health                   | Betriebsbereitschaft; 503 bei pausierter Simulation                     |
| POST /api/register                | Benutzername, Passwort, Name, Leitstelle, einmalige Einladung           |
| POST /api/login                   | Eigene Zugangsdaten; neue serverseitige Sitzung                         |
| GET /api/me                       | Eigenes Konto, CSRF-Token, bestätigter Spielstand, gemeinsame Ansichten |
| POST /api/logout, /api/logout-all | Sitzung bzw. alle eigenen Sitzungen widerrufen                          |
| POST /api/password                | Aktuelles Passwort prüfen, neues setzen, Sitzungen widerrufen           |
| POST /api/action                  | UUID und geprüfte Aktion; niemals freie Save-Objekte                    |
| GET /api/export                   | Eigener bestätigter Dateiexport                                         |
| POST /api/admin/invite            | Administrator erzeugt einmaligen Code                                   |
| POST /api/admin/backup            | Administrator erstellt konsistente SQLite-Sicherung                     |

Aktionsbeispiel: {"id":"eine-gueltige-uuid","action":{"type":"buy","kind":"tsf","home":"eigene-wachen-id"}}. Unterstützt sind die bestehenden Kauf-, Bau-, Personal-, Dispositions- und Fortschrittsaktionen sowie Einstellungen, Alarmierungsvorlagen, share/unshare und support. Ungültige Zusatzfelder werden abgelehnt. Nachrichten sind auf 32 KiB begrenzt; Serverantworten können bei großen Konten größer sein. Fehlermeldungen enthalten keine Passwörter oder Sitzungstoken.

Socket.IO auf /socket.io authentifiziert das Sitzungscookie und den CSRF-Token in handshake.auth.csrf. Exakte Origins sind erlaubt; gleichadressige Browser-Long-Polling-Anfragen ohne Origin benötigen Sec-Fetch-Site: same-origin. Das ist zusätzlich zur Sitzungs- und CSRF-Prüfung. HTTP-Polling und WebSocket-Upgrades verwenden denselben Port. Keine Signaling-Angebote, keine WebRTC-DataChannels und keine STUN-/TURN-Kontakte.

Der Server sendet snapshot, chat und notice. Der Client kann nur chat senden; Spielaktionen laufen durch die HTTP-Aktionsprüfung. Chat ist höchstens 500 Zeichen und zwei Nachrichten pro Sekunde. Eigene Änderungen sind auf 60 Anfragen pro Sekunde begrenzt. Loginversuche werden für 15 Minuten pro Benutzername und Quelladresse in SQLite gezählt; ein Neustart umgeht die Begrenzung nicht. Nur ausdrücklich vertraute unmittelbare Proxys dürfen X-Real-IP liefern.

Nach Verbindungswiederaufbau kommt ein vollständiger aktueller Snapshot. Mehrere Tabs schreiben nicht direkt an eigenen Kopien, sondern senden Aktionen an denselben Server. Sie benötigen deshalb keine lokale Schreibersperre. Eine einmalige Wiederholung nach einem Transportfehler verwendet dieselbe Aktions-ID. Sitzungslöschung beendet offene Kanäle und verhindert weitere Aktionen. Serverneustarts benötigen kein erneutes Registrieren; gültige Sitzungen bleiben erhalten, außer nach Passwortwechsel oder Datenbankwiederherstellung.
