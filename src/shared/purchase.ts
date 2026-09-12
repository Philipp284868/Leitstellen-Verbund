import { bt, extensions, vehicleHomeAllowed, vt } from "./catalog";
import type { Save } from "./model";
import { progress } from "./progression";
import { stationCapacity } from "../simulation/staffing";
export function purchaseReason(s: Save, kind: string, home: string) {
  const t = vt(kind),
    b = s.buildings.find((b) => b.id === home);
  if (progress(s.xp).level < t.level)
    return `Freischaltung ab Stufe ${t.level}.`;
  if (!b || !vehicleHomeAllowed(t, b.type))
    return `Passendes Gebäude fehlt: ${bt(t.home).name}.`;
  if (t.stationKinds && !t.stationKinds.includes(b.organization?.kind ?? ""))
    return "Benötigt eine passende Werk-, Betriebs- oder Flughafenfeuerwehr.";
  if (b.ready > s.time) return "Wache wird für den Betrieb vorbereitet.";
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
