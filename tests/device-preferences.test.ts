import { describe, it, expect } from "vitest";
import {
  parseDevice,
  shortcutConflicts,
  defaultDevice,
} from "../src/client/device-preferences";
import { searchNavigation } from "../src/client/navigation";
describe("versioned workstation settings", () => {
  it("migrates local workspace without sharing it through the world", () => {
    const p = parseDevice(
      null,
      JSON.stringify({ side: "right", width: 380, keys: { call: "b" } }),
    );
    expect(p.workspace.side).toBe("left");
    expect(p.workspace.width).toBe(320);
    expect(p.workspace.keys.call).toBe("b");
    expect(p.version).toBe(2);
  });
  it("rejects unbounded values and detects duplicate draft shortcuts without deleting either assignment", () => {
    const p = parseDevice(
      JSON.stringify({
        scale: 999,
        markerSize: -1,
        zoomSensitivity: Infinity,
        light: "yes",
        routes: false,
      }),
    );
    expect(p.scale).toBe(100);
    expect(p.markerSize).toBe(100);
    expect(p.routes).toBe(false);
    expect(p.light).toBe(false);
    const workspace = structuredClone(defaultDevice.workspace);
    workspace.keys.fms = workspace.keys.call;
    expect(shortcutConflicts(workspace)).toEqual(["n"]);
    expect(workspace.keys.fms).toBe("n");
    expect(workspace.keys.call).toBe("n");
  });
  it("finds existing menu and settings destinations without depending on hidden mission data", () => {
    expect(searchNavigation("Funk Lautstärke").map((x) => x.id)).toContain(
      "settings",
    );
    expect(searchNavigation("AAO").map((x) => x.id)).toContain("aaos");
    expect(searchNavigation("Geldjournal").map((x) => x.id)).toContain(
      "archive",
    );
    expect(searchNavigation("unknown-secret")).toEqual([]);
  });
});
