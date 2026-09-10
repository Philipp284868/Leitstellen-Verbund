# Deutschlandkarte, Symbole und Fahrten

Die [[Deutschland]]-Welt verwendet reale OSM-Vektorkacheln, Straßenrouting und eine Orts-/Adressdatenbank für das gesamte Land. Menü und Spiel zeigen denselben Datenstand. Die Version 2.19 ergänzt Kartensymbole, geografische Einrichtungen und öffentliche Spielerstandorte, ohne Spielkoordinaten, Besitz oder Fahrstrecken umzuschreiben.

**Karte** in der oberen Hauptleiste öffnet sämtliche Kartenwerkzeuge: Suche, Filter, Ebenen, Zoom, Legende und Steuerung. Die Lupe öffnet die Suche mit direktem Eingabefokus. Ein erneuter Klick auf Karte oder Escape schließt die Werkzeuge. Maßstab und Quellenangaben bleiben an der Karte. Eine untere dauerhafte Werkzeugleiste gibt es nicht. Manuelles Verschieben und Zoomen bleiben bei Liveupdates und bei der Rückkehr aus dem Hauptmenü erhalten; andere Spieler übernehmen deine Kamera nicht.

## Fahrzeuge, Wachen und Spieler unterscheiden

Die Symbolform bezeichnet die Fahrzeugklasse, die Grundfarbe die Organisation. Alle 50 vorhandenen Fahrzeugtypen besitzen eine ausdrückliche Zuordnung; Varianten einer Klasse können dieselbe Silhouette verwenden. Funkrufname und vollständiger Typ bleiben auswählbar. Die FMS-Zahl und eine mögliche Störungsmarkierung stehen getrennt vom Organisationssymbol. Ausdrücklich freigegebene Verbundobjekte besitzen einen gestrichelten Rand.

Mehrere Fahrzeuge an derselben Position bleiben auch beim höchsten Zoom als Gruppe auswählbar. Die Gruppenliste enthält sämtliche Fahrzeuge und erlaubt die einzelne Auswahl; es gibt keine versteckte Begrenzung auf die ersten 650 Marker. Wird eine Fahrzeugmarke zur besseren Bedienung neben den Wachenpunkt gezeichnet, zeigt eine Verbindungslinie den unveränderten tatsächlichen Standort.

Öffentliche Spielerstandorte besitzen ein eigenes Leitstellensymbol. Die eigene Leitstelle wird hervorgehoben. Gemeinsame Disponenten und benachbarte Leitstellen lassen sich im Gruppenfenster vollständig auflösen. Ohne gewählten Wachenstandort erscheint kein erfundener Marker; diese Spieler bleiben unter **Spieler** auffindbar. Diese Präsenz erteilt keine Rechte auf fremde Bestände oder Einsätze; siehe [[Berechtigungen]].

## Geografische Einrichtungen

Die Einrichtungsebene nutzt ausschließlich den installierten Ortsindex und die echten Merkmale der sichtbaren lokalen Vektorkacheln. Filter sind für Feuerwachen, Rettungswachen, Polizeiwachen, Katastrophenschutz, Kliniken, Bahnhöfe, Flughäfen, Häfen, Bildung, Pflege/Soziales, Einkaufsorte, Veranstaltungen und Industrie vorhanden. Je nach Zoom erscheinen zunächst räumliche Gruppen und später einzelne Symbole. Die Zahlen zählen Karteneinträge, keine einsatzbereiten Einheiten oder freien Betten.

Kontursymbole kennzeichnen geografische Einrichtungen; gekaufte Spielgebäude tragen ihre Organisationsfarbe. Ortsdetails nennen Quelle und Kategorie. Überdeckte Einrichtungen lassen sich über eine vollständige Gruppenliste einzeln auswählen, auch bei identischen Koordinaten im höchsten Zoom. Ein geografischer Eintrag ist kein automatisch verfügbares Spielgebäude. Reale Besatzungen, Fachabteilungen oder Aufnahmekapazitäten werden daraus nicht behauptet. Die Klinikversorgung im Spiel verwendet ausdrücklich bezeichnete, getrennte Spielprofile.

Der geprüfte Ortsindex des Datenstands vom 07.09.2026 enthält 37.622 Einträge aus den vier Klassen Feuerwache, Polizei, Krankenhaus und Klinik. Die sichtbaren Kacheln ergänzen weitere Kategorien. Rettungswachen und Katastrophenschutz erscheinen nur bei ausdrücklich passenden Kartendaten; eine vollständige deutschlandweite Abdeckung dieser beiden Kategorien wird nicht behauptet. Es werden keine Einrichtungen anhand bloß ähnlich klingender Namen erfunden.

