# Version 2.5 – Musik und Spielsound

Aktueller Zusatz in Version 2.11: Gesamtlautstärke, sechs Signalkanäle, Klangprofile und lokale eigene Audiodateien. Details, Dateigrenzen und Rücksetzen stehen in der [Phase-5-Anleitung](PHASE-5.md#musik-signale-und-eigene-dateien). Die folgenden Abschnitte beschreiben die weiterhin verwendete musikalische Grundlage aus Version 2.5; deren damalige Versions- und Migrationsangaben sind historisch.

## Klanggestaltung

**Nachtschicht** ist eine eigene instrumentale Komposition für die Leitstelle: 78 BPM, D-Moll, 64 Takte (rund 3 Minuten 17 Sekunden) mit wiederkehrenden Motiven und vier unterschiedlich besetzten Abschnitten. Weiche Klaviertöne, zurückhaltender Bass, warme Flächen, Stereoverteilung und Hall begleiten das Spiel. Im Hauptmenü ist das Arrangement ruhiger; im Einsatzbildschirm kommt ein leiser Rhythmus hinzu. Die Musik wiederholt sich mit überlappenden Ausklängen. Das Spieltempo verändert die Musikgeschwindigkeit nicht.

Alle Klänge werden im Browser aus eigenen Notenfolgen und Klangparametern erzeugt. Es werden keine fremden Aufnahmen, Samples, Musikstreams oder externen Dienste eingebunden. Ein eigener Klanggenerator erzeugt auch die Effekte:

- Neues eigenes Einsatzangebot: kurzes Meldesignal.
- Bestätigte Alarmierung: ansteigende Tonfolge mit kurzem Funkimpuls.
- Eintreffen und Rückkehr eigener Fahrzeuge: unterschiedliche dezente Rückmeldungen.
- Erfolgreicher Einsatz beziehungsweise Beteiligungsbeleg: Abschlussklang.
- Neue Leitstellenstufe: längere Erfolgsfolge.
- Neue Wache oder neues Fahrzeug: Bestätigung.
- Chatnachricht: kurze Funkmeldung ohne gesprochene Inhalte.
- Fehlermeldung: zurückhaltender Hinweiston.
- Bedienung von Schaltflächen: leiser Klick.

Die Musik wird bei wichtigen Effekten kurz abgesenkt. Die Lautstärkeänderungen erfolgen gleitend, ein Dynamikkompressor begrenzt Pegelspitzen. Es gibt keine dauerhafte Sirenenschleife.

## Bedienung

Der **Lautsprecher** im Hauptmenü und im Spiel schaltet den Ton ein oder stumm. Unter **Einstellungen → Musik & Spielsound** lassen sich Hintergrundmusik und Effekte jeweils aktivieren und von 0 bis 100 % einstellen. Zwei Testschaltflächen spielen Einsatzsignal und Funkprobe ab. Die Grundeinstellung ist 35 % Musik und 65 % Effekte.

Die Auswahl wird in diesem Browser gespeichert und gilt für beide Spielmodi. Sie verändert weder Konto noch Spielstände. Wenn der Browser das Speichern lokaler Einstellungen blockiert, funktionieren die Regler weiterhin für den aktuellen Besuch.

Audio startet erst nach einer Nutzerinteraktion. Beim Wechsel in ein anderes Fenster oder einen anderen Tab pausiert die Ausgabe. Mehrere Spiel-Tabs stimmen sich zusätzlich miteinander ab, damit nicht gleichzeitig mehrere Musikstücke laufen. Nach der Rückkehr setzt der aktive Tab die Musik fort; bei einer Browserblockade hilft ein Klick auf den Lautsprecher. Abmelden stoppt den Ton.

Neue Ereignistöne entstehen aus bestätigten Serverständen. Erstes Laden, Modus- oder Kontowechsel, wiederholte Stände und Wiederverbindung spielen keinen Bestand alter Einsätze nach. Gleichzeitige Änderungen werden priorisiert, wiederholte Effekte kurz begrenzt. Textmeldungen und alle Spielaktionen funktionieren auch ohne Audio-Unterstützung.

## AMP-Update

**Stoppen → Aktualisieren von `main` → erfolgreichen Build abwarten → Starten → Website neu laden.** Im Hauptmenü steht anschließend **Version 2.5.0**. Das bisherige Setup bleibt `node scripts/amp-setup.mjs`.

Dieses Update benötigt keine zusätzliche Datenbankmigration; Schema 4 und die neue Karte bleiben bestehen. Bestehende Spielstände, getrennte Spielmodi und der ruhige Einsatzrhythmus werden beibehalten. Frühere Kartenstände durchlaufen bei Bedarf weiterhin die bereits vorhandene Kartenmigration. Es gibt keinen Reset und keine neue Registrierung.

## Validierung und technische Grundlage

Automatisierte Prüfungen decken Ereignispriorität, doppelte und veraltete Stände, Konto-/Moduswechsel und unbrauchbare Einstellungen ab. Browserprüfungen messen tatsächlich erzeugtes Audio, Stummschaltung, Regler, Neuladen, Tabwechsel, Abmeldung und fehlende Audio-Unterstützung. Der vollständige Musikzyklus einschließlich Schleifenübergang und sämtliche Effekte werden mit OfflineAudioContext gerendert und auf messbaren Ton, Stereoverteilung und Pegel unter der Übersteuerungsgrenze geprüft. Maßgeblich ist der erfolgreiche CI-Lauf des jeweiligen Commits.

Die Wiedergabe berücksichtigt die [Web-Audio-Hinweise zu Nutzerinteraktion und Autoplay](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices); Hintergrundpausen verwenden [AudioContext.suspend](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/suspend).

Die Linux-CI stellt für Firefox und Chromium ein virtuelles Audio-Ausgabegerät bereit (PulseAudio-Null-Sink). Damit wird die echte Browser-Audiowiedergabe geprüft. Dieses Gerät gehört ausschließlich zum Testsystem; der AMP-Spielserver benötigt keine Audiohardware oder PulseAudio.

## Phase 1 ab Version 2.7

Notruf, Nur DME, DME + Sirene und Wachalarm ergänzen die bestehenden Ereignisklänge. Sie entstehen aus bestätigten Serverereignissen; ein wiederholter Snapshot oder die erste Ansicht nach Reload spielt keine alte Alarmierung erneut ab. Die drei Profile benutzen unterscheidbare synthetisierte Signale und die bestehenden Effektregler. Stumm bleibt der gesamte Ablauf durch Text, FMS und Historie bedienbar. Ein vollständiges Soundprofil-/Uploadsystem bleibt Phase 5.
