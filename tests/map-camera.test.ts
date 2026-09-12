import { describe, it, expect } from "vitest";
import {
  readCamera,
  wheelPixels,
  DRAG_THRESHOLD,
} from "../src/client/map-camera";
describe("lokale Kartenpräferenzen", () => {
  it("verwirft fremde Welten, Seeds, ungültige Koordinaten und defekte Speicherung", () => {
    const c = {
      world: "rivermere-1",
      seed: 1,
      x: 4000,
      y: 3000,
      zoom: 1,
      sensitivity: 1,
    };
    const read = (v: unknown) =>
      readCamera(JSON.stringify(v), "rivermere-1", 1, 100000 / 12);
    expect(read(c)).toEqual(c);
    for (const patch of [
      { world: "falkenried-2" },
      { seed: 2 },
      { x: -1 },
      { y: 100000 },
      { zoom: 0 },
      { sensitivity: 20 },
    ])
      expect(read({ ...c, ...patch })).toBeNull();
    expect(readCamera("{", "rivermere-1", 1, 100000 / 12)).toBeNull();
  });
  it("normalisiert Mausradeinheiten unabhängig von Pixeldichte und Weltzoom", () => {
    expect(DRAG_THRESHOLD).toBe(5);
    expect(wheelPixels(3, 1, 900)).toBe(48);
    expect(wheelPixels(1, 2, 900)).toBe(900);
    expect(wheelPixels(48, 0, 900)).toBe(48);
  });
});
