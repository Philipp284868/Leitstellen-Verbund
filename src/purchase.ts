import { vehicleHomeAllowed } from "./catalog";
import type { Save } from "./model";
import { stationCapacity } from "./simulation/staffing";
import { progress } from "./progression";
import { IS_GERMANY } from "./world-choice";
import { bt, vt, extensions } from "./catalog";
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  nodes,
  nearest,
  isWaterSite,
  isLandSite,
  distance,
  type Point,
} from "./world";
export function buildReason(s: Save, kind: string, pos?: Point) {
  const t = bt(kind);
  if (progress(s.xp).level < t.level)
    return `Freischaltung ab Stufe ${t.level}.`;
  if (s.money < t.price) return "Budget reicht für diesen Kauf nicht aus.";
  if (pos) {
    if (
      !Number.isFinite(pos.x) ||
      !Number.isFinite(pos.y) ||
      pos.x < 0 ||
      pos.y < 0 ||
      pos.x > WORLD_WIDTH ||
      pos.y > WORLD_HEIGHT
    )
      return "Bauplatz außerhalb des Spielgebiets.";
    const site = nodes[nearest(pos)];
    if (!isLandSite(site))
      return "Bauplatz muss an Land liegen, nicht auf einer Brücke oder im Wasser.";
    if (distance(site, pos) > 25)
      return "Bauplatz benötigt eine Straßenanbindung (höchstens 300 m).";
    if (s.buildings.some((b) => distance(b.pos, site) < 20))
      return "Bauplatz bereits belegt.";
    if (t.water && !isWaterSite(site))
      return IS_GERMANY
        ? "Wasserrettung benötigt einen bestätigten Straßenstandort mit Uferzugang (höchstens 60 m zum Gewässer)."
        : "Wasserrettung benötigt einen markierten Hafenbauplatz.";
  }
  return "";
}
export function purchaseReason(s: Save, kind: string, home: string) {
  const t = vt(kind),
    b = s.buildings.find((b) => b.id === home);
  if (progress(s.xp).level < t.level)
    return `Freischaltung ab Stufe ${t.level}.`;
  if (!b || !vehicleHomeAllowed(t, b.type))
    return `Passendes Gebäude fehlt: ${bt(t.home).name}.`;
  if (b.ready > s.time) return "Wache befindet sich im Bau.";
  if (
    s.vehicles.filter((v) => v.home === home).length >= stationCapacity(b).slots
  )
    return "Keine freien Stellplätze.";
  const e = extensions.find((e) => e.types.includes(kind));
  if (e && !b.extensions.includes(e.id as (typeof b.extensions)[number]))
    return `Benötigte Wachenerweiterung: ${e.name}.`;
  if (s.money < t.price) return "Budget reicht für diesen Kauf nicht aus.";
  return "";
}
