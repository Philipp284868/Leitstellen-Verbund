import type { Save, Vehicle } from "../shared/model";
import type { MotionLeg } from "../shared/motion";
import { vt } from "../shared/catalog";
import { distance, type Point } from "../shared/world";

/** Retain the remainder of the occupied directed edge, including all its shape vertices.
 * A router may choose a new route only after that edge's endpoint. This avoids snaps to
 * adjacent roads and a premature U-turn in the middle of a one-way segment.
 */
export function remainingRoadLegs(
  s: Save,
  v: Vehicle | { type: string },
  origin: Point,
): MotionLeg[] {
  if (
    !("status" in v) ||
    !["travel", "transport", "return"].includes(v.status) ||
    vt(v.type).mode !== "road"
  )
    return [];
  const phases = v.journey?.motion;
  if (!phases?.length) return [];
  const elapsed = v.journey?.blockedUntil
    ? 0
    : (v.fault && v.fault.state !== "repaired" ? v.fault.since : s.time) -
      v.depart -
      (v.journey?.wait ?? 0);
  let start = phases.findIndex((p) => p.start + p.duration > elapsed + 1e-8);
  if (start < 0) return [];
  const contains = (p: (typeof phases)[number]) => {
    const dx = p.to.x - p.from.x,
      dy = p.to.y - p.from.y,
      squared = dx * dx + dy * dy;
    if (squared < 1e-14) return false;
    const fraction =
      ((origin.x - p.from.x) * dx + (origin.y - p.from.y) * dy) / squared;
    return (
      fraction >= -1e-7 &&
      fraction < 1 - 1e-8 &&
      distance(origin, {
        x: p.from.x + dx * fraction,
        y: p.from.y + dy * fraction,
      }) < 1e-5
    );
  };
  if (!contains(phases[start]) && v.fault && v.fault.state !== "repaired") {
    // Older fault records overwrote depart. Recover an unambiguous stored directed leg
    // from the frozen coordinate, never by snapping to a different road.
    const matches = phases
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => contains(p));
    const keys = new Set(
      matches.map(({ p }) => JSON.stringify([p.from, p.to, p.edge])),
    );
    if (keys.size !== 1) return [];
    start = matches[0].i;
  }
  const phase = phases[start];
  const dx = phase.to.x - phase.from.x,
    dy = phase.to.y - phase.from.y;
  const squared = dx * dx + dy * dy;
  if (squared < 1e-14) return [];
  const fraction =
    ((origin.x - phase.from.x) * dx + (origin.y - phase.from.y) * dy) / squared;
  const projected = {
    x: phase.from.x + dx * fraction,
    y: phase.from.y + dy * fraction,
  };
  // Old saves may lack the stopped motion epoch. Never invent a connector to unrelated geometry.
  if (
    fraction < -1e-7 ||
    fraction >= 1 - 1e-8 ||
    distance(origin, projected) > 1e-5
  )
    return [];
  const result: MotionLeg[] = [
    {
      from: origin,
      to: phase.to,
      meters: phase.meters * (1 - Math.max(0, fraction)),
      edge: phase.edge,
      limit: phase.limit,
    },
  ];
  let previous = phase;
  for (const p of phases.slice(start)) {
    if (p.edge !== phase.edge) break;
    if (
      distance(p.from, previous.from) > 1e-8 ||
      distance(p.to, previous.to) > 1e-8
    ) {
      if (distance(previous.to, p.from) > 1e-8) break;
      result.push({
        from: p.from,
        to: p.to,
        meters: p.meters,
        edge: p.edge,
        limit: p.limit,
      });
      previous = p;
    }
    if (p.velocity === 0 && p.acceleration === 0)
      result.at(-1)!.waitSeconds = Math.max(
        0,
        p.duration - Math.max(0, elapsed - p.start),
      );
  }
  return result;
}
