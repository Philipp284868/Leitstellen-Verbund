// Development worker: IPC provides a graceful restart on Windows as well as Linux.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const runtime = await import(
  pathToFileURL(resolve(process.env.LV_DEV_MODULE || "dist/server/index.js"))
    .href
);
const config = {
  host: "127.0.0.1",
  port: Number(process.env.PORT),
  publicUrl: process.env.PUBLIC_URL,
  dataDir: process.env.DATA_DIR,
  secure: false,
  trustedProxies: [],
  geodataDir: process.env.GEODATA_DIR,
  routerUrl: process.env.GRAPHHOPPER_URL,
};
const geography = await runtime.prepareGeography(config);
const app = runtime.startServer(config, resolve("dist/client"), geography);
let closing;
const stop = () =>
  (closing ??= (async () => {
    await app.close();
    process.exit(0);
  })());
process.on("message", (message) => {
  if (message === "stop") void stop();
});
process.on("disconnect", () => void stop());
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
try {
  await app.listen();
  process.send?.("ready");
} catch (error) {
  await app.close();
  throw error;
}
