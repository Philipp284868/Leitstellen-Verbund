import { bt, vt } from "./catalog";
import type { Save, Vehicle } from "./model";
import { operativeCode } from "./simulation/fms";
import { vehiclePosition } from "./vehicle-position";
import { distance, type Point } from "./world";
export const fleetSorts = {
  type: "Fahrzeugtyp",
  home: "Wache",
  status: "Status",
  organization: "Organisation",
  distance: "Entfernung",
  mission: "Einsatzbindung",
  availability: "Verfügbarkeit",
  fms: "FMS",
  favorite: "Favoriten",
} as const;
export type FleetSort = keyof typeof fleetSorts;
export function sortFleet(
  s: Save,
  units: Vehicle[],
  sort: FleetSort,
  origin: Point | undefined,
  ready: (v: Vehicle) => string,
) {
  const value = (v: Vehicle): string | number => {
    switch (sort) {
      case "type":
        return vt(v.type).name;
      case "home":
        return s.buildings.find((b) => b.id === v.home)?.name ?? "";
      case "status":
        return v.status;
      case "organization":
        return bt(vt(v.type).home).org;
      case "distance":
        return origin ? distance(vehiclePosition(v, s.time), origin) : 0;
      case "mission":
        return v.mission ?? "";
      case "availability":
        return Number(!!ready(v));
      case "fms":
        return s.desk.fleet[v.id]?.code ?? operativeCode(v);
      case "favorite":
        return Number(!v.favorite);
    }
  };
  const keyed = units.map((v) => ({ v, key: value(v) }));
  return keyed
    .sort(
      (a, b) =>
        (typeof a.key === "number" && typeof b.key === "number"
          ? a.key - b.key
          : String(a.key).localeCompare(String(b.key), "de", {
              numeric: true,
            })) ||
        a.v.name.localeCompare(b.v.name, "de", { numeric: true }) ||
        a.v.id.localeCompare(b.v.id),
    )
    .map((x) => x.v);
}
