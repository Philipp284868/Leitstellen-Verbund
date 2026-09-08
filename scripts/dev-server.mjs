// Development worker: IPC provides a graceful restart on Windows as well as Linux.
import { startServer } from "../dist/server/index.js";
const app = startServer({
  host: "127.0.0.1",
  port: Number(process.env.PORT),
  publicUrl: process.env.PUBLIC_URL,
  dataDir: process.env.DATA_DIR,
  secure: false,
  trustedProxies: [],
});
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
