import type { Save } from "../shared/model";
import type { Template } from "../shared/catalog";
import { germanyProvider, type Point } from "../shared/germany/world";
import { equipmentProfile } from "./vehicle-equipment";
/** Conservative dispatch-planning estimate, not extra water or a changed reward/difficulty curve. */
export function generationWaterFeasible(s: Save, t: Template, point: Point) {
  if (!t.requirements.fire || t.id === "bma-false") return true;
  const fleet = s.vehicles
    .filter(
      (v) =>
        v.owner === s.player.id &&
        s.buildings.some(
          (b) => b.id === v.home && !b.migrationReserve && b.ready <= s.time,
        ),
    )
    .map(equipmentProfile);
  const hazard = t.profile?.hazards.find((h) => h.kind === "fire");
  const fire = t.profile?.requirements.fire ?? t.requirements.fire;
  const seconds =
    ((hazard?.initial ?? 24) + (hazard?.growth ?? 0.035) * 600) /
    Math.max(0.1, 0.7 - (hazard?.growth ?? 0.035) * 2);
  const tank = fleet.reduce((n, p) => n + p.water, 0);
  if (tank >= ((fire * 360 * seconds) / 60) * 1.25) return true;
  const hose = fleet.reduce((n, p) => n + p.hoseB, 0),
    pump = fleet.reduce((n, p) => n + p.pumpLpm, 0),
    provider = germanyProvider();
  if (pump < fire * 360) return false;
  for (const source of (provider.waterSources?.(point, 600, 24) ?? [])
    .filter(
      (w) =>
        w.usable !== false && w.kind === "hydrant" && w.flowLpm >= fire * 360,
    )
    .slice(0, 4)) {
    const connection = provider.waterConnection?.(source, point);
    if (
      connection &&
      connection.meters <= hose &&
      tank >= (fire * 360 * (20 + connection.meters / 2)) / 60
    )
      return true;
  }
  return false;
}
