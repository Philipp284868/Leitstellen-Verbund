import type { SVGProps } from "react";
import { IS_GERMANY } from "./world-choice";

// Original vector artwork. All symbols share a 32-unit canvas and 1.65-unit line.
const truck =
  "M3 23V10h17v13M20 15h5l4 5v3h-3M3 23h3m5 0h10M21 15v5h7M8.5 21a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M23.5 21a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5";
const van =
  "M3 23V12a2 2 0 0 1 2-2h15l8 8v5h-3M3 23h3m5 0h9M20 11v8h8M8.5 21a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M22.5 21a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5";
const car =
  "M3 23v-6l5-1 4-5h8l5 6 4 2v4h-3M3 23h3m5 0h10M9 16h15M16 11v5M8.5 21a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M23.5 21a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5";
const bus =
  "M3 23V10h23l3 5v8h-3M3 23h3m5 0h10M3 17h26M9 11v6m6-6v6m6-6v6M8.5 21a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M23.5 21a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5";
export const iconPaths = {
  engine: [truck, "M6 13h10m-10 3h10m-10 3h7M5 7h12M22 12h3"],
  tanker: [truck, "M7 13h7a3 3 0 0 1 0 6H7a3 3 0 0 1 0-6M10 12v8M22 12h3"],
  ladder: [
    truck,
    "M3 8l23-5m-22 9l23-5M8 7l1 4m4-5l1 4m4-5l1 4m4-5l1 4M7 17h9",
  ],
  commandVan: [van, "M9 17h5m-2-3v6M12 9V5m-4 0a5 5 0 0 1 8 0"],
  civilianCar: [car],
  commandCar: [car, "M13 8h6M16 8V4m-5 1a7 7 0 0 1 10 0"],
  rescue: [truck, "M7 13l8 7m-8 0l8-7M6 7h11M22 12h3"],
  equipment: [truck, "M7 13h9v7H7zm4 0v7M6 7h11M22 12h3"],
  hazmat: [truck, "M11 12l5 4-5 4-5-4zM11 14v3m0 1h.1M22 12h3"],
  breathing: [
    truck,
    "M8 13v6a1.5 1.5 0 0 0 3 0v-6zm6 0v6a1.5 1.5 0 0 0 3 0v-6zM22 12h3",
  ],
  measurement: [van, "M6 17h2l2-4 3 7 2-4h3M12 7V4"],
  decon: [truck, "M8 13h8m-4 0v3m-4 1v2m4-2v2m4-2v2M22 12h3"],
  carrier: [truck, "M5 11v8h13V8H8M4 8h4M22 12h3"],
  ambulance: [van, "M11 12v8m-4-4h8M21 8h3"],
  medicalTruck: [truck, "M11 12v8m-4-4h8M22 12h3"],
  patientVan: [van, "M6 17h10m-8-3v3m-2 3h10m-10-3v3M21 8h3"],
  doctorCar: [car, "M14 19h5m-2.5-2.5v5M13 8h6"],
  medicalCommand: [car, "M14 19h5m-2.5-2.5v5M16 9V4m-4 1a6 6 0 0 1 8 0"],
  medicalBus: [bus, "M13 4h6m-3-3v6"],
  intensive: [van, "M5 16h3l2-4 3 8 2-4h3M21 8h3"],
  helicopter: [
    "M5 8h22M16 8v6M11 14h10l6 6-3 3H10l-5-7-3-1v-4l5 3h4M15 15v6m-4 6h15m-12-4-1 4m8-4 1 4M19 18h4m-2-2v4",
  ],
  policeCar: [car, "M12 8h8M14 19l3 3 3-3m-3-1v4"],
  policeVan: [van, "M12 12l5 2v3l-5 3-5-3v-3zM21 8h3"],
  technical: [truck, "M7 15h8m-8 4h8M9 12v8m4-8v8M22 12h3"],
  boat: ["M3 21h26l-5 6H8zM9 21v-7h12l4 7M16 14V8h5M4 30q3-2 6 0t6 0t6 0t6 0"],
  boatTrailer: [
    "M2 23V14h7l4 5v4h-2M2 23h2m5 0h9M8 15v5h5M4 22a2 2 0 1 0 4 0 2 2 0 0 0-4 0M15 17h15l-4 5h-8zM20 17v-5h5l3 5M15 25h15M22 24a2 2 0 1 0 4 0 2 2 0 0 0-4 0",
  ],
  supportBus: [bus, "M13 4h6m-3-3v6M5 7h4"],
  unknown: ["M7 26V6h18v20zM11 11h10m-10 5h10m-10 5h6"],
  fireStation: [
    "M4 27V14l12-9 12 9v13H4M4 14h24M9 27v-9h6v9m5 0v-9h5M14 4h4M10 21h4m-4 3h4",
  ],
  emsStation: ["M5 27V9h22v18H5M12 27v-8h8v8M16 5v9m-4-4h8M8 16h3m10 0h3"],
  policeStation: ["M5 27V10l11-6 11 6v17M4 27h24M12 13l4-2 4 2v5l-4 4-4-4z"],
  technicalStation: ["M4 27V12l12-7 12 7v15H4M10 27v-8h12v8M10 13h12m-6-3v6"],
  hospital: [
    "M5 27V11h6V5h10v6h6v16H5M13 9h6m-3-3v6M13 27v-7h6v7M8 16h2m12 0h2",
  ],
  station: [
    "M8 22V7h16v15H8M8 16h16M12 8v7m8-7v7M11 20h1m8 0h1M11 23l-4 6m14-6 4 6M10 26h12",
  ],
  airport: ["M16 3v25m-1-18L4 17v3l11-5m2-5 11 7v3l-11-5m-2 8-6 5m8-5 6 5"],
  harbor: [
    "M16 12v15M12 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0M9 15h14M4 20v4l12 5 12-5v-4M4 20l4 3m20-3-4 3",
  ],
  school: ["M3 12l13-8 13 8-13 8zM8 16v8q8 5 16 0v-8M29 12v12"],
  care: ["M5 27V13l11-9 11 9v14H5M10 18q0-5 6-2 6-3 6 2 0 4-6 7-6-3-6-7"],
  shopping: ["M7 12h18l2 15H5zM12 12V8a4 4 0 0 1 8 0v4M11 17v2m10-2v2"],
  venue: ["M4 10h24v17H4M8 10V6h16v4M9 14v9m14-9v9M12 27v-5h8v5M13 15h6"],
  industry: ["M4 27V15l9-5v7l9-5v15H4M24 27V4h4v23M8 22h3m5 0h3"],
  academy: ["M4 27h24M7 27V15m6 12V15m6 12V15m6 12V15M4 12l12-8 12 8z"],
  dispatch: [
    "M16 11v17M10 28l6-13 6 13M11 10a7 7 0 0 1 10 0M7 7a12 12 0 0 1 18 0M16 6v6",
  ],
} as const;
export type MapGlyph = keyof typeof iconPaths;
export const vehicleIcons = {
  tsf: "engine",
  lf: "engine",
  hlf: "engine",
  lf10: "engine",
  hlf10: "engine",
  tlf: "tanker",
  tlf2000: "tanker",
  tlf3000: "tanker",
  dlk: "ladder",
  elw: "commandVan",
  elw2: "commandVan",
  kdow: "commandCar",
  rw: "rescue",
  vrw: "rescue",
  haz: "hazmat",
  air: "breathing",
  gwl: "equipment",
  gwmess: "measurement",
  gwt: "equipment",
  abruest: "carrier",
  abwasser: "carrier",
  abschaum: "carrier",
  abatem: "carrier",
  abgefahrgut: "carrier",
  sw: "equipment",
  dekonp: "decon",
  rtw: "ambulance",
  rtwxl: "ambulance",
  segrtw: "ambulance",
  ktw: "patientVan",
  ktwb: "patientVan",
  mzf: "patientVan",
  nef: "doctorCar",
  naw: "ambulance",
  itw: "intensive",
  grtw: "medicalBus",
  elrd: "medicalCommand",
  orgl: "medicalCommand",
  lna: "medicalCommand",
  gwsan: "medicalTruck",
  segbetreuung: "supportBus",
  rth: "helicopter",
  ith: "helicopter",
  fustw: "policeCar",
  pmtw: "policeVan",
  gkw: "technical",
  mzgw: "technical",
  tmtw: "commandVan",
  gww: "rescue",
  boat: IS_GERMANY ? "boatTrailer" : "boat",
} as const satisfies Record<string, MapGlyph>;
export const buildingIcons: Record<string, MapGlyph> = {
  kats: "emsStation",
  fire: "fireStation",
  fire_station: "fireStation",
  ems: "emsStation",
  ambulance_station: "emsStation",
  police: "policeStation",
  thw: "technicalStation",
  hospital: "hospital",
  clinic: "hospital",
  school: "academy",
  water: "harbor",
  heli: "airport",
  station: "station",
  airport: "airport",
  harbor: "harbor",
  education: "school",
  care: "care",
  shopping: "shopping",
  venue: "venue",
  industry: "industry",
  dispatch: "dispatch",
};
export const organizationColors: Record<string, string> = {
  Feuerwehr: "#a84f41",
  Rettungsdienst: "#347a66",
  Polizei: "#3d709c",
  THW: "#3454a2",
  Wasserrettung: "#247e95",
  Infrastruktur: "#617577",
  Verbund: "#6a5b82",
};
export function vehicleIconDefinition(type: string): MapGlyph {
  return Object.hasOwn(vehicleIcons, type)
    ? vehicleIcons[type as keyof typeof vehicleIcons]
    : "unknown";
}
export function buildingIconDefinition(type: string): MapGlyph {
  return Object.hasOwn(buildingIcons, type) ? buildingIcons[type] : "unknown";
}
type IconProps = SVGProps<SVGSVGElement> & { size?: number; label?: string };
export function MapIcon({
  glyph,
  size = 24,
  label,
  ...props
}: IconProps & { glyph: MapGlyph }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      data-map-glyph={glyph}
      {...props}
    >
      {iconPaths[glyph].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
export function VehicleIcon({ type, ...props }: IconProps & { type: string }) {
  return <MapIcon glyph={vehicleIconDefinition(type)} {...props} />;
}
export function BuildingIcon({ type, ...props }: IconProps & { type: string }) {
  return <MapIcon glyph={buildingIconDefinition(type)} {...props} />;
}
