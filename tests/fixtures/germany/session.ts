import { afterAll } from "vitest";
import { createGermanyRuntime } from "./runtime";

export const runtime = await createGermanyRuntime();
const keys = ["GEODATA_DIR", "GRAPHHOPPER_URL", "ALLOW_HTTP"] as const;
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
Object.assign(process.env, {
  GEODATA_DIR: runtime.geodataDir,
  GRAPHHOPPER_URL: runtime.routerUrl,
  ALLOW_HTTP: "true",
});
afterAll(async () => {
  try {
    await runtime.close();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
