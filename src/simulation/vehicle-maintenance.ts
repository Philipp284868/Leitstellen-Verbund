import type { Save, Vehicle } from "../shared/model";
import { euro } from "../shared/money";
import { bookMoney } from "../shared/economy/ledger";
import { setFms } from "./fms";
export function wear(v: Vehicle) {
  // Old kilometers remain real kilometers, but the first workshop interval
  // starts at migration so an old fleet is not disabled by the upgrade.
  return Math.min(
    100,
    Math.max(
      0,
      ((v.odometer ?? 0) - (v.maintenance?.servicedMeters ?? v.odometer ?? 0)) /
        20000,
    ),
  );
}
export function maintenanceCost(v: Vehicle) {
  return euro(250 + Math.ceil(wear(v) * 25));
}
export function maintenanceTick(s: Save, v: Vehicle) {
  v.maintenance ??= {
    version: 1,
    servicedMeters: v.odometer ?? 0,
    services: 0,
    until: 0,
    history: [],
  };
  const m = v.maintenance;
  if (m.until && m.until <= s.time) {
    m.until = 0;
    m.servicedMeters = v.odometer ?? 0;
    m.services++;
    setFms(s, v, 2, "server", "Werkstatt: Wartung abgeschlossen");
  }
}
export function serviceVehicle(s: Save, id: string) {
  const v = s.vehicles.find((v) => v.id === id && v.owner === s.player.id);
  if (
    !v ||
    v.status !== "ready" ||
    v.patients ||
    v.mission ||
    v.postIncident ||
    (v.fault && v.fault.state !== "repaired")
  )
    throw Error("Wartung benötigt ein freies Fahrzeug an der Wache.");
  maintenanceTick(s, v);
  if (v.maintenance!.until > s.time) return;
  const cost = maintenanceCost(v);
  bookMoney(
    s,
    -cost,
    `Wartung: ${v.name}`,
    `maintenance:${s.generation}:${v.id}:${v.maintenance!.services}`,
  );
  v.maintenance!.until = s.time + 120 + Math.ceil(wear(v) * 3);
  v.maintenance!.history.push({ at: s.time, cost, meters: v.odometer ?? 0 });
  v.maintenance!.history = v.maintenance!.history.slice(-50);
  setFms(s, v, 6, "server", "Fahrzeug in der Werkstatt");
}
