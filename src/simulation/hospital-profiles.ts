import type { Hospital } from "../germany/world";
import type { Point } from "../world";
import { specialties } from "./organizations-schema";

export type HospitalOption = {
  id: string;
  name: string;
  pos: Point;
  osmLocation?: Point;
  capacity: number;
  open: boolean;
  specialties: string[];
  profileSource?: "simulation-v1";
};
const profiles = [
  { name: "Basisversorgung", capacity: 30, specialties: ["general"] },
  {
    name: "Regelversorgung",
    capacity: 60,
    specialties: ["general", "trauma", "pediatric"],
  },
  {
    name: "Intensivschwerpunkt",
    capacity: 60,
    specialties: ["general", "trauma", "intensive"],
  },
  {
    name: "Maximalversorgung",
    capacity: 100,
    specialties: Object.keys(specialties),
  },
];

/** Stable gameplay capabilities, explicitly not a statement about the real hospital. */
export function publicHospitalProfile(h: Hospital): HospitalOption {
  let key = 2166136261;
  for (const char of h.id) key = Math.imul(key ^ char.charCodeAt(0), 16777619);
  const profile = profiles[(key >>> 0) % profiles.length];
  return {
    id: `public:${h.id}`,
    name: `${h.name} · Spielprofil: ${profile.name}`,
    pos: { x: h.x, y: h.y },
    osmLocation: h.osmLocation,
    capacity: profile.capacity,
    open: true,
    specialties: [...profile.specialties],
    profileSource: "simulation-v1",
  };
}
