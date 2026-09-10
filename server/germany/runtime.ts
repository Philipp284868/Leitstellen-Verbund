import { resolve } from "node:path";
import { root, type Config } from "../config";
import { existsSync } from "node:fs";
import { assertGraphRuntimeIdentity } from "./identity";
import { GermanyMaps } from "./maps";
import { initializeGermany } from "./provider";
export async function prepareGeography(
  c: Pick<Config, "geodataDir" | "routerUrl">,
) {
  if (!c.geodataDir) throw Error("GEODATA_DIR fehlt für Deutschland.");
  const maps = new GermanyMaps(c.geodataDir);
  try {
    const provider = await initializeGermany({
      indexPath: resolve(c.geodataDir, "index.sqlite"),
      facilitiesPath: existsSync(resolve(c.geodataDir, "facilities.sqlite"))
        ? resolve(c.geodataDir, "facilities.sqlite")
        : resolve(root, "dist/server/facilities.sqlite"),
      mapsPath: resolve(c.geodataDir, "maps.mbtiles"),
      dataset: maps.manifest.dataset,
      routerUrl: c.routerUrl,
    });
    try {
      if (!provider.facilities)
        throw Error(
          "Standortkatalog fehlt. Projekt vollständig aktualisieren und bauen.",
        );
      assertGraphRuntimeIdentity(
        maps.manifest.graphRuntimeIdentity,
        provider.health(),
      );
    } catch (error) {
      await provider.close();
      throw error;
    }
    let closed = false;
    return {
      maps,
      provider,
      close: async () => {
        if (closed) return;
        closed = true;
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
