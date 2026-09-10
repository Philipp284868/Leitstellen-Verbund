import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { Save } from "../src/model";
import type { missionList as MissionList } from "../src/workspace";

let client: {
  missionList: typeof MissionList;
};
beforeAll(async () => {
  mkdirSync(".tools", { recursive: true });
  const outfile = resolve(`.tools/germany-client-${process.pid}.mjs`);
  await build({
    stdin: {
      contents: "export {missionList} from './src/workspace';",
      resolveDir: process.cwd(),
    },
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
  });
  // No provider is installed in this separately bundled client module. Imports must not query geography.
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
