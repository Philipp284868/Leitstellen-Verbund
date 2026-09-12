import { missionPresentation } from "./mission-presentation";
import type { Mission, Save } from "./model";
import { priorityRank } from "./simulation/priority";
import { distance } from "./world";
export const shortcutNames = {
  call: "Nächster Notruf",
  fms: "FMS",
  alarm: "Disposition öffnen",
  fleet: "Fahrzeuge",
  missions: "Einsätze",
  police: "Polizeieinsätze",
  ems: "Rettungsdiensteinsätze",
  archive: "Archiv und Statistik",
};
export type Shortcut = keyof typeof shortcutNames;
export const defaultWorkspace = {
  side: "left",
  width: 320,
  compact: false,
  queueBottom: false,
  stationsTop: false,
  keys: {
    call: "n",
    fms: "f",
    alarm: "a",
    fleet: "v",
    missions: "e",
    police: "p",
    ems: "r",
    archive: "h",
  },
};
export type WorkspacePreferences = typeof defaultWorkspace;
export function parseWorkspace(raw: string | null): WorkspacePreferences {
  try {
    const v = JSON.parse(raw ?? "{}");
    const keys = { ...defaultWorkspace.keys };
    for (const key of Object.keys(keys) as Shortcut[])
      if (typeof v.keys?.[key] === "string" && /^[a-z0-9]?$/.test(v.keys[key]))
        keys[key] = v.keys[key];
    const used = new Set<string>();
    for (const key of Object.keys(keys) as Shortcut[]) {
      if (used.has(keys[key])) keys[key] = "";
      if (keys[key]) used.add(keys[key]);
    }
    return {
      side: "left",
      width: [280, 320, 380].includes(v.width) ? v.width : 320,
      compact: v.compact === true,
      queueBottom: v.queueBottom === true,
      stationsTop: v.stationsTop === true,
      keys,
    };
  } catch {
    return structuredClone(defaultWorkspace);
  }
}
export function shortcutFor(
  event: Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "metaKey" | "altKey" | "repeat"
  >,
  keys: WorkspacePreferences["keys"],
  editing: boolean,
): Shortcut | undefined {
  if (editing || event.ctrlKey || event.metaKey || event.altKey || event.repeat)
    return;
  return (Object.keys(keys) as Shortcut[]).find(
    (key) => keys[key] && keys[key] === event.key.toLowerCase(),
  );
}
export function missionList(
  s: Save,
  query: string,
  filter: string,
  sort: string,
  actor = "",
) {
  const priority = (m: Mission) => priorityRank(m.control?.priority);
  const needle = query.trim().toLocaleLowerCase("de");
  const buildingNames = new Map(s.buildings.map((b) => [b.id, b.name]));
  const unitText = new Map<string, string[]>();
  if (needle)
    for (const v of s.vehicles)
      if (v.mission) {
        const names = unitText.get(v.mission) ?? [];
        names.push(`${v.name} ${buildingNames.get(v.home) ?? ""}`);
        unitText.set(v.mission, names);
      }
  const origin = s.buildings[0]?.pos ?? { x: 0, y: 0 };
  const candidates = s.missions.filter((m) => {
    const c = m.control;
    if (filter === "critical" && priority(m) < priorityRank("HOCH"))
      return false;
    if (filter === "major" && !m.major) return false;
    if (filter === "request" && !c?.radio.some((r) => r.state === "open"))
      return false;
    if (filter === "mine" && !c?.calls.some((call) => call.actor === actor))
      return false;
    if (
      !["all", "critical", "major", "request", "mine"].includes(filter) &&
      missionPresentation(m).org !== filter
    )
      return false;
    if (!needle) return true;
    const location = c?.locationKnown
      ? (c.facts.find((f) => f.key === "address")?.text ?? "")
      : "";
    const text = `${m.id} ${missionPresentation(m).name} ${location} ${
      c?.facts
        .filter((f) => f.key !== "address" || c.locationKnown)
        .map((f) => f.text)
        .join(" ") ?? ""
    } ${m.dynamics?.patients.map((p) => p.id).join(" ") ?? ""} ${(unitText.get(m.id) ?? []).join(" ")}`;
    return text.toLocaleLowerCase("de").includes(needle);
  });
  return candidates.sort((a, b) => {
    const order =
      sort === "time"
        ? a.created - b.created
        : sort === "patients"
          ? (b.dynamics?.patients.length ?? 0) -
            (a.dynamics?.patients.length ?? 0)
          : sort === "distance"
            ? (a.control?.locationKnown ? distance(origin, a.pos) : Infinity) -
              (b.control?.locationKnown ? distance(origin, b.pos) : Infinity)
            : sort === "escalation"
              ? (b.dynamics?.level ?? 0) - (a.dynamics?.level ?? 0)
              : priority(b) - priority(a);
    return order || a.created - b.created || a.id.localeCompare(b.id);
  });
}
