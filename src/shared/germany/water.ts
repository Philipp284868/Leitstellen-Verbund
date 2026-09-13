import type { Point } from "./projection";
export type WaterArea =
  | "center"
  | "residential"
  | "industrial"
  | "village"
  | "farm"
  | "unbuilt"
  | "unknown";
export type WaterSource = {
  id: string;
  pos: Point;
  access: Point;
  kind: "hydrant" | "open-water";
  origin: "openstreetmap" | "simulation-v1";
  snapshot: string;
  dataset: string;
  area: WaterArea;
  flowLpm: number;
  flowSource: "simulation-v1";
  properties: Record<string, string>;
  quality: string[];
  usable?: boolean;
  reason?: string;
};
export type WaterEnvironment = {
  area: WaterArea;
  buildings: number;
  roadClass: string;
  blocked: boolean;
  reference: string;
};
export type WaterConnection = {
  source: WaterSource;
  path: Point[];
  meters: number;
};
