# Privater AMP-Updateweg

Die vorhandenen Generic-Instanzen weiterverwenden. Dieser Übergang benötigt weder eine neue Spielwelt noch einen Reset. Repository-Sichtbarkeit, lokale AMP-Vorlagen und installierte Programmversion sind getrennte Betriebsschritte.

## Einmalige Einrichtung vor dem Sichtbarkeitswechsel

1. Aus dem freigegebenen, vollständig geprüften Spielrelease `amp-bootstrap.tar.gz` beziehen und gegen `bootstrap.json` prüfen. Es enthält den neuen stabilen Starter, offizielles Node 24.19.0 mit Lizenz, `templates/LOCAL-LeitstellenPrivate-main` und das Werkzeug `provision/configure-private-access.py`. Vorhandenen Starter separat sichern. Nur `node/` und `launcher/` im bestätigten Instanzwurzelpfad aktualisieren; `shared/`, Versionen, Konfiguration, Daten und Geodaten bleiben erhalten.
2. Für Caddy das geprüfte `amp-caddy-runtime.zip` und `amp-caddy-private-template.zip` beziehen. Vorhandene Betriebsdateien sichern und einmalig kontrolliert austauschen. Konfiguration, `storage.path`, Zertifikats- und Schlüsseldateien bleiben erhalten. Caddy benötigt Python 3 auf dem Linux-Host; im lokalen Container-Template ist das Paket angegeben.
3. Die beiden `LOCAL-…-main`-Vorlagenordner in `Plugins/ADSModule/DeploymentTemplates/` der AMP-Hauptverwaltung bereitstellen. Danach jeweils die Vorlage der **bestehenden** Instanz aktualisieren. Die lokalen Updatequellen enthalten keinen anonymen Download eigener Programmteile. Hauptverwaltungs-Template und Anwendungsupdate jeweils separat prüfen. Erst nach erfolgreichem lokalem Import die bisherigen eigenen GitHub-Configuration-Repositories aus der Abrufliste nehmen; CubeCoders-Vorlagen erhalten.
4. Der Betreiber erstellt selbst einen Fine-grained GitHub-Lesezugang für die beiden Repositories: **Contents: Read-only**, automatisch notwendige Metadata-Leserechte, keine Administration oder Issues-Schreibrechte. Für die Abnahme wird zusätzlich die private Ein-Datei-Testressource `Leitstellen-Verbund-Privatzugriffstest` ausgewählt. Das ist kein Programm-Mirror.
5. Das mitgelieferte Einrichtungsskript als tatsächlicher AMP-Betriebssystembenutzer in einem interaktiven SSH-Terminal aufrufen. Die beiden Pfadargumente sind die verifizierten absoluten Instanzpfade. Das Werkzeug fragt den Token verdeckt ab, prüft den privaten Dateizugriff und den anonymen Ausschluss und speichert erst danach. Token niemals als Argument, Umgebungsvariable, Chatnachricht oder unmaskiertes AMP-Feld eingeben.

```text
python3 configure-private-access.py --game-root BESTÄTIGTER_SPIEL_INSTANZPFAD --caddy-base BESTÄTIGTER_CADDY_SERVERFILESPFAD
```

Die Zugangsdaten liegen außerhalb der Programmversionen in `shared/secrets/github-read-token` beziehungsweise Caddys `private/secrets/github-read-token`. Ordner 0700, Datei 0600, Besitzer ist der AMP-Prozessbenutzer; Links auf fremde Pfade werden abgelehnt. Rotation erfolgt durch erneute verdeckte Einrichtung. Nur in einem separat geschützten Betreiberbackup sichern, niemals in Diagnoseexporten oder im Webroot.

## Prüfung und Umschaltung

Vor der Privatumschaltung beide echten Paketdownloads und die private Testdatei mit dem minimalen Betreiberzugang prüfen. Ein Test mit dem administrativen Entwicklungszugang ersetzt das nicht. Fehlender/widerrufener Zugang, falsche Prüfsumme und unvollständiges Archiv müssen vor dem kontrollierten Programmstopp scheitern. Das Verhalten der installierten AMP-Version beim Klick auf Update ist zusätzlich vor Ort zu prüfen; der Updater selbst prüft das vollständige Paket vor seinem Stopp.

Dann beide Repositories tatsächlich über die berechtigte GitHub-Verwaltung privat stellen. Authentifizierte Metadaten müssen `private: true` bestätigen. Anonyme Repository-, Source- und Assetabrufe müssen scheitern; danach Update, Wiederholungsupdate und Start beider Anwendungen prüfen. Installierter Spielserver und Caddy starten ohne GitHub-Zugang. Geodaten aus privaten eigenen Releases werden über authentifizierte API-Metadaten und geprüfte Assetstreams aufgelöst. Offizielle Node-/Java-/Caddy-Quellen dürfen öffentlich bleiben.

Normaler Betrieb danach: **AMP → Update → Start**, beziehungsweise die bestehende Option „Nach Update starten“. Bei Zugangsproblemen keine Neuinstallation und kein automatisches Zurückstellen auf öffentlich. Versionspakete und letzte funktionsfähige Installation erhalten.

Eine alte Pages-Konfiguration, Packages, Releases und Zugriffsrechte sind getrennt zu prüfen. Am 14.09.2026 meldete GitHub für das Spiel noch eine öffentliche Pages-Konfiguration; für die Package-Inventarliste fehlte dem vorhandenen Entwicklungszugang `read:packages`. Der persönliche Tarif war in der API-Antwort nicht enthalten. Keine kostenpflichtige Änderung und kein stilles Entfernen von Schutzprüfungen. Die interne Spieler-Wiki benötigt weder GitHub-Wiki-Freischaltung noch ein Spielerkonto bei GitHub.

Private Sichtbarkeit schützt künftige unberechtigte Abrufe. Bereits verteilte Kopien, ausgelieferter Browsercode und Drittlizenzen bleiben davon unberührt. Fehlerberichte verwenden einen getrennten, minimal berechtigten Issues-Zugang; Spieler erhalten eine Bestätigungsnummer ohne privaten Issue-Link.
