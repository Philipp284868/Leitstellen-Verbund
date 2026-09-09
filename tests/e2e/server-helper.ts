import { createServer } from "node:net";
import type { Config } from "../../server/config";
import type { startServer } from "../../server/index";

async function availablePort(host: string) {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, host, resolve);
  });
  const address = probe.address();
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  if (!address || typeof address === "string")
    throw Error("Kein freier TCP-Testport ermittelt.");
  return address.port;
}

export async function listenBrowserServer(
  start: typeof startServer,
  c: Config,
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    c.port = await availablePort(c.host);
    c.publicUrl = `http://${c.host}:${c.port}`;
    const app = start(c);
    try {
      await app.listen();
      return app;
    } catch (error) {
      await app.close();
      // Another process can acquire the port between probing and binding.
      // Retry only this startup race, never a test or application failure.
      if (
        (error as NodeJS.ErrnoException).code !== "EADDRINUSE" ||
        attempt === 4
      )
        throw error;
    }
  }
  throw Error("Kein freier TCP-Testport verfügbar.");
}
