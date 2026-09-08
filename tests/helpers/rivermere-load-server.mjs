import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const f = await import(pathToFileURL(process.argv[2]).href);
const { startServer } = await import(
  pathToFileURL(resolve("dist/worlds/rivermere/dist/server/index.js")).href
);
const c = {
  host: "127.0.0.1",
  port: 0,
  publicUrl: "http://127.0.0.1:0",
  dataDir: await mkdtemp(resolve(tmpdir(), "lv-rm-load-process-")),
  secure: false,
  trustedProxies: [],
};
const app = await f.listenBrowserServer(startServer, c);
const owner = await app.auth.create(
  "rivermere-load",
  "Rivermere-password-123!",
  "Lastprüfung",
  "Rivermere Lastprüfung",
);
const load = f.regionalLoadFixture(owner);
app.db.save(owner, load);
process.send?.({
  origin: c.publicUrl,
  buildings: load.buildings.length,
  vehicles: load.vehicles.length,
  incidents: load.missions.length,
});
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  void app
    .close()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
};
process.on("message", (message) => {
  if (message === "stop") stop();
});
process.on("disconnect", stop);
process.on("SIGTERM", stop);
