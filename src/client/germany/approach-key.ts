import type { Save, Vehicle } from "../../shared/model";

/** A standby ETA is not reusable after assignment, withdrawal or a repaired interruption.
 * Moving previews refresh in bounded intervals, without cancelling every snapshot's request.
 */
export function approachContext(s: Save, v: Vehicle) {
  const moving = ["travel", "transport", "return"].includes(v.status);
  return JSON.stringify([
    v.status,
    v.assignment,
    v.depart,
    v.arrive,
    v.journey?.serial,
    v.fault?.state,
    v.fault?.since,
    moving ? Math.floor(s.time / 15) : 0,
    s.buildings.find((b) => b.id === v.home)?.organization?.turnout,
    s.desk.alarms[v.home],
    s.environment?.period,
    s.worldSituation?.id,
    s.worldSituation?.phase,
    s.buildings.find((b) => b.id === v.home)?.civilProtection?.state,
  ]);
}
