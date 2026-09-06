# Zwei bis vier Freunde verbinden

## Zwei Spieler

1. Beide Spieler öffnen die Website, starten oder laden **ihr eigenes** Spiel und öffnen **Freunde**.
2. Bei verschiedenen Internetanschlüssen unter „Netzwerkeinstellungen“ entweder den beschriebenen kostenlosen Cloudflare-STUN-Dienst aktivieren oder einen eigenen zulässigen STUN-/TURN-Server eintragen. Leere Konfiguration kontaktiert keinen externen Dienst. TURN-Zugangsdaten müssen gegebenenfalls auf beiden Seiten eingegeben werden; das Spiel bucht keinen Dienst.
3. A klickt **Angebot erstellen**. Erst nach vollständiger ICE-Sammlung steht im Textfeld das vollständige Angebot. Dieses ist kein kurzer Raumcode und kein Link. A schickt den Text privat an B, beispielsweise über Discord.
4. B fügt ihn unter **Angebot oder Antwort einfügen** ein und klickt **Verbindungstext übernehmen**. B schickt den erzeugten Antworttext zurück an A.
5. A fügt die Antwort ein und übernimmt sie. Erst **DataChannel geöffnet · verbunden** beziehungsweise der verbundene Freundeneintrag bedeutet eine echte Verbindung.

Angebote gelten zehn Minuten. Bei fehlerhaften oder abgelaufenen Texten abbrechen und ein neues Angebot erstellen. Eine erneute Verbindung erfordert wieder den Austausch; es gibt keinen versteckten Signaling-Server. „Abgleichen“ wiederholt den Austausch freigegebener Ansichten und ausstehender Abschlussbelege auf einer vorhandenen Verbindung.

## Gemeinsamer Einsatz

1. Der Einsatzgeber öffnet einen eigenen Einsatz und wählt **Mit Freunden teilen**.
2. Im Freunde-Bereich des Helfers erscheint der fremde Einsatz. Der Helfer wählt ausschließlich ein eigenes einsatzbereites Fahrzeug unter **Eigenes Fahrzeug anbieten**.
3. Erst nach Bestätigung durch den Einsatzgeber fährt das Fahrzeug los. Fahrzeuge unterwegs zählen noch nicht als Fähigkeit am Einsatzort. Bestätigte Kräfte sind in der Disposition sichtbar.
4. Passende Fähigkeiten beider Eigentümer werden zusammengezählt. Nach der Abarbeitung werden Patienten mit bestätigten lokalen oder fremden Transportfahrzeugen zu Krankenhäusern gebracht.
5. Der Einsatzgeber speichert den Abschluss vor der Veröffentlichung. Bei mindestens einem bestätigten Helfer erhält er 50 Prozent der Grundbelohnung. Die andere Hälfte wird gleichmäßig unter den bestätigten Helfern aufgeteilt, jeweils abgerundet. Ohne Helfer erhält er die volle Belohnung. Ein Helfer gilt erst nach einer bestätigten Ankunft als beteiligt. Bloßes Ansehen oder ein unbestätigtes Angebot zahlt nichts aus.

Jeder Empfänger prüft einen Beleg aus Kooperationsrunde und eigener Spieler-ID in derselben lokalen Transaktion wie die Gutschrift. Doppelte oder nach einem Reload erneut gesendete Belege zahlen nicht doppelt. Ausstehende Unterstützungsvorgänge sind im Freunde-Bereich sichtbar.

## Drei und vier Spieler

Jedes Paar stellt eine eigene direkte Verbindung her. Bei drei Spielern sind das A–B, A–C und B–C. Bei vier Spielern kommen A–D, B–D und C–D hinzu. Jeder Browser unterstützt maximal drei verbundene Freunde. Es gibt keinen zentralen Raumhost. Wenn A geht, bleibt beispielsweise B–C unabhängig nutzbar.

## Abbruch und Grenzen

- Ein Datenkanal wird nach 15 Sekunden ohne Nachrichten als verloren behandelt. Nicht mehr frisch bestätigte fremde Kräfte zählen schon nach sechs Sekunden nicht weiter.
- Nach spätestens 30 Sekunden ohne den erforderlichen Peer wird ein gebundenes Fahrzeug lokal zurückgerufen. Die Rückfahrt benötigt zusätzlich ihre reale Spiel-Fahrzeit. Ein bereits laufender Patiententransport wird zum Krankenhaus beendet.
- Der Koordinator beendet eine verwaiste Kooperationsrunde kontrolliert. „Kooperation beenden“ erlaubt dies auch ausdrücklich. Eigene Kräfte bleiben für den Einsatz erhalten; unbestätigte fremde Transportaufträge werden verworfen. Bereits bestätigte Patiententransporte bleiben erhalten.
- Endgültige, vorher gespeicherte Abschlussbelege können bei erneutem Kontakt abgeglichen werden. Das ist keine sofortige globale Übereinstimmung zwischen getrennten Browsern.
- Alte Backups und manipulierte Browserdaten sind nicht gegen doppelte Historien abgesichert. Lokale Profile sind keine zentral geprüften Identitäten.
- STUN hilft beim Finden einer Verbindung, garantiert sie jedoch nicht. Ohne TURN können einige NAT-/Firewall-Kombinationen nicht verbunden werden. TURN-Verkehr wird weitergeleitet und ist keine reine Direktverbindung.
- Es werden niemals Mikrofon- oder Kameraberechtigungen angefordert. Die Verbindungstexte können Netzwerkadressen enthalten; nur mit vertrauten Freunden teilen.
