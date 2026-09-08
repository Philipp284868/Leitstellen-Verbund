import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import {
  readGermanyCamera,
  germanyStyle,
  GERMANY_BOUNDS,
} from "../src/germany/map-style";

describe("Deutschlandkamera", () => {
  const camera = {
    world: "germany-1",
    seed: 42,
    lon: 13.4,
    lat: 52.5,
    zoom: 12,
  };
  it("stellt nur gültige Koordinaten derselben Welt wieder her", () => {
    const read = (value: unknown) =>
      readGermanyCamera(JSON.stringify(value), "germany-1", 42);
    expect(read(camera)).toEqual({ lon: 13.4, lat: 52.5, zoom: 12 });
    for (const patch of [
      { world: "rivermere-1" },
      { seed: 43 },
      { lon: 4000 },
      { lat: -52 },
      { zoom: 30 },
      { lon: null },
    ])
      expect(read({ ...camera, ...patch })).toBeNull();
    expect(readGermanyCamera("{", "germany-1", 42)).toBeNull();
  });
  it("behält zulässige hohe und niedrige Zoomstufen sowie den nördlichen Bereich", () => {
    expect(
      readGermanyCamera(
        JSON.stringify({ ...camera, lat: 55.1, zoom: 4 }),
        "germany-1",
        42,
      ),
    ).not.toBeNull();
    expect(
      readGermanyCamera(
        JSON.stringify({ ...camera, zoom: 18 }),
        "germany-1",
        42,
      ),
    ).not.toBeNull();
  });
});
describe("Deutschland-Vektorkartenstil", () => {
  it("erfüllt den installierten MapLibre-Style-Spec und verwendet nur lokale Tiles", () => {
    const dependency = createRequire(
      createRequire(import.meta.url).resolve("maplibre-gl/package.json"),
    );
    const { validateStyleMin } = dependency(
      "@maplibre/maplibre-gl-style-spec",
    ) as { validateStyleMin: (style: unknown) => { message: string }[] };
    vi.stubGlobal("location", { origin: "http://127.0.0.1:3000" });
    try {
      const style = germanyStyle({ bounds: GERMANY_BOUNDS });
      expect(validateStyleMin(style).map((error) => error.message)).toEqual([]);
      expect(style.sources.germany).toMatchObject({
        type: "vector",
        tiles: ["http://127.0.0.1:3000/geo/tiles/{z}/{x}/{y}.pbf"],
      });
      expect(style.glyphs).toBeUndefined();
      expect(style.sprite).toBeUndefined();
      expect(style.sources.elevation).toBeUndefined();
      expect(style.layers.some((layer) => layer.id === "terrain-relief")).toBe(
        false,
      );
      const relief = germanyStyle({
        bounds: GERMANY_BOUNDS,
        dem: {
          minzoom: 5,
          maxzoom: 11,
          encoding: "terrarium",
          attribution: "Copernicus <GLO-90> & DLR",
          dataset: "a".repeat(64),
        },
      });
      expect(validateStyleMin(relief).map((error) => error.message)).toEqual(
        [],
      );
      expect(relief.sources.elevation).toMatchObject({
        type: "raster-dem",
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 11,
        tiles: [
          `http://127.0.0.1:3000/geo/dem/{z}/{x}/{y}.png?dataset=${"a".repeat(64)}`,
        ],
        attribution: "Copernicus &lt;GLO-90&gt; &amp; DLR",
      });
      const layers = relief.layers.map((layer) => layer.id);
      expect(layers.indexOf("terrain-relief")).toBeGreaterThan(
        layers.indexOf("landcover"),
      );
      expect(layers.indexOf("terrain-relief")).toBeLessThan(
        layers.indexOf("roads"),
      );
      expect(style.layers.map((layer) => layer.id)).toEqual(
        expect.arrayContaining([
          "water",
          "waterway",
          "landcover",
          "landuse",
          "buildings",
          "roads",
          "national-boundary",
          "state-boundary",
          "labels-place",
          "labels-mountain_peak",
          "labels-water_name",
          "labels-transportation_name",
        ]),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
