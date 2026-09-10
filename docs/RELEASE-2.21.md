# Version 2.21.0 – Einstieg, Menüs, Audio und Euro-Wirtschaft

> Historischer Nachweis des im Dokument genannten Stands. Frühere Karten, Bedienwege und Prüfzahlen sind keine aktuelle Produktanleitung. Aktuell: [Deutschland](DEUTSCHLAND.md), [Entwicklung](ENTWICKLUNG.md), [Laufzeitmessungen](TESTLAUFZEITEN.md).

Dieser Release bleibt ein Entwurf. Er installiert nichts auf einem Spielserver. Sein Tag und das Laufzeitpaket beziehen sich auf den im Release angegebenen geprüften main-Commit.

- Optionaler Lernweg mit 16 persistenten Kapiteln, echten Spielhandlungen und getrennten serverseitigen Übungen. Technische Hilfe, erste Lagemeldung, Brand, echte Wassernachforderung, Rückfahrt und Wiederaufnahme verwenden die vorhandene Simulation.
- Durchgängige Menü- und Formularüberarbeitung mit gemeinsamer Navigation, Entwurfs-/Doppelklickschutz, Fehlerzuständen, Fahrzeugvergleich, Suche und Filter. Die Deutschlandkarte und die einzige dauerhafte obere Bedienleiste bleiben erhalten.
- Gemeinsame Einstellungen im Hauptmenü und Spiel: Audio, Anzeige/Karte, Steuerung und Hinweise/Hilfe mit Vorschau, Übernehmen, Verwerfen, Standardwerten und Migration alter Gerätepräferenzen.
- Mehrkanal-Audio mit unabhängigen Pegeln, Hintergrundverhalten, Kommunikationsabsenkung, Musikarrangements und eigenen lokalen Audiodateien. Parallele Browser-Tabs vermeiden Doppelwiedergabe.
- Gebäude stellen ihre begrenzte Betriebsbesetzung und zulässige Standardqualifikation automatisch bereit. Neue Fahrzeuge benötigen keine manuelle Rekrutierung; tatsächliche Verletzungen und Bindungen bleiben wirksam.
- Sämtliche Spielgeldbeträge sind exakte Euro-Cent. Der vollständige Katalog ist neu bepreist; Kaufwerte, 60-Prozent-Verkaufserlöse, Einsatzabrechnung und begrenzte Grundfinanzierung werden serverseitig gebucht. XP bleiben getrennt.

## Aktualisierung und Migration

Vor Aktualisierung eine eigene vollständige Sicherung einschließlich persistenter Daten anlegen. Datenbankschema 14 ergänzt Tutorial- und Übungsstände. Währungs- und Preisversion sind getrennt: ein historischer virtueller Credit entspricht als offengelegte Spielregel 10 Euro. Historische Buchwerte bleiben erhalten; der einmalige Bestandsschutzausgleich wird separat gebucht. Die Migration legt vor Änderungen eine Sicherung an, ist transaktional und wiederholungssicher. Der CLI-Dry-Run verändert keine Daten.

Anleitung und Umfang: [Euro-Wirtschaft](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/EURO-WIRTSCHAFT.md), [automatische Besetzung](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/GEBAEUDEBESETZUNG-2.21.md), [Tutorial](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/TUTORIAL-2.21.md), [Menümatrix](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/MENUE-MATRIX-2.21.md) und [tatsächliche Abnahme](https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/ABNAHME-2.21.md).

Die vorhandenen Deutschland-Geodaten bleiben separat bestehen. Kein Datenreset, keine Änderung der Produktionsadresse und keine automatische Bereitstellung.
