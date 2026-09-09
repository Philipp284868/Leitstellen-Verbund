import { z } from "zod";
import type { Mission, Save } from "./model";
import { mt, vt } from "./catalog";
import { formatMoney } from "./money";

export const tutorialChapters = [
  {
    title: "Dein Arbeitsplatz",
    text: "Verschiebe die Karte, zoome mit dem Mausrad und verwende die Suche. Die obere Leiste bleibt dein zentraler Zugang.",
    target: "search",
    panel: "",
    kind: "orientation",
  },
  {
    title: "Leitstelle und Budget",
    text: "Öffne das Geldjournal über den Budgetbetrag. Geld wird in Euro und Cent geführt, Erfahrung weiterhin in XP. Prüfe die Grundfinanzierung.",
    target: "budget",
    panel: "archive",
    kind: "budget",
  },
  {
    title: "Der erste Standort",
    text: "Öffne Gebäude und baue eine Feuerwache. Wähle den Straßenstandort bewusst und bestätige den Preis. Eine vorhandene Feuerwache zählt bereits.",
    target: "stations",
    panel: "stations",
    kind: "building",
  },
  {
    title: "Automatische Wachbesetzung",
    text: "Öffne die fertige Wache. Besatzung und freigeschaltete Qualifikationen werden automatisch bereitgestellt. Laufende Bauarbeiten müssen zuerst fertig werden.",
    target: "automatic-staff",
    panel: "building",
    kind: "staff",
  },
  {
    title: "Das passende Fahrzeug",
    text: "Für die technische Übung „Keller unter Wasser“ ist eine Pumpe nötig: Ein LF 20 besitzt sie. Vergleiche vorhandene Fahrzeuge und bestätige einen Kauf nur, falls wirklich ein geeignetes Fahrzeug fehlt. Im Übungsstand ist Stufe 2 freigeschaltet.",
    target: "building-details",
    panel: "building",
    kind: "vehicle",
  },
  {
    title: "Ein neutraler Notruf",
    text: "Nimm den klingelnden Anruf an. Erfrage zuerst Ort und Meldebild; ergänze Personen und Gefahren. Ein eingehender Anruf verrät noch keine gesicherte Einsatzlage.",
    target: "call",
    panel: "mission",
    kind: "call",
  },
  {
    title: "Technische Hilfe disponieren",
    text: "Wähle ein geeignetes verfügbares Fahrzeug oder nutze eine gespeicherte AAO. Prüfe Fähigkeiten, Alarmierungsart, Straßenroute und Fahrzeit. Bestätige dann die Alarmierung.",
    target: "dispatch",
    panel: "mission",
    kind: "dispatch",
  },
  {
    title: "Ausrücken und FMS",
    text: "Verfolge Ausrücken und Anfahrt auf der Karte sowie im Fahrzeugbereich. FMS 3 bedeutet Anfahrt, FMS 4 Ankunft. Fahrzeiten entstehen aus der tatsächlichen Straßenroute.",
    target: "fleet",
    panel: "mission",
    kind: "arrival",
  },
  {
    title: "Lagemeldung und Sprechwünsche",
    text: "Nimm die erste Lagemeldung auf. Bearbeite offene Sprechwünsche und prüfe, ob Kräfte fehlen. Die technische Übung ist mit der vorhandenen Pumpe lösbar; eine echte Nachforderung übst du anschließend in der Brandlage.",
    target: "radio",
    panel: "mission",
    kind: "radio",
  },
  {
    title: "Abschluss und Rückfahrt",
    text: "Sobald Aufgaben und gegebenenfalls Transporte erledigt sind, schließt der Server den Einsatz ab. Fahrzeuge rücken zur Wache zurück. Beobachte den Abschluss im Archiv.",
    target: "budget",
    panel: "archive",
    kind: "complete",
  },
  {
    title: "Euro-Abrechnung und XP",
    text: "Öffne den Einsatzbericht: Vergütung, XP, Fahrstrecke und Zeitabschnitte werden getrennt ausgewiesen. Übungsabrechnungen verbleiben vollständig im Übungsstand. Behalte Budget für ein weiteres Löschfahrzeug: Im nächsten Kapitel übst du eine echte Nachforderung.",
    target: "budget",
    panel: "archive",
    kind: "receipt",
  },
  {
    title: "Brand und echte Nachforderung",
    text: `Fordere die Brandübung an und schicke zunächst dein LF 20. Nimm die erste Lagemeldung auf und bearbeite die tatsächliche Nachforderung über „Nachforderung bearbeiten“. Vergleiche den bestätigten Löschwasserbedarf mit den Fahrzeugfähigkeiten. Ein zusätzliches TSF-W kostet ${formatMoney(vt("tsf").price)} und ergänzt das LF passend. Kaufe es bei Bedarf, alarmiere es über dieselbe Disposition und verfolge Ankunft, Löschung und Abschluss. Bereits passende Fahrzeuge können verwendet werden.`,
    target: "dispatch",
    panel: "mission",
    kind: "fire",
  },
  {
    title: "Rückzug und Rückfahrtalarmierung",
    text: "Prüfe im Fahrzeugbereich den Rückzug. Der Server schützt letzte benötigte Kräfte und laufende Patiententransporte. Ein einsatzbereiter Rückkehrer kann von seiner aktuellen Straßenposition erneut alarmiert werden.",
    target: "fleet",
    panel: "fleet",
    kind: "withdraw",
  },
  {
    title: "Berechtigte Zusammenarbeit",
    text: "Öffne den Leitstellenverbund. Disponenten derselben Leitstelle können gemeinsam arbeiten. Andere Leitstellen sehen Einsätze erst nach ausdrücklicher Berechtigung; Unterstützungsanfragen geben gezielt Zugriff. Für diese Erklärung muss kein zweiter Spieler online sein.",
    target: "radio",
    panel: "friends",
    kind: "cooperation",
  },
  {
    title: "Deine Klangkulisse",
    text: "Öffne Audio. Höre Telefon, Funk und Alarmierung an und stelle deine Lautstärken ein. Probiere die Vorschau aus; übernehme gewünschte Werte oder verwirf sie.",
    target: "settings-open",
    panel: "settings",
    kind: "settings",
  },
  {
    title: "Bereit für deine Leitstelle",
    text: "Das Tutorial kann jederzeit über Hilfe wiederholt werden. Die Serverübung beendet weder die echte Simulation noch verändert sie deren Geld, XP oder Fahrzeuge. Kehre jetzt zu deinem Spielstand zurück.",
    target: "settings-open",
    panel: "help",
    kind: "finish",
  },
] as const;
export const tutorialProgressSchema = z
  .object({
    version: z.literal(1),
    state: z.enum(["new", "active", "skipped", "complete"]),
    chapter: z
      .number()
      .int()
      .min(0)
      .max(tutorialChapters.length - 1),
    completed: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(tutorialChapters.length - 1),
      )
      .max(tutorialChapters.length),
    ui: z
      .array(
        z.enum([
          "pan",
          "zoom",
          "search",
          "budget",
          "staff",
          "receipt",
          "withdraw",
          "cooperation",
          "settings",
          "finish",
        ]),
      )
      .max(10),
    updatedAt: z.number().finite().nonnegative(),
  })
  .strict();
