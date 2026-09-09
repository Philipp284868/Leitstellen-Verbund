# Gemeinsame Lagen, Notrufe und erreichbare Einsatzorte

Die Serverwelt besitzt eine gemeinsame, gespeicherte Lage. Alle unabhängigen Leitstellen und ihre berechtigten Disponenten sehen dieselbe ID, Zeit, Phase und Region, auch nach späterem Login oder Serverneustart. Eine öffentliche Lage gibt keinen Zugriff auf fremde Einsätze. Unterstützungsanfragen benötigen weiterhin eine Zusage.

## Lageverlauf und tatsächliche Wirkung

Die Profile heißen Ruhig, Normalbetrieb, Sturm, Starkregen/Hochwasser, Hitze/Trockenheit und Winterglätte. Eine Folge besteht aus Ankündigung (10 Minuten), Anstieg (15), Hauptphase (30), Abklingen (15) und Erholung (30). Nach einer besonderen Lage folgt ein ruhiger Zyklus. Seed und Folgenummer bestimmen weitere Profile und eine Intensität zwischen 0,65 und 1. Das sind Spielparameter, keine Wettervorhersagen oder amtlichen Warnstufen.

Ruhige Lagen verlängern die Generierungsintervalle. Besondere Lagen gewichten tatsächlich vorhandene passende TH-, Verkehrs-, Wasser-, Vegetations- und medizinische Szenarien stärker. Die Hauptphase erhöht den Nachfragefaktor maximal auf 1,8. Erholung senkt ihn auf 0,45. Szenarien bleiben an vorhandene Fähigkeiten, freie Kapazität und erreichbare Standorte gebunden. Die Auswahl gewichtet zuerst Kategorien; ein größerer Variantenkatalog vervielfacht nicht automatisch die Häufigkeit einer Kategorie.

Wetter wirkt auf Straßenfahrzeiten, örtliche Gefahren, Brandausbreitung und modellierte Patiententemperaturen. Regionale Wirkungen gelten am Einsatzort beziehungsweise auf dem betroffenen Fahrabschnitt, auch bei anreisender Hilfe von außerhalb. Behobenes Wetter räumt keine ungelösten Hindernisse weg: Einsatzbedingte Sperrungen bleiben bis zur Beseitigung ihrer Ursache bestehen. Ein Sturm aktiviert keine Katastrophenbereitschaft.

Ein Einstieg mit weniger als drei abgeschlossenen Einsätzen erlaubt höchstens einen offenen Einsatz und einen wartenden Anruf. Weniger als drei Fahrzeuge erhalten auch im Sturm keinen erhöhten Nachfragefaktor. Danach gelten die bestehenden Flotten-, Warte- und Belastungsgrenzen. Verpasste Generierungsintervalle werden nicht als nachträgliche Anrufwelle ausgespielt; ein Zeitsprung wird auf vier Stunden begrenzt.

Oben öffnen **Lage** und **Katastrophenalarm** die regionale Zeitleiste beziehungsweise die Liste aktiver Alarmstellen. Die Liste zeigt nur Leitstelle, Bereitschaftsphase, Beginn und Standortzahl. Sie veröffentlicht weder private Gründe noch Patienten, Einsätze oder fremde Fahrzeuglisten.

## Notruf und Disposition

Alle Notruf- und Einsatzaufrufe verwenden dieselben Arbeitskomponenten: Anrufliste, Gespräch, bekannte Einsatzdaten und Disposition. Auf großen Desktopfenstern stehen diese vier Bereiche nebeneinander. Kleinere Fenster ordnen sie platzsparend um. Verlauf, Aufträge, Funk und Details bleiben erreichbar.

Ein neuer Anruf zeigt zunächst einen unbekannten Notfall. Erst Aussagen und Rückfragen ergeben Meldebild, Ort, Betroffene und Gefahren. Quellen und Unsicherheit bleiben sichtbar. Bereits beantwortete Fragen entfallen; Zugang und Rückrufmöglichkeit lassen sich gezielt erfragen. Es werden keine Hausnummern oder Telefonnummern erfunden. Die Abfrage ist eine Spielsimulation und keine reale medizinische Anleitung.

Mit bekanntem Meldebild und verifiziertem Anfahrtspunkt können AAO oder freie Fahrzeuge bereits während des Gesprächs alarmiert werden. Alarmierung, Besatzungsanreise und tatsächlicher Fahrtbeginn sind getrennt. FMS 3 folgt dem Ausrücken. Auswahlentwürfe bleiben bei Serverfehlern erhalten; Doppelklicks und unberechtigte Bearbeitung werden serverseitig abgefangen.

## Verbindliche 15-Minuten-Prüfung

Ein regulärer neuer Einsatz wird erst veröffentlicht, wenn ein belegter Ort mit passender Geodatenart und Straßenzufahrt vorhanden ist. Deutschland verwendet den installierten Datensatz, OSM-Anker beziehungsweise versionierte Kachel-/Feature-Referenzen und das serverseitige Routing. Die Prüfung hängt nicht davon ab, welche Kartenkacheln ein Browser geladen hat.

