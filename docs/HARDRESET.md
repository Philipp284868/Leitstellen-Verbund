# Einmaliger Spieler-Hardreset über AMP (ab 2.2.1)

**Löscht sämtliche Konten einschließlich Passworteinträgen/Sitzungen und alle Wachen, Fahrzeuge, Personal, Einsätze, Guthaben, Fortschritte und Protokolle in der ausgewählten Spiel-Datenbank. Alle Spieler müssen sich neu registrieren.** Dieser Vorgang ist absichtlich nicht bei jedem Update oder Spielstart aktiv. Er steht nicht über eine HTTP-API oder für Spielerkonten zur Verfügung.

Die Ausführung muss einmalig vom Serverbetreiber in AMP veranlasst werden. GitHub-Zugriff bedeutet keinen Zugriff auf den privaten Spielserver. Das Bereitstellen dieser Version löscht noch keine Spieler auf dem echten Server.

## In AMP ausführen

1. Spielanwendung stoppen. Geplante automatische Starts/Updates vorübergehend pausieren. Keine zweite Instanz mit demselben DATA_DIR laufen lassen. Die AMP-Verwaltung darf geöffnet bleiben.
2. Auf Branch **main** aktualisieren und den erfolgreichen Setup-Abschluss abwarten. Setup bleibt `node scripts/amp-setup.mjs`, Node.js Release Stream bleibt `24`, npm Install Type bleibt `None`. Nicht den normalen Spielprozess starten.
3. Unter **Configuration → NodeJS App Runner → App** vorübergehend **App Name = `scripts/hard-reset.mjs`** und **App Command Line Arguments = `--confirm-delete-all-player-data --request reset-20260906`** eintragen. **Node.js Command Line Arguments** leer lassen. Arbeitsverzeichnis wie bisher die Programmwurzel (`App Installation Location` leer). Pre-start-Befehle bleiben aus.
4. Speichern und einmal **Start** drücken. Der Prozess prüft die Sperre und führt den Reset aus. Bei Erfolg steht **HARDRESET ERFOLGREICH** in der Konsole; der Wartungsprozess beendet sich absichtlich. Dies ist kein laufender Spielserver.
5. Nur nach Erfolg: **App Name = `dist/server/index.js`**, **App Command Line Arguments vollständig leeren**. Speichern und normal starten. Die neue leere Datenbank entsteht automatisch. Im Browser neu laden und über **Neues Konto erstellen** neu registrieren.

Die Kennung `reset-20260906` ist für diesen einen Auftrag. Im Datenordner wird `hard-reset-reset-20260906.json` als privater Ausführungsbeleg ohne Spieler-/Passwortdaten gespeichert. Derselbe Auftrag löscht später angelegte Spieler nicht erneut. Den Beleg nicht löschen und die Kennung nicht ändern, um eine Fehlermeldung zu umgehen. Ein absichtlich später gewünschter zweiter Reset benötigt einen neuen Auftrag und wieder den ausdrücklichen Löschschalter.

## Was gezielt entfernt wird

Der verwendete Datenpfad ist derselbe wie beim Spiel: `DATA_DIR` aus Prozessumgebung beziehungsweise lokaler `.env`. Bei leerem Wert wird `leitstellen-data` neben der Programmwurzel verwendet. Der Pfad wird vor der Ausführung in der Konsole genannt. Eine vorhandene `.env` wird nicht verändert. Ein nicht existierender, verknüpfter oder mit dem Programmverzeichnis überlappender Datenordner wird zurückgewiesen.

Im gewählten Datenordner werden ausschließlich folgende bekannte Dateien entfernt:

- `game.sqlite` und die zugehörigen `-wal`, `-shm`, `-journal`-Dateien.
- Generierte Migrationssicherungen `pre-migration-<Zeit>.sqlite` beziehungsweise `pre-migration-v2-<Zeit>-<UUID>.sqlite` sowie bekannte `restore-<UUID>.sqlite`-Zwischendateien und deren SQLite-Nebendateien.
- Automatische Spielbackups in `backups/` mit Namen `game-<Zeit>-<UUID>.sqlite` und deren SQLite-Nebendateien. Ein danach vollständig leerer Backupordner wird entfernt.

In der Programmwurzel werden die bekannten überholten Dateien **`admin-konto.json`**, **`ADMIN-ZUGANG.txt`**, **`amp-admin-einrichten.mjs`** und von der alten Admin-Funktion erzeugte `admin-konto.json.<UUID>.tmp` entfernt, falls vorhanden.

