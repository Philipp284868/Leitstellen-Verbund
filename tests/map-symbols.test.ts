import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { vehicles } from "../src/shared/catalog";
import {
  VehicleIcon,
  BuildingIcon,
  iconPaths,
  vehicleIcons,
  vehicleIconDefinition,
  buildingIconDefinition,
} from "../src/shared/map-icons";
import {
  groupGameMarkers,
  type MarkerData,
} from "../src/client/germany/game-markers";
import { clusterPresence } from "../src/client/germany/map-presence";
import { groupPresence, type PublicPlayer } from "../src/shared/presence";

it("ordnet jedem der 57 tatsächlichen Fahrzeugtypen ein explizites, renderbares Klassensymbol zu", () => {
  expect(vehicles).toHaveLength(57);
  expect(Object.keys(vehicleIcons).sort()).toEqual(
    vehicles.map((v) => v.id).sort(),
  );
  for (const vehicle of vehicles) {
    const glyph = vehicleIconDefinition(vehicle.id);
    expect(glyph).not.toBe("unknown");
    expect(iconPaths[glyph].length).toBeGreaterThan(0);
    const rendered = renderToStaticMarkup(
      createElement(VehicleIcon, { type: vehicle.id, label: vehicle.name }),
    );
    expect(rendered).toContain(`data-map-glyph="${glyph}"`);
    expect(rendered).toContain('viewBox="0 0 32 32"');
    expect(rendered).toContain('role="img"');
  }
});
it("unterscheidet fachliche Silhouetten und hat einen neutralen Fallback auch für Objektprototypnamen", () => {
  expect(
    new Set(
      [
        "lf",
        "dlk",
        "elw",
        "rtw",
        "ktw",
        "nef",
        "rth",
        "itw",
        "fustw",
        "gkw",
        "boat",
      ].map(vehicleIconDefinition),
    ).size,
  ).toBe(11);
  for (const type of ["", "future-vehicle", "__proto__", "constructor"]) {
    expect(vehicleIconDefinition(type)).toBe("unknown");
    expect(buildingIconDefinition(type)).toBe("unknown");
  }
  expect(
    renderToStaticMarkup(createElement(BuildingIcon, { type: "hospital" })),
  ).toContain('data-map-glyph="hospital"');
});
const player = (
  id: number,
  deskId: string,
  location: PublicPlayer["location"],
): PublicPlayer => ({
  id: String(id),
  name: `Disponent ${id}`,
  deskId,
  deskName: `Leitstelle ${deskId}`,
  status: id % 2 ? "online" : "reconnecting",
  location,
});
it("gruppiert alle öffentlichen Spieler ohne private Daten und macht jede Leitstelle eines Clusters erreichbar", () => {
  const players = Array.from({ length: 2400 }, (_, i) =>
    player(i, String(i % 800), {
      x: i % 4,
      y: i % 3,
      label: "Spielwache",
      source: "station",
    }),
  );
  players.push(player(9999, "noch-ohne-wache", null));
  const groups = clusterPresence(groupPresence(players), (p) => p, 1920, 1080);
  expect(groups).toHaveLength(1);
  expect(groups[0].count).toBe(2400);
  expect(groups[0].desks).toHaveLength(800);
  expect(
    new Set(groups[0].desks.flatMap((d) => d.players.map((p) => p.id))).size,
  ).toBe(2400);
  expect(groups[0].desks.some((d) => d.id === "noch-ohne-wache")).toBe(false);
});
it("ignoriert ausschließlich Präsenz außerhalb des Ausschnitts oder ohne gültigen Standort", () => {
  const players = [
    player(1, "sichtbar", { x: 10, y: 20, label: "Wache", source: "station" }),
    player(2, "fern", {
      x: 9000,
      y: 10000,
      label: "Andere Wache",
      source: "station",
    }),
    player(3, "leer", null),
  ];
  expect(
    clusterPresence(groupPresence(players), (p) => p, 1000, 800)
      .flatMap((g) => g.desks)
      .map((d) => d.id),
  ).toEqual(["sichtbar"]);
  expect(
    clusterPresence(
      groupPresence(players),
      () => ({ x: NaN, y: 0 }),
      1000,
      800,
    ),
  ).toEqual([]);
});

it("bewahrt auch am maximalen Zoom alle gleich platzierten Fahrzeuge und lässt die echte Wache getrennt", () => {
  const station: MarkerData = {
    id: "station",
    kind: "station",
    name: "Wache",
    pos: { x: 50, y: 50 },
    org: "Feuerwehr",
    type: "fire",
  };
  const data: MarkerData[] = [
    station,
    ...Array.from({ length: 700 }, (_, i) => ({
      id: `v${i}`,
      kind: "vehicle" as const,
      name: `Funkrufname ${i}`,
      pos: { x: 50, y: 50 },
      org: "Feuerwehr",
      type: "lf",
    })),
  ];
  const groups = groupGameMarkers(data, (p) => p, 1920, 1080, 18, "v411");
  expect(groups).toHaveLength(2);
  const fleet = groups.find((g) => g.kind === "vehicle")!;
  expect(fleet.count).toBe(700);
  expect(fleet.members).toHaveLength(700);
  expect(fleet.id).toBe("v411");
  expect(fleet.coLocated).toBe(true);
  expect(groups.find((g) => g.kind === "station")).toMatchObject({
    id: "station",
    left: 50,
    top: 50,
    coLocated: false,
  });
  expect(data[0].pos).toEqual({ x: 50, y: 50 });
});
