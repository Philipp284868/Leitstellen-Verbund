import { z } from "zod";
import { bt, vt, type Skills } from "../shared/catalog";
import { euro } from "../shared/money";
import type { Vehicle } from "../shared/model";

export const equipmentKeys = [
  "water",
  "hose",
  "breathing",
  "lighting",
  "generator",
  "rescue",
  "foam",
  "logistics",
] as const;
export const equipmentSchema = z
  .array(z.enum(equipmentKeys))
  .max(6)
  .refine(
    (v) => new Set(v).size === v.length,
    "Ausrüstung darf nicht doppelt gewählt werden.",
  );
export type Equipment = z.infer<typeof equipmentSchema>;
export const equipmentOptions: Record<
  Equipment[number],
  { name: string; price: number; slots: number; skills: Skills }
> = {
  water: {
    name: "Zusatzwassertank · 500 l",
    price: euro(6000),
    slots: 2,
    skills: { water: 1 },
  },
  hose: {
    name: "Schlauchpaket · 200 m B / 120 m C",
    price: euro(3500),
    slots: 1,
    skills: {},
  },
  breathing: {
    name: "Atemschutzpaket · 2 Geräte",
    price: euro(8000),
    slots: 1,
    skills: { air: 1 },
  },
  lighting: {
    name: "Lichtmast",
    price: euro(5000),
    slots: 1,
    skills: { lighting: 1 },
  },
  generator: {
    name: "Stromerzeuger",
    price: euro(7000),
    slots: 2,
    skills: { power: 1 },
  },
  rescue: {
    name: "Technischer Rettungssatz",
    price: euro(15000),
    slots: 2,
    skills: { rescue: 1, technical: 1 },
  },
  foam: {
    name: "Schaummittelpaket",
    price: euro(4500),
    slots: 1,
    skills: { foam: 1 },
  },
  logistics: {
    name: "Logistikbeladung",
    price: euro(4000),
    slots: 1,
    skills: { logistics: 1 },
  },
};
export function equipmentAllowed(kind: string, item: Equipment[number]) {
  const t = vt(kind);
  if (t.mode !== "road") return false;
  if (["water", "hose", "breathing", "foam"].includes(item))
    return (
      bt(t.home).org === "Feuerwehr" &&
      (t.skills.fire > 0 || t.skills.logistics > 0 || t.skills.water > 0)
    );
  return (
    ["Feuerwehr", "THW", "Infrastruktur"].includes(bt(t.home).org) &&
    t.crew >= 2
  );
}
export function equipmentPrice(kind: string, input: Equipment = []) {
  const configuration = equipmentSchema.parse(input);
  if (configuration.some((item) => !equipmentAllowed(kind, item)))
    throw Error("Ausrüstung passt nicht zu diesem Fahrzeug.");
  if (
    configuration.reduce((n, item) => n + equipmentOptions[item].slots, 0) > 6
  )
    throw Error("Zuladung überschritten: höchstens sechs Ausrüstungsplätze.");
  return (
    vt(kind).price +
    configuration.reduce((n, item) => n + equipmentOptions[item].price, 0)
  );
}
export function configuredSkills(
  v: Pick<Vehicle, "type" | "equipment">,
): Skills {
  const skills = { ...vt(v.type).skills };
  for (const item of v.equipment ?? [])
    for (const [key, n] of Object.entries(equipmentOptions[item].skills))
      skills[key] = (skills[key] ?? 0) + n;
  return skills;
}
/** Explicit simulated equipment quantities; existing units retain standard loadouts. */
export function equipmentProfile(v: Pick<Vehicle, "type" | "equipment">) {
  const t = vt(v.type),
    skills = configuredSkills(v);
  const fire = (t.skills.fire ?? 0) > 0;
  const baseWater =
    (
      {
        tsf: 500,
        lf: 2000,
        lf10: 1200,
        hlf: 2000,
        hlf10: 1000,
        tlf: 4000,
        tlf2000: 2000,
        tlf3000: 3000,
        abwasser: 10000,
      } as Record<string, number>
    )[v.type] ?? (t.skills.water ?? 0) * 500;
  return {
    water: baseWater + (v.equipment?.includes("water") ? 500 : 0),
    hoseB:
      (v.type === "sw" ? 2000 : fire ? (v.type === "tsf" ? 180 : 300) : 0) +
      (v.equipment?.includes("hose") ? 200 : 0),
    hoseC:
      (fire ? (v.type === "tsf" ? 120 : 240) : 0) +
      (v.equipment?.includes("hose") ? 120 : 0),
    breathing:
      (t.skills.air ?? 0) * 2 + (v.equipment?.includes("breathing") ? 2 : 0),
    skills,
  };
}
