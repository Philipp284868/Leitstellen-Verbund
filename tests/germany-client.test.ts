import { beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Save } from "../src/model";
import type { missionList as MissionList } from "../src/workspace";

let client: {
  missionList: typeof MissionList;
  footprints: unknown[];
  MapTerrain: unknown;
};
beforeAll(async () => {
  mkdirSync(".tools", { recursive: true });
  const outfile = resolve(`.tools/germany-client-${process.pid}.mjs`);
  await build({
    stdin: {
      contents:
        "export {missionList} from './src/workspace'; export {MapTerrain} from './src/MapTerrain'; export {footprints} from './src/rivermere/Terrain';",
      resolveDir: process.cwd(),
    },
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    define: { __LV_WORLD__: JSON.stringify("germany-1") },
    plugins: [
      {
        name: "germany-world",
        setup(b) {
          b.onResolve({ filter: /(?:^|\/)world$/ }, () => ({
            path: resolve("src/germany/world.ts"),
          }));
        },
      },
    ],
  });
  // No GermanyProvider exists in the browser. Import itself must never query the road graph.
  client = await import(pathToFileURL(outfile).href);
});
function fixture(): Save {
  return {
    buildings: [],
    vehicles: [],
    missions: [
      {
        id: "known",
        template: "field",
        created: 1,
        pos: { x: 1000, y: 1000 },
        control: {
          locationKnown: true,
          priority: "NORMAL",
          facts: [
            {
              key: "address",
              text: "Teststraße, Berlin",
              source: "call",
              confidence: "bestätigt",
            },
          ],
          calls: [],
          radio: [],
        },
      },
    ],
  } as unknown as Save;
}
describe("Deutschland-Client ohne serverseitigen Geodatenprovider", () => {
  it("importiert Kartendarstellung ohne alte Gelände- und Straßenabfragen", () => {
    expect(client.MapTerrain).toBeDefined();
    expect(client.footprints).toEqual([]);
  });
  it("zeigt bekannte Einsätze und durchsucht deren übermittelte Adresse", () => {
    const save = fixture();
    expect(
      client.missionList(save, "", "all", "distance").map((m) => m.id),
    ).toEqual(["known"]);
    expect(
      client.missionList(save, "berLIN", "all", "time").map((m) => m.id),
    ).toEqual(["known"]);
    expect(client.missionList(save, "Hamburg", "all", "time")).toEqual([]);
  });
  it("macht die noch nicht erfragte Adresse auch über die Suche nicht sichtbar", () => {
    const save = fixture();
    save.missions[0].control!.locationKnown = false;
    expect(client.missionList(save, "Berlin", "all", "time")).toEqual([]);
    expect(client.missionList(save, "", "all", "time")).toHaveLength(1);
  });
});
