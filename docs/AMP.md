# AMP-Betrieb ab 2.26

Programmupdate, einmaliger Reset und AMP-Verwaltung sind getrennte Vorgänge. Das private Spiel wurde durch Veröffentlichung dieser Dateien nicht umgestellt. Die Vorlage ist für Linux x64 mit Node 24 bestimmt. Caddy, Zertifikate, Routerregeln und andere AMP-Instanzen bleiben eigenständig.

## Einmalige Übernahme

1. Bisherige Spielinstanz stoppen. Tatsächlich verwendete `.env` und bestehende Datenpfade aufbewahren. Im AMP-Dateimanager den absoluten Programmordner mit `package.json` ermitteln; keine Beispielpfade einsetzen.
2. In der AMP-Hauptverwaltung unter **Configuration → Instance Deployment → Configuration Repositories** `Philipp284868/Leitstellen-Verbund:main` hinzufügen, **Fetch** ausführen und Browser neu laden. Die Vorlagendateien liegen wegen der AMP-Erkennung in der Repositorywurzel.
3. Generic-Instanz **LV – Leitstellen-Verbund** anlegen. Alte Instanz behalten und ausgeschaltet lassen. Erst Port-/Netzzuordnung, Sichtbarkeit des alten Programmordners und persistente Mounts prüfen. Zwei schreibende Server dürfen nie denselben Bestand benutzen.
4. Tatsächlichen Spielport, öffentliche Adresse und Bind-IP setzen. Bisher waren **7777** und **https://gaminglive.mooo.com** vorgesehen. `127.0.0.1` zum separaten Caddy funktioniert nur im selben Netzwerkraum; sonst den real erreichbaren Endpunkt verwenden.
5. Unter **Einmalige Übernahme → Bisheriger Programmordner** den bestätigten alten absoluten Programmordner eintragen. Leer bedeutet eine andere, neue Instanz, keine Übernahme. Bei getrennten Containern müssen alte Konfigurations-/Datenpfade in der neuen Instanz erreichbar eingebunden sein.
6. **Nach Update starten** zunächst ausschalten, **Update** ausführen. Der Starter übernimmt ausschließlich eine belegte Installation, sperrt den alten Einstieg, kopiert konsistent den Spielbestand und bindet gültige Geodaten weiter ein. Noch kein Fullreset. Anschließend Diagnose prüfen.

Der Erststarter kommt als versioniertes `amp-bootstrap.tar.gz` aus Release `v2.26.0`, einschließlich geprüftem Node 24.19.0 Linux x64 und Lizenz. Ein fehlendes Release ist ein Fehler, kein Anlass für einen lokalen Quellcodebuild. Normale Updates beziehen danach das neueste vollständig freigegebene Release ohne Betreiber-GitHub-Token. pnpm und Entwicklungsabhängigkeiten werden nicht installiert.

## Separater bestätigter Fullreset

1. **Betriebsaktion → Reset-Vorschau**, eindeutige **Reset-ID** eintragen, dann **Start**. Der Wartungslauf zeigt Instanzkennung, Weltgeneration, reale Pfade, betroffene Kategorien und vollständigen Bestätigungstext. Er endet absichtlich ohne laufenden Spielserver.
2. Genau diese Ausgabe prüfen und die konkrete Instanz bestätigen. Im AMP-Dateimanager `shared/config/reset-request.json` anlegen:

   ```json
   {
     "request": "DIESELBE-RESET-ID-AUS-DER-VORSCHAU",
     "confirmation": "VOLLSTÄNDIGER-CONFIRMATION-TEXT-AUS-DER-VORSCHAU"
   }
   ```

   Das sind Platzhalter. Der echte Text bindet Instanz, alte Weltgeneration und Reset-ID zusammen. Die private Resetdatei gehört nicht in Git.

