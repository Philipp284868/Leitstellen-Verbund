import type { Point } from "./projection";
import { incidentColors, type IncidentKind } from "../mission-presentation";
export type MarkerData = {
  id: string;
  name: string;
  pos: Point;
  kind: "station" | "mission" | "vehicle" | "volunteer";
  target?: string;
  org: string;
  friend?: boolean;
  type?: string;
  fms?: number;
  fault?: boolean;
  heading?: number;
  category?: IncidentKind;
  categories?: IncidentKind[];
  color?: string;
  urgent?: boolean;
};
export type MarkerGroup = MarkerData & {
  left: number;
  top: number;
  count?: number;
  members: MarkerData[];
  coLocated: boolean;
};
/** Screen-space grouping preserves every accessible member, including identical coordinates. */
export function groupGameMarkers(
  data: readonly MarkerData[],
  project: (p: Point) => Point,
  width: number,
  height: number,
  zoom: number,
  selected: string,
): MarkerGroup[] {
  const groups = new Map<string, MarkerGroup>(),
    anchors = new Map<string, Point[]>();
  for (const item of [...data].sort(
    (a, b) => Number(b.id === selected) - Number(a.id === selected),
  )) {
    const pixel = project(item.pos);
    if (
      !Number.isFinite(pixel.x) ||
      !Number.isFinite(pixel.y) ||
      pixel.x < -30 ||
      pixel.y < -30 ||
      pixel.x > width + 30 ||
      pixel.y > height + 30
    )
      continue;
    if (item.kind === "station" || item.kind === "mission") {
      const key = `${Math.floor(pixel.x / 24)}:${Math.floor(pixel.y / 24)}`,
        cell = anchors.get(key) ?? [];
      cell.push(pixel);
      anchors.set(key, cell);
    }
    const size = zoom >= 14 ? 16 : 36;
    const key =
      item.kind !== "vehicle" && (zoom >= 14 || item.id === selected)
        ? item.id
        : `${item.kind}:${Math.floor(pixel.x / size)}:${Math.floor(pixel.y / size)}`;
    const group = groups.get(key);
    if (group) {
      group.members.push(item);
      group.count = group.members.length;
      if (group.kind === "mission") {
        group.categories = [
          ...new Set(
            group.members.flatMap(
              (m) => m.categories ?? [m.category ?? "unknown"],
            ),
          ),
        ];
        group.category =
          group.categories.length === 1 ? group.categories[0] : "mixed";
        group.color = incidentColors[group.category];
        group.urgent ||= item.urgent;
      }
    } else
      groups.set(key, {
        ...item,
        left: pixel.x,
        top: pixel.y,
        members: [item],
        coLocated: false,
      });
  }
  for (const group of groups.values())
    if (group.kind === "vehicle") {
      const x = Math.floor(group.left / 24),
        y = Math.floor(group.top / 24);
      for (let dx = -1; dx <= 1 && !group.coLocated; dx++)
        for (let dy = -1; dy <= 1 && !group.coLocated; dy++)
          group.coLocated = (anchors.get(`${x + dx}:${y + dy}`) ?? []).some(
            (p) => Math.hypot(p.x - group.left, p.y - group.top) < 22,
          );
    }
  return [...groups.values()];
}
