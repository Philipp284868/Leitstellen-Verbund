import { createServer } from "node:net";
import type { Config } from "../../src/server/config";
import type { startServer } from "../../src/server/index";

export async function listenServer(start: typeof startServer, c: Config) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const probe = createServer();
    await new Promise<void>((done, reject) => {
      probe.once("error", reject);
      probe.listen(0, c.host, done);
    });
    const address = probe.address();
    await new Promise<void>((done, reject) =>
      probe.close((e) => (e ? reject(e) : done())),
    );
    if (!address || typeof address === "string")
      throw Error("Kein freier Testport.");
    c.port = address.port;
    c.publicUrl = `http://${c.host}:${c.port}`;
    const app = start(c);
    try {
      await app.listen();
      return app;
    } catch (e) {
      await app.close();
      if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE" || attempt === 4)
        throw e;
    }
  }
  throw Error("Kein freier Testport.");
}
