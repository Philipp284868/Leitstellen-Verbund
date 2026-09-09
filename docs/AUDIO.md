# Musik, Spielsignale und lokale Audiodateien

## Lokale Soundverwaltung

Unter **Einstellungen → Musik & Spielsound → Signalregler und eigene Soundprofile**
stehen getrennte Lautstärken für **Pieper, Sirene, Alarm, Funk, Sprechwunsch,
Telefon, Prioritätsalarm und Ereignisse** zur Verfügung. Master, Musik und Effekte
behalten ihre eigenen Regler; vorhandene Einstellungen werden übernommen. Die
neuen Regler Sprechwunsch und Prioritätsalarm beginnen bei 100 Prozent ihres Kanals.
Die bestehende Gesamt- und Effektlautstärke gilt weiterhin.

Für jeden normalen Signalkanal lässt sich eine eigene **WAV-, MP3- oder OGG-Datei**
auswählen. Eine neue Auswahl ersetzt die bisherige Zuordnung erst nach erfolgreicher
Prüfung und Speicherung. Die Checkbox schaltet eine eigene Datei aus, ohne sie zu
löschen; dann erklingt wieder das Original. Vorhandene lokale Dateien können über
die Zuordnungsauswahl auch für einen anderen normalen Kanal verwendet werden.
Löschen entfernt nur die ausgewählte Zuordnung. **Eigenen Sound stoppen** beendet
eine laufende Aufnahme sofort.

Es gibt **keine feste 2-MB- oder 15-Sekunden-Grenze** und keine feste Gesamtspeichergrenze
der Anwendung. Die Oberfläche zeigt die vom Browser geschätzte freie Speicherquota
für diese Website. Diese Schätzung umfasst auch andere lokale Websitedaten und ist
kein garantiert verfügbarer Festplattenplatz. Bei fehlendem Schätz-API entscheidet
die tatsächliche IndexedDB-Speicherung. Speicherfehler und nicht lesbare Codecs
werden verständlich gemeldet; ein fehlgeschlagener Ersatz erhält die alte Datei.
Die tatsächliche Codec-Unterstützung hängt vom Browser und Betriebssystem ab.

Eigene Dateien und ihre Zuordnungen liegen **ausschließlich in IndexedDB dieses
Browsers**. Sie werden weder zum Spielserver hochgeladen noch über Multiplayer
übertragen, in SQLite abgelegt oder in serverseitige Spielstandsicherungen
aufgenommen. Die Audioeinstellungen gelten für diesen Browser und diese
Spieladresse. Beim Wechsel der Adresse oder des Browsers müssen Dateien dort
neu ausgewählt werden. Das Löschen von Websitedaten entfernt die lokalen Sounds.
Mehrere geöffnete Tabs derselben Adresse erhalten lediglich eine lokale
Änderungsnachricht, keine Audiodateien über das Netzwerk.

## Geschützte Prioritätsmeldungen

Hohe und kritische Meldungen haben einen festen Prioritätston. **NOTFALL** besitzt
einen anderen, deutlich erkennbaren Originalton. Alte Spielstände mit PRIORITÄT
werden klanglich wie HOCH behandelt. Eigene Dateien können diese Töne nicht
überschreiben. Priorität und Notfall unterbrechen eine laufende eigene Aufnahme;
der Notfallton hat auch Vorrang vor dem Prioritätston. Der eigene Prioritätsregler
bleibt unabhängig von Funk und normalen Sprechwünschen. Explizite Stummschaltung,
ausgeschaltete Effekte oder ein auf null gestellter Prioritätsregler gelten trotzdem.

Benachrichtigungen entstehen aus bestätigten neuen Serverständen, einschließlich
neuer Sprechwünsche und einer erhöhten Einsatzpriorität. Das erste Laden,
Wiederverbindung, Kontowechsel und erneut empfangene Stände spielen alte Meldungen
nicht nach. Alle Informationen bleiben als Text sichtbar.

## Klanggestaltung und Wiedergabe

**Nachtschicht** ist die eigene instrumentale Komposition für die Leitstelle:
78 BPM, D-Moll, 64 Takte und etwa 3 Minuten 17 Sekunden mit wiederkehrenden Motiven.
Klavier, Bass, Flächen und ein zurückhaltender Rhythmus werden im Browser aus
Notenfolgen und Klangparametern synthetisiert. Im Hauptmenü ist das Arrangement
ruhiger; im Spiel kommt ein leiser Rhythmus hinzu. Es werden keine fremden
Aufnahmen oder Musikstreams benötigt. Die Originalsignale entstehen ebenfalls
lokal im Klanggenerator.

Eigene Aufnahmen werden über einen **lokalen Blob und HTMLAudioElement** gestreamt
und durch den vorhandenen Web-Audio-Mixer mit konservativem Eingangspegel und
Dynamikkompressor geführt. Lange Dateien werden nicht vollständig mit
`decodeAudioData` in einen großen PCM-Puffer verwandelt. Beim Start werden nur
Metadaten geladen; höchstens eine eigene Aufnahme spielt gleichzeitig. Die
Metadaten-/Codecprüfung liest den Dateikopf und den ersten abspielbaren Frame.
Sie garantiert nicht, dass eine beschädigte Stelle weiter hinten in einer
Aufnahme fehlerfrei ist. Ein Wiedergabefehler fällt auf das Originalsignal zurück.

Audio beginnt nach Nutzerinteraktion. Stummschaltung, Stop, Tab-/Fensterwechsel,
Abmeldung, Ersetzen und Löschen beenden die betroffene lokale Wiedergabe. Dabei
werden MediaElement-Verbindungen und Blob-URLs freigegeben. Der aktive Tab
übernimmt die Ausgabe; andere Tabs bleiben still. Eine unterbrochene eigene
Aufnahme wird beim Zurückwechseln nicht automatisch fortgesetzt.

## Migration und Prüfung

Die lokale IndexedDB `lv-custom-audio-v1` wird von Version 1 auf Version 2
aktualisiert. Vorhandene ArrayBuffer-Signale werden als Blob übernommen. Der
zusätzliche Metadatenstore erlaubt Dateiliste und Regler ohne Laden aller
Aufnahmen. Es gibt dafür keine Änderung der Serverdatenbank oder Spielstände.

Die Tests prüfen echte längere WAV-, MP3- und OGG-Dateien, WAV über 2 MB,
Wiedergabe, Quota-/Codecfehler, atomaren Ersatz, Migration, Aktivierung,
Zuordnung, Löschen, Reload, lokale Netzwerkisolation, Originaltöne und
Freigabe der Quellen. Die Synthesizerprüfung rendert Musik und Originalsignale
mit OfflineAudioContext und prüft hörbaren Stereo-Ton ohne Clipping.
Maßgeblich sind die tatsächlich ausgeführten Testergebnisse des jeweiligen Commits.

Die Linux-Browser-CI verwendet ein virtuelles PulseAudio-Ausgabegerät. Der
AMP-Spielserver selbst benötigt weder Audiohardware noch PulseAudio.

Technische Referenzen: [Browser-Speicherschätzung](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate),
[MediaElement im Web-Audio-Mixer](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource),
[Freigabe lokaler Blob-URLs](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static).