**Es wird vor diesem ausdrücklich gewünschten Hardreset keine neue Kopie der zu löschenden Spielerdaten angelegt.** Wer noch eine Rückkehrmöglichkeit benötigt, muss vor der Ausführung eine eigene konsistente externe Sicherung anlegen. Nach Löschen der lokalen Spielbackups gibt es durch dieses Werkzeug keinen Rückgängig-Knopf. Es handelt sich um normales Entfernen von Dateien, nicht um garantiert forensisch sichere Datenträgerlöschung.

## Was erhalten bleibt

Spielcode, Karte, Spielkataloge, `package.json`, Lockdatei, `node_modules`, `.tools`, `.git`, `.env`, Port-/Domainkonfiguration, AMP-Benutzer und AMP-Einstellungen bleiben erhalten. Auch Quellen, Tests und Dokumentation sind weiterhin für Builds beziehungsweise Prüfungen erforderlich und werden nicht als vermeintlicher Datenmüll gelöscht.

Fremde Dateien, Unterverzeichnisse und nicht eindeutig zum Spiel gehörende Sicherungsnamen werden nicht rekursiv entfernt. Eigenständige AMP-Sicherungen, externe Snapshots und bei Spielern heruntergeladene Exporte beziehungsweise Browserkopien liegen außerhalb des Umfangs. Diese können noch historische Daten enthalten; sie werden nicht automatisch importiert. Das Werkzeug kann nicht auf Dateien fremder Browser zugreifen.

## Sperre und Fehler

Eine bestehende `server.lock` wird nur entfernt, wenn ihre gespeicherte positive Prozessnummer mit Signal 0 nachweislich nicht mehr existiert. Ein laufender oder wegen Berechtigungen unklarer Prozess wird weder beendet noch übergangen. PID-Wiederverwendung, eine andere Container-PID-Umgebung oder eine beschädigte Sperrdatei können deshalb bewusst zum Abbruch führen. In dem Fall die konkrete Prozess-/Container-Situation prüfen lassen, nicht die Datenbank oder Sperrdatei blind löschen.

Während des Resets wird die gleiche exklusive Sperre wie beim Spiel gehalten. Das Verfahren setzt voraus, dass keine anderen Prozesse dieselben Dateien außerhalb dieses Sperrprotokolls bearbeiten. Symlinks, Hardlinks und nicht reguläre Löschkandidaten werden vor Beginn abgelehnt; es gibt keinen rekursiven Löschaufruf auf DATA_DIR. Bei einer Unterbrechung nach Beginn bleibt ein ausstehender Beleg und die Sperre bestehen, statt einen Teilreset als erfolgreich zu melden. Dann bleibt die Anwendung gestoppt, bis der Zustand geklärt ist.

Bei einer erfolgreichen Wiederholung steht **Dieser Reset ist bereits erledigt. Keine weiteren Daten gelöscht.** Ein unvollständiger Auftrag hat diese Erfolgsmeldung ausdrücklich nicht.

## Prüfung und Grenzen

`node --test tests/hard-reset.node.mjs` prüft zielgenaue Bereinigung, Erhalt von Konfiguration und fremden Dateien, doppelte Aufträge, echte lebende/beendete Prozessnummern, Symlinks/Hardlinks, ungültige Pfade, beschädigte Sperren und unterbrochene Aufträge. Unter Node 24 kommt ein echter Produktionsprozess-Test hinzu: Konten registrieren, Server stoppen, Reset-CLI ausführen, Server neu starten, alte Anmeldung ablehnen, neue Registrierung erlauben und bei Wiederholung die neue Welt erhalten. Unter anderen Node-Versionen ist ausschließlich dieser Node-24-Integrationstest ausdrücklich übersprungen. CI verwendet Node 24 und darf dort keine übersprungene Integration als bestanden ausgeben.

Das normale `test`-Skript führt zunächst die bestehende Vitest-Suite und danach diese zusätzlichen Prüfungen aus. Browserprüfungen bleiben unverändert. Tatsächliche Ergebnisse stehen im zum Commit gehörenden GitHub-Actions-Lauf.

Dieser Reset verändert weder DNS-/Router-/HTTP-/HTTPS-Einstellungen noch den separat bekannten Browser-UUID-Fehler bei HTTP außerhalb von localhost. Er ist keine Lösung für ein Netzwerkproblem und kein Nachweis, dass die öffentliche Spieladresse erreichbar ist.