3. **Betriebsaktion → Bestätigten Resetauftrag ausführen → Start**. Zuerst entsteht eine konsistente geprüfte SQLite-Sicherung einschließlich WAL-Zustand. Bei Sicherungsfehler bleibt die alte Welt erhalten und weitere Starts bleiben gesperrt. Erst danach aktiviert der Prozess eine leere Datenbank mit neuer Weltgeneration. Alte Konten, Rollen, Sitzungen, Besitzrechte, Einsätze, Warteschlangen und weltgebundene Uploads bleiben im privaten Sicherungsbereich.
4. Nach **„Einmaliger Reset abgeschlossen“** Betriebsaktion auf **Spiel starten** zurückstellen. Resetdatei kann entfernt werden; Journal unter `shared/state/` behalten. Dieselbe verbrauchte Reset-ID löscht neue Fortschritte nicht erneut.
5. **Start**, **„Spiel bereit“** abwarten. Spieler registrieren sich neu. Kein öffentliches Standardadministratorkonto und keine automatische Rechtevergabe an den ersten Besucher. Betriebsaktionen bleiben dem AMP-Betreiber vorbehalten.

Bei unterbrochenem Reset weder Kennung ändern noch Datenbank löschen. `shared/state/reset-<ID>.json` und Diagnose sichern. Bereits aktivierte Vorgänge können mit der ursprünglichen Bestätigung die abschließende Sicherungszuordnung fortsetzen; frühere unklare Zwischenstände halten sicher an.

Bei einer Übernahme zeigt die Vorschau zusätzlich `retiredSourceBackup`: Der ursprüngliche Datenordner bleibt als ausdrücklich markierte private Vor-Reset-Sicherung erhalten. Sein alter Starteinstieg ist gesperrt. Diese Sicherung ist keine zweite aktive Spielwelt und darf nicht als neues `DATA_DIR` verwendet werden. Sie kann auch auf einem anderen persistenten Datenträger liegen; der Reset verschiebt keine fremden Mounts.

## Spieladministrator kontrolliert freigeben

Zuerst das gewünschte Konto regulär registrieren und den Spielserver stoppen. Diagnose liefert Instanzkennung und aktuelle Weltgeneration. Im AMP-Dateimanager `shared/config/operator-request.json` mit diesen echten Werten anlegen:

```json
{
  "instance": "INSTANZKENNUNG-AUS-DER-DIAGNOSE",
  "generation": "WELTGENERATION-AUS-DER-DIAGNOSE",
  "username": "EXAKTER-REGISTRIERTER-BENUTZERNAME",
  "confirm": true
}
```

**Betriebsaktion → Spieladministrator freigeben → Start** prüft die Zuordnung und sichert zuerst die Datenbank. Es entsteht kein Konto und kein Standardpasswort. Die gesonderte Berechtigung erlaubt den geschützten Betreiberstatus unter `/api/operator/status`; normale Spieler erhalten dort keinen Zugriff. AMP-Benutzerrechte werden nicht geändert. Danach die private Antragsdatei entfernen und die Betriebsaktion auf **Spiel starten** zurückstellen. Ein Fullreset entfernt auch diese spielinterne Berechtigung; ein alter Antrag gilt nicht für die neue Weltgeneration.

## Danach: normales Update

**Update** lädt und prüft ein fertiges vollständiges Paket, sichert Daten und aktiviert den neuen Versionsordner. Mit **Nach Update starten** nutzt die Vorlage AMP-eigenes `StartApplication` und `WaitForStartupComplete`. Ohne diese Option: **Update → Start**. AMP bleibt Prozessverwalter. Normales Starten lädt keine neue Version herunter.

Die interne Bereitschaft bindet Build, Instanz, Weltgeneration und einmaliges Starttoken. Spielaktionen und Socket-Anmeldung bleiben bis zur Freigabe gesperrt. Danach erfolgt keine automatische Datenbankrücksetzung. Ein fehlgeschlagener Start darf nur auf eine kompatible Programmversion zurückfallen; ungeklärte Schemawechsel halten an. Vor-Reset-Welten sind kein automatischer Wiederherstellungsweg.

## Feste Ablage

