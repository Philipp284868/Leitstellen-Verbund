# Gemeinsam auf dem eigenen Server spielen

1. Der Administrator richtet den Server und sein erstes Konto gemäß [AMP.md](AMP.md) ein.
2. Unter Einstellungen → Serververwaltung erstellt er je Freund einen einmaligen Einladungscode (drei Tage gültig).
3. Jeder Freund öffnet dieselbe Serveradresse und wählt Mit Einladung registrieren. Benutzername und Passwort gehören nur diesem Konto; jeder startet mit eigenen 250.000 Credits.
4. Nach Anmeldung verbindet sich die Anwendung automatisch per Socket.IO. Es gibt keine Angebote, Antworttexte oder Router-/STUN-Konfiguration im Spiel.
5. Jeder baut eine Feuerwache, beschafft Fahrzeuge und weist geeignete Besatzung zu.
6. Ein Spieler öffnet einen Einsatz und wählt Mit Freunden teilen. Im Freunde-Bereich der anderen Konten erscheint der freigegebene Einsatz. Unter Eigenes Fahrzeug anbieten kann jeder ein eigenes einsatzbereites Fahrzeug schicken.

Die Einsatzfreigabe erlaubt die Unterstützung durch die eingeladenen Konten des Servers. Besitz und Guthaben werden nicht zusammengelegt. Der Server prüft und reserviert jedes Fahrzeug; doppelte Alarmierungen sind ausgeschlossen. Erst tatsächliche Ankunft zählt für Fähigkeiten und Helferbelohnung. Patienten werden auch durch Helfer tatsächlich zum Krankenhaus gebracht.

Bei bestätigter Unterstützung bekommt der Einsatzgeber die Hälfte der Grundbelohnung, die andere Hälfte teilen bestätigte Helfer, jeweils abgerundet. Ohne Helfer erhält er die volle Belohnung. Wiederholte Anfragen und Neuverbinden zahlen keinen Abschluss doppelt aus. Bis zu vier unterstützende Konten sind je Einsatz möglich.

Ein geschlossener Browser beendet keine Simulation und keine Kooperation. Bei erneuter Anmeldung erscheint der aktuelle Serverstand. Bei ausdrücklichem Kooperationsabbruch kehren fremde Fahrzeuge zurück; ein laufender Patiententransport muss zuerst enden. Es gibt keinen Browserhost und keinen automatischen Koordinatorwechsel.

Der Gruppenchat ist Klartext und flüchtig (500 Zeichen, höchstens zwei Nachrichten pro Sekunde). Weitere Browser oder Geräte können dasselbe eigene Konto nutzen. Offline werden keine Aktionen bestätigt. Bei Serverproblemen den Betreiber kontaktieren; alte Dateien nur nach dessen ausdrücklicher Freigabe übernehmen lassen.
