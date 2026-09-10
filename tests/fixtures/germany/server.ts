import { startServer as productServer } from "../../../server/index";
import { GermanyMaps } from "../../../server/germany/maps";
import { LocalGermanyProvider } from "../../../server/germany/provider";
import { assertGraphRuntimeIdentity } from "../../../server/germany/identity";
import { installGermanyProvider } from "../../../src/germany/world";
import { runtime } from "./session";
import { fixtureDataset } from "./locations";
import { resolve } from "node:path";

export function startServer(
  ...[config, client]: Parameters<typeof productServer>
) {
  const maps = new GermanyMaps(runtime.geodataDir);
  const provider = new LocalGermanyProvider({
    indexPath: resolve(runtime.geodataDir, "index.sqlite"),
    mapsPath: resolve(runtime.geodataDir, "maps.mbtiles"),
    dataset: fixtureDataset,
    routerUrl: runtime.routerUrl,
  });
  assertGraphRuntimeIdentity(
    maps.manifest.graphRuntimeIdentity,
    provider.health(),
  );
  installGermanyProvider(provider);
  const geography = {
    maps,
    provider,
    close: async () => {
      maps.close();
      await provider.close();
    },
  };
  try {
    return productServer(
      Object.assign(config, {
        geodataDir: runtime.geodataDir,
        routerUrl: runtime.routerUrl,
      }),
      client,
      geography,
    );
  } catch (error) {
    void geography.close();
    throw error;
  }
}
