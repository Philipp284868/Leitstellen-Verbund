import type { PresenceDesk } from "../../shared/presence";
import type { Point } from "../../shared/germany/projection";
export type PresenceMarker = {
  id: string;
  point: Point;
  x: number;
  y: number;
  desks: PresenceDesk[];
  count: number;
};
/** All public desks remain reachable through a screen-space cluster's members. */
export function clusterPresence(
  desks: readonly PresenceDesk[],
  project: (p: Point) => Point,
  width: number,
  height: number,
): PresenceMarker[] {
  const groups = new Map<string, PresenceMarker>();
  for (const desk of desks) {
    if (!desk.location) continue;
    const { x, y } = project(desk.location);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < -24 ||
      y < -24 ||
      x > width + 24 ||
      y > height + 24
    )
      continue;
    const key = `${Math.floor(x / 48)}:${Math.floor(y / 48)}`;
    const group = groups.get(key);
    if (group) {
      group.desks.push(desk);
      group.count += desk.players.length;
    } else
      groups.set(key, {
        id: key,
        point: desk.location,
        x,
        y,
        desks: [desk],
        count: desk.players.length,
      });
  }
  return [...groups.values()];
}
