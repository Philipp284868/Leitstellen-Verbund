# AMP-Einfachstart – Version 2.1

Keine zusätzliche Hilfsdatei, kein SSH und kein Wechsel der Startdatei mehr.
Die bestehende Serverversion mit sämtlichen Spielinhalten bleibt erhalten.

## Einmal aktualisieren, normal starten

Die vorhandene Netzwerkkonfiguration in `.env` und das dauerhafte Datenverzeichnis bleiben unverändert. Beide müssen korrekt eingerichtet sein; ein GitHub-Update konfiguriert weder den Router noch ein Container-Volume. Den in AMP bereits verwendeten Serverbranch `feature/amp-authoritative-server` nach Integration dieser Erweiterung aktualisieren. `main` erst verwenden, wenn der Server-Umbau tatsächlich dorthin übernommen wurde.

| AMP-Feld | Wert |
| --- | --- |
| Node.js Release Stream | `24` |
| Node.js Version | leer |
| npm Install Type | `None` |
| Run App Setup Commands | eingeschaltet |
| App Setup Commands | `node scripts/amp-setup.mjs` |
| App Name | **`dist/server/index.js`** |
| App Installation Location | leer |
| Run App Pre-start Commands | ausgeschaltet |

Spiel stoppen, in AMP **Aktualisieren** und den erfolgreichen Build abwarten, dann **Start**. Die App bleibt danach als Spielserver laufen. Die CLI bleibt als optionales Verwaltungswerkzeug erhalten, ist für die Ersteinrichtung aber nicht mehr erforderlich.

Bei einer noch leeren Datenbank legt der normale Start automatisch den Administrator **`philipp`** mit einem kryptografisch zufälligen individuellen Passwort an. Kein festes Standardpasswort. Erst danach wird die Spieladresse geöffnet.

## Wo die Zugangsdaten stehen

Im AMP-Dateimanager liegt anschließend **`admin-konto.json` neben `package.json` und `.env`**. Die Datei wird erst auf deinem Server angelegt, nicht von GitHub heruntergeladen. Darin stehen `benutzername` und zunächst `passwort`. Vor dem ersten Anmelden in einem Passwortmanager sichern. Nach erfolgreicher Anmeldung wird das Startpasswort aus dieser Datei entfernt; es bleibt unverändert als scrypt-Hash in der Datenbank. Ein leeres Feld bedeutet nicht, dass das Konto kein Passwort hat.

Die Datei darf ausschließlich privat über AMP/SFTP bearbeitet werden. Sie wird nicht vom Spiel-Webserver ausgeliefert, ist in `.gitignore` eingetragen und hat unter Linux Dateirechte `0600`. Während der Ersteinrichtung oder einer beantragten Änderung enthält sie kurzzeitig ein Klartextpasswort. Sicherungen und Dateimanager-Zugänge entsprechend schützen. Nicht auf GitHub hochladen, nicht nach `public` oder `dist/client` verschieben und keine Screenshots der Zugangsdaten weitergeben. Vorhandene alte `ADMIN-ZUGANG.txt`-Dateien aus einem früheren Hilfsverfahren ebenfalls privat halten und nach gesichertem Zugang entfernen.

## Benutzername oder Passwort ändern

1. Spielanwendung in AMP **Stoppen**.
2. In `admin-konto.json` die gewünschten Felder bearbeiten und **`aenderungenAnwenden` auf `true` setzen**.
3. Speichern und in AMP **Start** drücken. Keine Aktualisierung und kein Build nötig.

| Feld | Bedeutung |
| --- | --- |
| `benutzername` | Loginname, 3–32 Zeichen: Kleinbuchstaben, Ziffern, `_` und `-` |
| `anzeigename` | Sichtbarer Name, 1–48 Zeichen |
| `leitstelle` | Name der Leitstelle, 1–48 Zeichen |
| `passwort` | Neues Passwort mit 12–128 Zeichen; leer lassen, um das aktuelle zu behalten |
| `aenderungenAnwenden` | Nur für eine bewusst gewünschte Änderung auf `true` setzen |

`version`, `auftrag` und `status` nicht von Hand ändern. JSON benötigt doppelte Anführungszeichen und kennt keine Kommentare. Nach Übernahme setzt der Server den Schalter zurück auf `false` und leert das Passwortfeld. Änderungen werden nicht bei jedem Neustart erneut ausgeführt. Alle Sitzungen dieses Administrators werden nach einer angewendeten Änderung widerrufen, anschließend neu anmelden. Das Passwort kann auch weiterhin im angemeldeten Spiel geändert werden.

## Bereits vorhandene Konten und Fehler

Ein bereits angelegter Administrator wird übernommen, **ohne das Passwort, den Kontobesitz oder den Spielstand zurückzusetzen**. `philipp` wird dann nicht zusätzlich angelegt. Der Dateieintrag enthält den bestehenden Kontonamen und ein leeres Passwortfeld. Ein vergessenes Passwort kann über die ausdrücklich bestätigte Dateiänderung neu gesetzt werden.

Die Zuordnung zum vorhandenen Administratorkonto wird in der Datenbank gespeichert. Das Ändern des Login-Namens übernimmt nicht ein fremdes Spielerkonto und befördert keine Spieler. Bei mehreren nicht eindeutig zuordenbaren Administratoren oder beschädigten Daten hält die Einrichtung an, statt Konten zu erraten.

Vor einer Änderung an einem bestehenden Administrator wird eine konsistente Datenbanksicherung angelegt. Kontenänderung, Sitzungssperre und Auftragsbeleg werden gemeinsam transaktional gespeichert. Ein nach einem Absturz erneut gelesener, bereits bestätigter Auftrag wird nicht nochmals ausgeführt. Ältere Auftragsdateien werden nicht als neuer Passwortwechsel akzeptiert. Es werden keine schnellen, offline erratbaren Passwort-Prüfsummen zusätzlich zum scrypt-Hash gespeichert.

Ungültiges JSON, zu kurze Passwörter, belegte Benutzernamen, Symlinks und parallele Bearbeitungen erzeugen eine Meldung ohne Passwortausgabe. Keine Datenbank oder Lockdatei zum Beheben eines Anmeldeproblems löschen. Eine ungültige Datei korrigieren und normal neu starten. Wird die Datei gelöscht, legt ein späterer Start bei vorhandenen Konten nur die Konfiguration erneut an, kein neues Passwort.

Netzwerk, dauerhafte Daten, HTTPS, Backup und Restore: [AMP-Betriebsanleitung](AMP.md). Der Heimnetztest mit HTTP ersetzt keine HTTPS-Einrichtung für den öffentlichen Zugriff.
