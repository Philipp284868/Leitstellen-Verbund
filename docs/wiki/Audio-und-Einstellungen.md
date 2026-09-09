# Audio, Einstellungen und lokale Sicherung

Hauptmenü und Spiel öffnen dieselben **Einstellungen**. Die Reiter heißen **Audio**, **Anzeige & Karte**, **Steuerung** und **Hinweise & Hilfe**. Änderungen sind zunächst Vorschau; **Übernehmen** speichert sie auf diesem Gerät, **Verwerfen** stellt die gespeicherten Werte wieder her. Auch Standardwerte und importierte Regler werden zuerst als Vorschau geladen. Ungespeicherte Änderungen werden beim Schließen nicht still übernommen.

## Musik und Kommunikation

Zwei eigene Arrangements begleiten Menü und Spiel; der Szenenwechsel blendet über 2,4 Sekunden. Master, Musik, Umgebung, Telefon, Funk/Sprache, Alarmierung und UI sind getrennt regelbar. Feinregler steuern unter anderem Pieper, Sirene, Sprechwunsch und Priorität.

Unabhängige Spielsignale dürfen gleichzeitig klingen. Funkmeldungen werden je Kanal geordnet. Aktive Kommunikation senkt Musik und Umgebung vorübergehend ab; nach ihrem Ende gelten die aktuell gewählten Regler. Priorität und Notfall behalten Originaltöne, ausdrücklich gewählte Mutes gelten trotzdem. Alle wichtigen Meldungen besitzen eine sichtbare Entsprechung.

Mehrere Tabs desselben Kontos koordinieren die Ausgabe; der aktivierte Tab übernimmt. Hintergrundverhalten ist wählbar: alles pausieren, nur Kommunikation/Alarmierung oder Audio weiterlaufen lassen. Browser und Betriebssystem dürfen Hintergrundtabs dennoch suspendieren. Autoplay erfordert eine bewusste Interaktion; Mikrofonberechtigung und fremder Musikdienst sind nicht nötig.

## Eigene Dateien und Sicherung

Normale Signalarten erlauben lokale WAV-, MP3- und OGG-Dateien. Auswahl und Zuordnung gehören zum Einstellungsentwurf und werden erst mit **Übernehmen** gespeichert. Codecprüfung oder Speicherfehler erhalten die bisherige gespeicherte Zuordnung. Es gibt keine künstliche 2-MB-/15-Sekunden-Grenze; verfügbare Browserquota und unterstützte Codecs sind die tatsächlichen Grenzen.

Dateien liegen ausschließlich in der IndexedDB dieses Browserprofils und dieser Spieladresse. Sie werden weder an den Server noch an Mitspieler übertragen und sind **nicht im SQLite- oder Spielstandbackup** enthalten. Beim Löschen der Websitedaten gehen sie verloren. Originaldateien deshalb außerhalb des Browsers behalten.

Die JSON-Audiosicherung enthält Regler und Mutes, keine Originaldateien. Import validiert die JSON-Datei und lädt einen verwerfbaren Entwurf. Andere Computer und Browserprofile erhalten lokale Präferenzen nicht automatisch.

## Anzeige und Steuerung

Reduzierte Bewegung, Kartenmarker, Beschriftung, Arbeitsplatzdarstellung und Tastenkürzel betreffen die lokale Bedienung. Konflikte bei Tastenbelegung werden angezeigt. Diese Einstellungen verändern keine Serverzeit, Preise, Besitzerrechte oder Einsatzentscheidungen. [[Bedienung]] beschreibt die Arbeitsbereiche, [[Tutorial]] den geführten Einstieg.

[Audioquellen, Mischregeln, lokale Migration und tatsächliche Abnahme](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/AUDIO.md).
