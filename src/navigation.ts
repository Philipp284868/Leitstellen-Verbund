/** The same catalog drives quick navigation and the documented reachable-view audit. */
export const navigation = [
  {
    id: "calls",
    title: "Notrufarbeitsplatz",
    words: "Gespräch Rückruf Annahme Übergabe Warteschlange",
  },
  {
    id: "situation",
    title: "Gemeinsame Einsatzlagen",
    words: "Lagebuch Notizen Nachbarn Hilfe Großlagen Flächenlagen",
  },
  {
    id: "civil",
    title: "Katastrophenbereitschaft und KatS-Wachen",
    words: "Mobilisierung Bereitschaft Katastrophenschutz Standort",
  },
  {
    id: "radio",
    title: "Funkarbeitsplatz",
    words: "Sprechwünsche Lagemeldung Rückfrage Nachforderung Kanal Übernahme",
  },
  {
    id: "stations",
    title: "Wachen verwalten",
    words: "Gebäude Standorte Organisation Krankenhaus",
  },
  {
    id: "facilities",
    title: "Standorte kaufen",
    words: "Gebäude Wache Krankenhaus Standort erwerben",
  },
  {
    id: "fleet",
    title: "Fuhrpark",
    words: "Fahrzeuge Einsatzbereitschaft umbenennen verkaufen versetzen",
  },
  {
    id: "friends",
    title: "Leitstellenverbund und Disponenten",
    words: "Unterstützung Nachbarn Funk Chat Berechtigung Einladung",
  },
  {
    id: "aaos",
    title: "Alarm- und Ausrückeordnung",
    words: "AAO Alarmierung Regeln",
  },
  {
    id: "fms",
    title: "FMS und Alarmierungsprofile",
    words: "Funk Status 0 1 2 3 4 5 6 7 8 9 Pager Sirene",
  },
  {
    id: "players",
    title: "Leaderboard",
    words: "Leitstellen Personen online Nachbarn",
  },
  {
    id: "archive",
    title: "Einsatzarchiv und Geldjournal",
    words:
      "Historie Protokoll Statistik Auswertung Euro Budget Finanzen Bericht",
  },
  {
    id: "progress",
    title: "Fortschritt und Erfolge",
    words: "XP Stufe Freischaltung",
  },
  {
    id: "settings",
    title: "Audio-Einstellungen",
    words: "Musik Lautstärke Töne Funk Telefon Alarm Sound",
    tab: "audio",
  },
  {
    id: "settings",
    title: "Anzeige und Karte",
    words: "Symbole Marker Beschriftung Oberfläche Bewegung Zoom",
    tab: "display",
  },
  {
    id: "settings",
    title: "Steuerung und Tastatur",
    words: "Tasten Shortcuts Maus Arbeitsplatzlayout",
    tab: "controls",
  },
  {
    id: "settings",
    title: "Hinweise und Hilfe",
    words: "Rückmeldung Hinweise Support",
    tab: "help",
  },
  {
    id: "account",
    title: "Konto und Sicherheit",
    words: "Passwort Benutzer Rolle Anmeldung Abmelden",
  },
  { id: "help", title: "Spielanleitung", words: "Hilfe Wiki Bedienung" },
  {
    id: "catalog",
    title: "Einsatzkatalog",
    words: "Szenarien Meldebilder Anforderungen",
  },
  {
    id: "backups",
    title: "Spielstände und Sicherungen",
    words: "Export Import Wiederherstellung",
  },
  { id: "news", title: "Changelogs", words: "Updates Änderungen" },
  { id: "privacy", title: "Datenschutz im Spiel", words: "Daten Privatsphäre" },
  { id: "support", title: "Support", words: "Fehler Diagnose Hilfe GitHub" },
  { id: "exit", title: "Spiel verlassen", words: "Abmelden Sitzung beenden" },
] as const;
export function searchNavigation(query: string) {
  const terms = query
    .trim()
    .toLocaleLowerCase("de")
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return [];
  return navigation
    .filter((item) =>
      terms.every((term) =>
        `${item.title} ${item.words}`.toLocaleLowerCase("de").includes(term),
      ),
    )
    .slice(0, 6);
}
export function openNavigation(item: (typeof navigation)[number]) {
  window.dispatchEvent(
    new CustomEvent("lv:open-panel", {
      detail: { id: item.id, tab: "tab" in item ? item.tab : undefined },
    }),
  );
}
