# Daten, Sicherungen und externe Kontakte

## Lokal gespeicherte Daten

IndexedDB speichert Profil, Credits, Journal, eigene Gebäude, Fahrzeuge, Personal, Einsatzphasen, Routen, Ausbildung, Patienten, Fortschritt, Alarmierungsvorlagen und Kooperationsbelege. Datenbank und Web Lock sind mit Projektname und Projektpfad namespaced. Datenbankschema 2 migriert Schema 1 in einer Transaktion und validiert dabei Referenzen. Bei einem Migrationsfehler bleibt der bisherige Datenbankstand erhalten.

Sicherungsdateien verwenden Format `leitstellen-verbund`, Version 1 und Welt `falkenried-1`. Zukünftige oder unbekannte Dateiversionen werden nicht stillschweigend akzeptiert. Das Größenlimit beträgt 8 MB. Importprüfung umfasst Schema, IDs, Eigentümer, Fähigkeitenreferenzen, Wachen- und Transportkapazitäten, Positionswerte und nicht endliche Zahlen. Vor der Übernahme wird der bisherige Stand lokal gesichert. Der Import erzeugt eine neue Spielstandgeneration und trennt bestehende Peer-Verbindungen.

Alle 60 Sekunden und bei wichtigen Sicherungsaktionen werden rotierende lokale Sicherungen erzeugt. Die letzten fünf bleiben erhalten. Zufällige Suffixe verhindern Kollisionen bei identischen Zeitstempeln. **Auch diese Sicherungen verschwinden beim Löschen der Browserdaten.** Deshalb regelmäßig eine Datei exportieren und außerhalb des Browsers aufbewahren.

Die Bitte um persistente Browserspeicherung ist keine Garantie. Privates Surfen, Platzmangel, verweigerte Speicherung oder Browserbereinigung können Datenverlust verursachen. Fehlgeschlagene Transaktionen werden nicht als erfolgreiche Käufe angezeigt. Speicherfehler pausieren weitere Simulation; Wiederherstellung und eine bereinigte Diagnose stehen bereit.

## Netzwerk und Zugangsdaten

Standardmäßig kontaktiert der Spielkern ausschließlich den Website-Host für statische Dateien. Keine externen Karten, Schriftarten, Tracker, Werbung oder Analyse-Skripte. Die Grundkarte, Icons, Schriften der lokalen Systemfamilie und der Spielcode benötigen im Betrieb keinen API-Schlüssel.

Wer ausdrücklich den optionalen Cloudflare-STUN-Dienst aktiviert, kontaktiert beim WebRTC-Verbindungsaufbau `stun.cloudflare.com:3478` über UDP. Cloudflare bezeichnet diesen STUN-Dienst als kostenlos und unbegrenzt: [Cloudflare Realtime FAQ](https://developers.cloudflare.com/realtime/turn/faq/). Der Dienst erhält dabei Netzwerk-Verbindungsinformationen. Es wird kein Cloudflare-Konto eingerichtet und kein kostenpflichtiger TURN-Dienst gebucht.

Eigene STUN-/TURN-URLs und TURN-Zugangsdaten werden nur im Arbeitsspeicher des aktuellen Tabs gehalten. Sie sind nicht Bestandteil von IndexedDB, Exporten, Diagnosen, Builddateien oder Service-Worker-Caches. Nach Reload müssen sie erneut eingetragen werden. Der konfigurierte Betreiber kann Verbindungsinformationen sehen; TURN leitet Datenverkehr weiter.

Angebots- und Antworttexte enthalten technische Verbindungsinformationen und möglicherweise Netzwerkadressen. Sie werden nur ausdrücklich kopiert und von den Spielern selbst privat ausgetauscht. Das Spiel versendet keine E-Mails oder Discord-Nachrichten. Mikrofon und Kamera werden nicht verwendet.

## Offline und Updates

Der Service Worker cached ausschließlich die mit dem jeweiligen Build erzeugte Dateiliste im eigenen Projekt-Scope. Cache-Namen enthalten den Projektpfad und eine Buildkennung. Andere Projekte werden nicht gelöscht. Signaling, Chat und Zugangsdaten werden nicht gecacht.

Eine aktualisierte Version wartet standardmäßig auf einen sicheren Aktivierungszeitpunkt. Die Updatefunktion speichert den aktuellen Stand vor Aktivierung und lädt anschließend neu. Ein anderer schreibender Tab wird durch Web Locks verhindert. Gegenüber einem alten Backup oder einem fremd manipulierten Eigentümer gibt es keine unveränderbare globale Historie.