```text
leitstellen-instance/
  launcher/                 stabiler Betriebseinstieg
  node/                     versionierte Node-Laufzeit samt Lizenz
  releases/<version-sha>/   vollständige Programme
  current.json              aktive Versionszuordnung
  previous.json             vorige Versionszuordnung
  shared/config/.env        einzige aktive private Konfiguration
  shared/state/             Instanzkennung, Sperre und Journale
  shared/data/<generation>/ aktive Konten und Welt
  shared/geodata/           neue Instanzen; Übernahmen behalten belegten Pfad
  shared/uploads/           weltgebundene Dateien
  shared/backups/           private geprüfte Sicherungen
  shared/logs/              Betriebsbereich; Konsole verwaltet AMP
  staging/                  temporäre Downloads und Prüfungen
```

Dauerhafte Bereiche einschließlich übernommener äußerer Geodaten müssen tatsächlich persistent eingebunden sein. Nach erfolgreichem Betrieb werden nur eindeutig verwaltete veraltete Releases und Zwischenordner entfernt. Aktive, vorige und zuletzt funktionierende Version bleiben erhalten. Sicherungen und Journale werden nicht automatisch gelöscht; AMP begrenzt seine Konsolenlogs.

## Konfiguration, Diagnose und Wiederherstellung

AMP-Felder für Port, Adresse und Bind-IP haben Vorrang vor `shared/config/.env`; Datenpfade stammen ausschließlich aus der Instanzkennung. Quellen werden beim Start genannt, private Tokens nicht. Beispiel für Caddy im selben Netzwerkraum:

```dotenv
HOST=127.0.0.1
PORT=7777
PUBLIC_URL=https://gaminglive.mooo.com
ALLOW_HTTP=false
TRUSTED_PROXIES=127.0.0.1,::ffff:127.0.0.1
```

Proxyadressen sind vor Ort zu prüfen. Keine pauschalen Netze oder HTTPS-Ausnahmen zur Umgehung einer falschen Zuordnung. Geodaten und Routerwerkzeuge werden wiederverwendet, nicht beim Reset neu importiert.

**Betriebsaktion → Instanz anzeigen → Start** liefert die Diagnose ohne Geheimnisse. Für betreute Wartung unterstützt der gemeinsame Einstieg `unlock --confirm`; ausschließlich nachweislich verwaiste Sperren werden entfernt. Fehlende Datenbanken und widersprüchliche Zuordnungen sind Fehler, keine Aufforderung zum Erzeugen einer Ersatzwelt.

Sicherungen besitzen Prüfsumme, Herkunftsversion und Weltgeneration. Wiederherstellung gehört zu einer gestoppten konkret geprüften Instanz. Fremde Generationen und Vor-Reset-Welten werden abgelehnt. Keine Hauptdatei einer laufenden WAL-Datenbank kopieren und keine Backups öffentlich hochladen.

Fehlt ausschließlich `shared/config/.env`, stellt der Starter ihre zuletzt erfassten privaten Bytes aus der hashgeprüften, an die Instanz gebundenen `shared/state/config-recovery.json` wieder her. Fehlt auch dieser Beleg oder die Instanzkennung, hält er an. Keine Werte oder Pfade werden geraten.

Technische SQL-Migrationen liegen versioniert im Paket. Vor einem Update laufen sie zuerst gegen die geprüfte Sicherungskopie und erst danach in einer Transaktion gegen die aktive Datenbank. Bis zur Spielerfreigabe darf ein fehlgeschlagener Start bei Schemaänderung die unmittelbar vorherige Sicherung wiederherstellen. Nach der Freigabe ist dieser automatische Rückfall gesperrt. Ungeklärte unterbrochene Migrationen bleiben angehalten; kein erneuter Reset und keine endlosen Startversuche.

## Prüfgrenze

Vorlage und Update-Stufen folgen den [offiziellen Generic-Modul-Feldern](https://github.com/CubeCoders/AMP/wiki/Configuring-the-'Generic'-AMP-module). Paketbetrieb, Reset und Prozesssignale werden isoliert mit kleinen Geodaten geprüft. Private AMP-Version, Vorlagenübernahme, Mounts, Caddy und öffentliche Erreichbarkeit benötigen eine Vor-Ort-Prüfung. Diese Anleitung bestätigt keine bereits erfolgte private Einrichtung.
