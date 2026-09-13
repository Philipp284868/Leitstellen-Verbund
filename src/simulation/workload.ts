import type { Mission, Save } from "../shared/model";
import { maxConcurrentIncidents, progress } from "../shared/progression";
import { callGenerationAllowed } from "./call-generation";
import { sealMissionXp } from "./xp-rewards";

export const assistanceKey = (owner: string, mission: string) =>
  `remote:${owner}:${mission}`;
/** Calls are contained by their canonical mission; transports retain that same slot. */
export function incidentKeys(s: Save) {
  const keys = new Set(
    s.missions
      .filter(
        (m) =>
          m.phase !== "done" ||
          m.transports.some((t) => t.status === "ordered"),
      )
      .map((m) => `own:${m.id}`),
  );
  for (const c of s.contributions)
    if (c.status === "active") keys.add(assistanceKey(c.peer, c.mission));
  for (const v of s.vehicles)
    if (v.mission?.startsWith("remote:") && v.status !== "return")
      keys.add(v.mission);
  for (const t of s.transfers)
    if (!t.delivered) keys.add(assistanceKey(t.peer, t.mission));
  return keys;
}
export function incidentLoad(s: Save) {
  const keys = incidentKeys(s),
    limit = maxConcurrentIncidents(progress(s.xp).level);
  const inherited = new Set(s.workloadLegacy ?? []);
  return {
    used: keys.size,
    limit,
    inherited: [...keys].filter((k) => inherited.has(k)).length,
    overloaded: keys.size > limit,
  };
}
export function mayStartIncident(s: Save) {
  const load = incidentLoad(s);
  return callGenerationAllowed(s) && load.used < load.limit;
}
export function assertAssistanceCapacity(
  s: Save,
  owner: string,
  mission: string,
) {
  if (incidentKeys(s).has(assistanceKey(owner, mission))) return;
  const load = incidentLoad(s);
  if (load.used >= load.limit)
    throw Error(
      `Einsatzobergrenze erreicht (${load.used} / ${load.limit}). Zuerst laufenden Auftrag abschließen.`,
    );
}
/** All automatic creators pass this final synchronous check inside their existing transaction. */
export function createIncident(s: Save, m: Mission) {
  if (!mayStartIncident(s)) return false;
  if (s.missions.some((x) => x.id === m.id || x.round === m.round))
    throw Error("Doppelter Einsatzvorgang.");
  sealMissionXp(m);
  s.missions.push(m);
  return true;
}
