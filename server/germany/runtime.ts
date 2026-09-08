import { resolve } from "node:path";
import type { Config } from "../config";
import { IS_GERMANY } from "../../src/world-choice";
import { initializeGermany } from "./provider";
import { GermanyMaps } from "./maps";
import { assertGraphRuntimeIdentity } from "./identity";

export async function prepareGeography(c: Config) {
  if (!IS_GERMANY) return undefined;
  if (!c.geodataDir) throw Error("GEODATA_DIR fehlt für Deutschland.");
  const maps = new GermanyMaps(c.geodataDir);
  try {
    const provider = await initializeGermany({
      indexPath: resolve(c.geodataDir, "index.sqlite"),
      dataset: maps.manifest.dataset,
      routerUrl: c.routerUrl,
    });
    try {
      assertGraphRuntimeIdentity(
        maps.manifest.graphRuntimeIdentity,
        provider.health(),
      );
    } catch (error) {
      await provider.close();
      throw error;
    }
    return {
      maps,
      provider,
      close: async () => {
        maps.close();
        await provider.close();
      },
    };
  } catch (error) {
    maps.close();
    throw error;
  }
}
export type Geography = Awaited<ReturnType<typeof prepareGeography>>;
