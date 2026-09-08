import { it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { connect } from "node:net";
import { once } from "node:events";
import { startServer } from "../server/index";
import { Database } from "../server/database";
it("stoppt mit unvollständigen HTTP-Verbindungen begrenzt, idempotent und mit gesichertem Bestand", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-shutdown-"));
  const app = startServer({
    host: "127.0.0.1",
    port: 0,
    publicUrl: "http://127.0.0.1:1",
    dataDir: dir,
    secure: false,
    trustedProxies: [],
  });
  await app.listen();
  const owner = await app.auth.create(
    "shutdown",
    "Shutdown-password-123!",
    "Stop",
    "Stop",
  );
  const before = app.db.all().get(owner)!;
  const address = app.http.address();
  if (!address || typeof address === "string") throw Error("TCP-Adresse fehlt");
  const socket = connect(address.port, "127.0.0.1");
  await once(socket, "connect");
  socket.write("GET /api/health HTTP/1.1\r\nHost: localhost\r\n");
  try {
    const closing = app.close();
    expect(app.close()).toBe(closing);
    await closing;
    const restored = new Database(dir);
    try {
      expect(restored.all().get(owner)).toEqual(before);
    } finally {
      restored.close();
    }
  } finally {
    socket.destroy();
    await app.close();
  }
}, 10000);
