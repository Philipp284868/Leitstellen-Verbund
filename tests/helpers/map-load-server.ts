import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { startServer, prepareGeography } from "../../src/server/index";
import { createGermanyRuntime } from "../fixtures/germany/runtime";
import { loadFixture } from "../fixtures/germany/load";
import { listenServer } from "./listen-server";

const runtime = await createGermanyRuntime();
const dataDir = await mkdtemp(resolve(tmpdir(), "lv-map-load-"));
const c = {
  host: "127.0.0.1",
  port: 0,
  publicUrl: "http://127.0.0.1:0",
  dataDir,
  secure: false,
  trustedProxies: [],
  geodataDir: runtime.geodataDir,
  routerUrl: runtime.routerUrl,
};
const geography = await prepareGeography(c);
let app: ReturnType<typeof startServer> | undefined;
try {
  app = await listenServer(
    (config) => startServer(config, undefined, geography),
    c,
  );
  const owner = await app.auth.create(
    "germany-load",
    "Germany-load-password-123!",
    "Lastprüfung",
    "Deutschland Lastprüfung",
  );
  const save = loadFixture(owner);
  app.db.save(owner, save);
  process.send?.({
    origin: c.publicUrl,
    buildings: save.buildings.length,
    vehicles: save.vehicles.length,
    incidents: save.missions.length,
    activeTrips: save.vehicles.filter((v) => v.status === "return").length,
  });
} catch (error) {
  await app?.close();
  geography?.close();
  await runtime.close();
  throw error;
}
let stopping: Promise<void> | undefined;
const stop = () =>
  (stopping ??= (async () => {
    await app?.close();
    await runtime.close();
    await rm(dataDir, { recursive: true, force: true });
    process.disconnect?.();
  })());
process.on("message", (message) => {
  if (message === "stop") void stop();
});
process.on("disconnect", () => void stop());
process.on("SIGTERM", () => void stop());
