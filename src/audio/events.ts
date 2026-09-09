import { level, type Save } from "../model";
import type { GameMode } from "../mode";
import type { Cue } from "./synth";
import { priorityRank } from "../simulation/priority";
export const priorityTone = (priority: string): Cue | null =>
  priority === "NOTFALL"
    ? "emergency"
    : ["HOCH", "KRITISCH", "PRIORITÄT"].includes(priority)
      ? "priority"
      : null;
/** Only changes between live, authoritative snapshots make a sound. */
export class AudioEvents {
  private previous: Save | null = null;
  private mode: GameMode = "multi";
  reset() {
    this.previous = null;
  }
  observe(save: Save | null, mode: GameMode, live: boolean): Cue | null {
    if (!live || !save) {
      this.reset();
      return null;
    }
    const before = this.previous;
    if (
      !before ||
      this.mode !== mode ||
      before.player.id !== save.player.id ||
      before.generation !== save.generation
    ) {
      this.previous = save;
      this.mode = mode;
      return null;
    }
    if (save.revision <= before.revision) return null;
    this.previous = save;
    const previousRadio = new Set(
      before.missions.flatMap((m) => m.control?.radio.map((r) => r.id) ?? []),
    );
    const priorMissions = new Map(before.missions.map((m) => [m.id, m]));
    const priorityCues = save.missions.flatMap((m) => {
      const previous = priorMissions.get(m.id)?.control?.priority;
      const cues = (m.control?.radio ?? [])
        .filter((r) => !previousRadio.has(r.id) && r.state === "open")
        .map((r) => priorityTone(r.priority));
      if (
        m.control &&
        (!previous || priorityRank(m.control.priority) > priorityRank(previous))
      )
        cues.push(priorityTone(m.control.priority));
      return cues;
    });
    if (priorityCues.includes("emergency")) return "emergency";
    if (priorityCues.includes("priority")) return "priority";
    if (level(save) > level(before)) return "level";
    const receipts = new Set(before.receipts),
      archive = new Set(before.archive.map((m) => m.id));
    if (
      save.receipts.some((id) => !receipts.has(id)) ||
      save.archive.some((m) => !archive.has(m.id))
    )
      return "complete";
    const freshEvents = save.missions.flatMap((m) => {
      const prior = priorMissions.get(m.id)?.control?.events ?? [];
      const events = m.control?.events ?? [];
      // Histories append in order. Inspect only their changed suffix on normal snapshots.
      if (!prior.length || events[prior.length - 1]?.id === prior.at(-1)?.id)
        return events.slice(prior.length);
      const known = new Set(prior.map((event) => event.id));
      return events.filter((event) => !known.has(event.id));
    });
    const alarm = freshEvents.find((e) => e.alarm);
    if (alarm?.alarm) return alarm.alarm;
    if (freshEvents.some((e) => e.type === "SPEAK_REQUESTED")) return "request";
    if (freshEvents.some((e) => e.type === "CALL_RECEIVED")) return "phone";
    const vehicles = new Map(before.vehicles.map((v) => [v.id, v]));
    if (
      save.vehicles.some(
        (v) =>
          v.status === "travel" &&
          vehicles.has(v.id) &&
          vehicles.get(v.id)!.assignment !== v.assignment,
      )
    )
      return "dispatch";
    const missions = new Set(before.missions.map((m) => m.id));
    if (save.missions.some((m) => !missions.has(m.id))) return "mission";
    if (
      save.vehicles.some(
        (v) => v.status === "scene" && vehicles.get(v.id)?.status === "travel",
      )
    )
      return "arrival";
    if (
      save.buildings.some(
        (b) => !before.buildings.some((p) => p.id === b.id),
      ) ||
      save.vehicles.some((v) => !vehicles.has(v.id))
    )
      return "build";
    if (
      save.vehicles.some(
        (v) => v.status === "ready" && vehicles.get(v.id)?.status === "return",
      )
    )
      return "return";
    return null;
  }
}