Grundsätzlich erforderliche eigene Fahrzeugprofile müssen die Lage in höchstens **900 Sekunden tatsächlicher Fahrzeit bei 1×** erreichen können. Die Bezugwache hält eine wesentliche Einsatzfähigkeit auf einem Straßenfahrzeug vor. Ein schneller Führungswagen allein vergrößert das Gebiet nicht. Gebundene Fahrzeuge verlieren ihre grundsätzliche Zuständigkeit nicht; aktuelle Auslastung begrenzt zusätzlich neue Einsätze. Ausrücken und Dispositionszeit sind nicht in den 900 Sekunden versteckt, sondern werden separat angezeigt.

Die Auswahl bevorzugt die nähere Hälfte der örtlichen Kandidaten, untersucht aber gelegentlich das weitere Gebiet. Pro Auswahl werden höchstens 16 Kandidaten und höchstens 64 Standort-/Fahrzeugprofile geprüft; der Routencache hält maximal 2.048 Ergebnisse. Datenstand, Profile, Wetterlage und bekannte Straßenereignisse gehören zum Schlüssel. Ungültige Kandidaten werden verworfen. Ohne Ergebnis wartet der Generator mindestens 60 Sekunden und protokolliert den Grund. Es gibt keinen Ersatz bei 0/0 oder vor einer beliebigen Wache.

Die automatisierten Grenztests prüfen exakt 899/900/901 Sekunden mit kontrollierten Routerergebnissen. Weitere Tests verwenden das tatsächliche Fahrmodell und die Deutschland-Providerintegration mit einem kontrollierten Routerdienst. Diese Tests behaupten keine Vermessung jeder Straße Deutschlands. Freiwillig angenommene fremde Unterstützung darf weiter fahren; die tatsächliche ETA wird vor Zusage angezeigt.

## Bestandsfälle und Migration

SQLite-Version 17 ergänzt die gemeinsame Weltlage; Version 18 ergänzt die technische Ortsprüfung. Version 15 betrifft vorhandene FFW-Kerne/KatS-Anreisen, Version 16 Funkzustand und Fahrzeugwünsche. Vor einer notwendigen Migration erstellt der bestehende Servermechanismus eine konsistente Sicherung. `node dist/server/cli.js migration-preview` zeigt den lesenden Plan. Für Deutschland die entsprechend gebaute CLI mit denselben Datenpfaden verwenden. Installation und Updates verändern weder Weltidentität noch Geodaten.

Vorhandene Einsätze erhalten eine Prüfliste. Je Leitstelle wird höchstens ein Fall pro Minute geprüft. Korrigiert wird nur eine belegte Zufahrt an der ursprünglichen Lage, höchstens acht Weltkoordinateneinheiten entfernt. Die installierte Kartenprojektion bestimmt deren Metermaß. Anfahrende eigene und berechtigt zugesagte fremde Fahrzeuge werden von ihrer tatsächlichen Position neu geroutet; ausstehendes Ausrücken bleibt ausstehend. Historische Fälle werden nicht nachträglich wegen Überschreitens der neuen 900-Sekunden-Generierungsgrenze verschoben.

Während der technischen Prüfung pausiert die Entwicklung des betroffenen Einsatzes. Laufende Patiententransporte und Klinikübergaben werden erhalten. Fehlt nachweislich eine geeignete Zufahrt oder zulässige Straßenverbindung, wird der Fall ausdrücklich technisch aufgehoben und im Archiv erhalten, ohne Geld, XP oder Leistungswertung. Vorübergehend ausgefallenes Routing führt zu einer erneuten Prüfung. Ohne vorhandenes eigenes Straßenfahrzeug kann eine Verbindungsprüfung warten; sie erfindet keine Ersatzflotte. Strukturell beschädigte Save-Dateien werden weiterhin mit einem Fehler abgelehnt und bleiben unverändert; die Ortsmigration repariert keine beliebigen JSON-Schäden.

Die Einsatzdaten enthalten bei bekanntem Ort **Zufahrt technisch prüfen**, um einen konkreten bestehenden Fall erneut prüfen zu lassen. Originalort, Datenstand, geprüfte Profile und Ergebnis bleiben nachvollziehbar.

## Host-Verwaltung

Der normale Spielclient kann die Weltlage nicht setzen. Die lokale CLI zeigt mit `world-situation` den gespeicherten Zustand. Bei gestopptem Server kann der Host beispielsweise `world-situation --profile storm` anordnen. Mit `--scope-file region.json` wird eine validierte Region übergeben: `{"kind":"circle","name":"Nordkreis","x":12345,"y":23456,"radius":300}`. Diese Zahlen müssen echte Koordinaten der installierten Spielwelt sein; das Beispiel ist kein Deutschlandstandort. Ohne Bereich gilt die gesamte Serverwelt. Änderungen werden im Audit protokolliert. Der Prozessschutz verhindert konkurrierende CLI-Schreibzugriffe auf einen laufenden Server.
