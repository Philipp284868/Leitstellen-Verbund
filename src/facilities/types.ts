import type { Point } from "../germany/projection";

export const facilityKinds = [
  "fire",
  "ems",
  "police",
  "thw",
  "kats",
  "hospital",
  "heli",
  "water",
  "school",
  "other",
] as const;
export type FacilityKind = (typeof facilityKinds)[number];
export const facilityLabels: Record<FacilityKind, string> = {
  fire: "Feuerwache",
  ems: "Rettungswache",
  police: "Polizeiwache",
  thw: "THW-Unterkunft",
  kats: "Katastrophenschutz",
  hospital: "Krankenhaus",
  heli: "Luftrettungsbasis",
  water: "Wasserrettungsstation",
  school: "Ausbildungszentrum",
  other: "Weitere Einrichtung",
};
export type Facility = {
  id: string;
  kind: FacilityKind;
  name: string;
  address: string;
  state: string;
  snapshot: string;
  sources: string[];
  subtype: string;
  emergency: "yes" | "no" | "unknown";
  status: "active" | "inactive" | "review";
  quality: string[];
  pos: Point;
  lon: number;
  lat: number;
  access?: {
    pos: Point;
    source: string;
    method: "entrance" | "onsite-road" | "air-base" | "nearby-service-road";
  };
  accessAlternatives?: NonNullable<Facility["access"]>[];
};
export type FacilityQuery = {
  bbox?: [number, number, number, number];
  search?: string;
  kind?: FacilityKind;
  ids?: string[];
  usable?: boolean;
  offerFilter?: {
    kinds: FacilityKind[];
    owned: string[];
    available: boolean;
  };
  limit?: number;
};
export type FacilityCluster = {
  lon: number;
  lat: number;
  count: number;
  id?: string;
  kind?: FacilityKind;
  name?: string;
  usable?: boolean;
};
export interface FacilityCatalog {
  readonly snapshot: string;
  get(id: string): Facility | undefined;
  query(query: FacilityQuery): Facility[];
  clusters(
    bbox: [number, number, number, number],
    zoom: number,
    kind?: FacilityKind,
  ): FacilityCluster[];
}
