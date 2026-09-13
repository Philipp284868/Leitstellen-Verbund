# Desktop-HUD im Hauptmenüstil · 2.27.1

Die neue Nutzerfreigabe vom 13.09.2026 ersetzt die weiße Gestaltung aus 2.27.0 durch den Stil des vorhandenen Hauptmenüs. Das beigefügte Bild zeigt dieses tatsächliche Hauptmenü. Die kompakte HUD-Anordnung und Bedienung aus 2.27.0 bleiben bestehen.

## Gestaltung und Integration

`src/client/DesktopHud.css` verwendet jetzt die gemeinsamen Farben aus `HudTheme.css`: dunkle blaugrüne Flächen, helle Schrift, dezente Konturen und kleine Rundungen. Das geöffnete Menü und aktive Reiter haben warme rote Akzente; die XP-Leiste übernimmt den warmen Ton aus dem Hauptmenü. Fahrzeug-, Einsatz- und Dringlichkeitsfarben behalten ihre fachliche Bedeutung.

Kartensteuerung, Quellenangaben, Statuskarten, Funk-/Einsatzvorschau sowie bestehende Einsatz- und Verwaltungsdialoge sind entsprechend gestaltet. Die Karte erhält keine zusätzliche Abdunklung und keinen neuen Filter. Die bisherige weiße HUD-Gestaltung wurde ersetzt, nicht als zweite Stil-Schicht darübergelegt.

`src/client/App.tsx` verwendet für das Ingame-HUD den neutralen Kontext `desktop-hud`. Die gespeicherte Helligkeitsoption bleibt auf das Hauptmenü beschränkt. `src/client/Settings.tsx` erklärt diesen Geltungsbereich. Eine bereits gespeicherte helle Einstellung darf die Ingame-Dialoge nicht wieder weiß einfärben.

Keine neue Abhängigkeit, Datenmigration oder Änderung an Spielregeln, Routing, Konten, Geodaten, Ratenbegrenzung und privater AMP-Konfiguration.

## Prüfung

Die bestehenden gebauten Browserabläufe für Desktop-HUD, Hauptmenü, Einstellungen, Notruf/Disposition und Funk bestanden lokal in Edge: 25 Tests. Projekt-/Formatprüfung, Lint, Typecheck und Produktionsbuild wurden erfolgreich ausgeführt.

Die sechs Größen-/Skalierungsfälle in `tests/e2e/desktop-hud.spec.ts` prüfen nun zusätzlich die gemeinsame Hauptmenüpalette, helle Schrift auf dunklen Flächen und dunkle Unterdialoge. Bei 125 Prozent ist bewusst eine gespeicherte helle Hauptmenüpräferenz gesetzt, um deren Abgrenzung zum HUD zu prüfen. Die übrigen Geometrie-, Tastatur-, Karten- und Einsatzprüfungen bleiben erhalten.

Abnahmebilder werden im tatsächlich gebauten Spiel aufgenommen, einschließlich der vorhandenen vollständigen Deutschlandkarte mit einem isolierten lokalen Testkonto. Automatisierte CI-Browserprüfungen verwenden weiterhin kleine reproduzierbare Geodaten-Fixtures. Die Messprüfung kontrolliert unveränderte Kartenposition und Karteninstanz sowie ausbleibende zusätzliche Standortabfragen bei Menü- und Reiterwechsel.

Für die endgültige Freigabe gelten die erfolgreichen CI-/Sicherheitsläufe und die `acceptance.json` des veröffentlichten Releases. Der bestehende AMP-Updateweg bleibt unverändert. Eine Veröffentlichung auf GitHub bestätigt keine bereits erfolgte Installation auf einem privaten Server.