Ein Industriesymbol kann eine kartierte Industriefläche bezeichnen. Sein Anzeigeanker liegt innerhalb der vorhandenen Kontur und berücksichtigt Polygonlöcher; er ist keine behauptete Werkseinfahrt oder genaue Firmenadresse. Sehr dichte Ausschnitte werden vollständig räumlich zusammengefasst statt still abgeschnitten. Ausgeblendete Kategorien lassen sich über die Filter wieder einblenden.

Kachelanfragen für Einrichtungen besitzen ein eigenes Budget und verbrauchen nicht das Suchbudget. Der Browser lädt nur den sichtbaren Ausschnitt, verwendet begrenzte Caches und höchstens vier gleichzeitige POI-Anfragen. Ein unvollständiger Abruf wird als Fehler sichtbar, nicht als angeblich leere Region ausgegeben.

## Route und tatsächliche Verfügbarkeit

Straßenfahrzeuge benutzen das vorhandene Straßennetz. Geschwindigkeiten, Beschleunigung/Bremsung und Straßenlimits bestimmen die Fahrt; es gilt keine pauschale Minuten-pro-Kilometer-Regel. Simuliertes Wetter, Verkehr, Sperren und Defekte können Abläufe verändern. Luftrettung besitzt eigene Bewegungsregeln.

Routen, Kilometer, verbleibende Fahrzeit, ETA und FMS beziehen sich auf die tatsächliche serverseitige Fahrt. Neuere Snapshots aktualisieren die Darstellung; sie teleportieren Fahrzeuge nicht. Bereite Rückkehrer nehmen einen neuen Auftrag vom tatsächlichen angebrochenen gerichteten Straßenabschnitt an. Sie müssen weder zur Wache fahren noch erneut eine vollständige Ausrückezeit warten. Fehlende geeignete Besatzung, tatsächlich gebundene Patienten, Störung und Nachbereitung bleiben Sperren. FMS allein erteilt keine Bereitschaftsfreigabe.

Medizinische Einsätze besitzen grüne Grundmarker mit Kreuz, Brände rote Flammen und ungeklärte Anrufe neutrale Telefonsymbole. Medizin bleibt auch bei Auswahl und NOTFALL grün; ein zusätzliches Ausrufezeichen kennzeichnet höchste Dringlichkeit. Gleichartige Cluster behalten ihre Kategorie. Gemischte Cluster zeigen ein Gruppensymbol und lassen sich vollständig auflösen. Ein Brand mit Verletzten behält seine Brandkategorie und bekommt eine zusätzliche medizinische Kennzeichnung. Die Einordnung verwendet nur den bekannten Informationsstand.

Wasserrettung in Deutschland verwendet eine vollständige Kombination aus Zugfahrzeug und Bootsanhänger auf Straßen zu einem verifizierten Uferzugang. Ein befahrbares offenes Wasser-/Bootsnetz ist weiterhin nicht freigegeben. Eine fehlende Straßenroute wird nicht durch eine erfundene Direktfahrt oder Bootsstrecke ersetzt. Die bekannten Grenzen dynamischer Sperrumfahrungen stehen unter [[Deutschland]].

## Historischer Bestand

Die historische fiktive Region ist aus dem aktiven Produkt entfernt. [[Rivermere]] beschreibt ausschließlich den Bestandsschutz und verweist auf den schreibgeschützten Export.

## Einsatzorte ab 2.22

Reguläre neue Einsätze benötigen einen belegten Ort und einen geeigneten Zugang, erreichbar in höchstens 900 Sekunden tatsächlicher Straßenfahrzeit mit den grundsätzlich nötigen eigenen Fahrzeugprofilen. Ausrücken wird zusätzlich ausgewiesen. Ein schneller Führungswagen oder fremder Standort erweitert die eigene Zuständigkeit nicht. Freiwillige überörtliche Hilfe darf länger fahren und zeigt ihre tatsächliche ETA vor Zusage.

Ungültige neue Kandidaten werden verworfen; bei fehlendem Ergebnis folgt ein begrenzter späterer Versuch. Bestehende Orte werden am ursprünglichen Standort geprüft. Eine Zufahrtskorrektur routet laufende Kräfte von ihrer tatsächlichen Position neu. Unrettbare technische Altfälle werden ohne Vergütung, XP und Wertung im Archiv aufgehoben. Es gibt keine stille Verlegung in eine andere Stadt. [[Weltlagen-und-Katastrophenschutz]] und die ausführliche technische Anleitung erklären regionale Wetterwirkungen und Datenstand.