export type TutorialProgress = z.infer<typeof tutorialProgressSchema>;
export const newTutorial = (): TutorialProgress => ({
  version: 1,
  state: "new",
  chapter: 0,
  completed: [],
  ui: [],
  updatedAt: 0,
});
/** Public, ordered evidence: a real deficit was handled, another unit was
 * subsequently dispatched and arrived, and that fire actually concluded. */
export function tutorialReinforcementComplete(m: Mission) {
  const c = m.control;
  if (
    !c?.briefed ||
    m.phase !== "done" ||
    (!m.dynamics?.fire && !(mt(m.template).requirements.fire ?? 0))
  )
    return false;
  return c.radio.some((request) => {
    if (request.reason !== "request" || request.state !== "handled")
      return false;
    const handled = c.events.findIndex(
      (event) =>
        event.type === "REINFORCEMENT_REQUESTED" &&
        event.vehicle === request.vehicle &&
        event.at === request.answered &&
        event.text.startsWith(request.details),
    );
    if (handled < 0) return false;
    return c.events.some(
      (dispatch, index) =>
        index > handled &&
        dispatch.type === "VEHICLE_DISPATCHED" &&
        !!dispatch.vehicle &&
        dispatch.vehicle !== c.firstArrival &&
        c.events
          .slice(index + 1)
          .some(
            (arrival) =>
              arrival.type === "VEHICLE_ARRIVED" &&
              arrival.vehicle === dispatch.vehicle &&
              arrival.assignment === dispatch.assignment,
          ),
    );
  });
}
export function tutorialReady(p: TutorialProgress, s: Save) {
  const kind = tutorialChapters[p.chapter].kind,
    all = [...s.missions, ...s.archive];
  switch (kind) {
    case "orientation":
      return ["pan", "zoom", "search"].every((k) =>
        p.ui.includes(k as TutorialProgress["ui"][number]),
      );
    case "building":
      return s.buildings.some((b) => b.type === "fire");
    case "staff":
      return (
        p.ui.includes("staff") &&
        s.buildings.some((b) => b.type === "fire" && b.ready <= s.time) &&
        !!s.staffing
      );
    case "vehicle":
      return s.vehicles.some((v) => (vt(v.type).skills.pump ?? 0) > 0);
    case "call":
      return all.some(
        (m) =>
          m.control?.locationKnown &&
          m.control.calls.some(
            (c) => c.state !== "ringing" && c.state !== "dropped",
          ) &&
          m.control.facts.some((f) => f.key === "report"),
      );
    case "dispatch":
      return all.some((m) =>
        m.control?.events.some(
          (e) => e.type === "ALARM_STARTED" || e.type === "ALARM_CREATED",
        ),
      );
    case "arrival":
      return all.some((m) => !!m.control?.firstArrival);
    case "radio":
      return all.some(
        (m) =>
          m.control?.briefed && m.control.radio.some((r) => r.state !== "open"),
      );
    case "complete":
      return s.archive.some((m) => m.phase === "done");
    case "withdraw":
      return (
        p.ui.includes("withdraw") &&
        (s.vehicles.some((v) => v.status === "return") ||
          all.some((m) =>
            m.control?.events.some(
              (e) =>
                e.type === "VEHICLE_RELEASED" || e.type === "FORCES_WITHDRAWN",
            ),
          ))
      );
    case "receipt":
      return (
        p.ui.includes("receipt") &&
        s.archive.some(
          (m) =>
            m.telemetry?.credits !== null && m.telemetry?.credits !== undefined,
        )
      );
    case "fire":
      return all.some(tutorialReinforcementComplete);
    default:
      return p.ui.includes(kind);
  }
}
