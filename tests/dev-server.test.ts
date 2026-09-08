import { it, expect } from "vitest";
import { fork, type ChildProcess } from "node:child_process";
import { mkdtemp, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "node:net";
it("Entwicklungsserver stoppt per IPC und erhält Konto sowie Sperrfreiheit beim Neustart", async () => {
  const dataDir = await mkdtemp(resolve(tmpdir(), "lv-dev-ipc-"));
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((done) => probe.close(() => done()));
  const origin = `http://127.0.0.1:${port}`;
  let child: ChildProcess | undefined, exit: Promise<number | null>;
  async function start() {
    child = fork(resolve("scripts/dev-server.mjs"), [], {
      execArgv: [],
      env: {
        ...process.env,
        PORT: String(port),
        PUBLIC_URL: origin,
        DATA_DIR: dataDir,
      },
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    exit = new Promise((done, reject) => {
      child!.once("error", reject);
      child!.once("exit", done);
    });
    await Promise.race([
      new Promise<void>((done) =>
        child!.once("message", (m) => m === "ready" && done()),
      ),
      exit.then(() => {
        throw Error("Entwicklungsserver nicht bereit");
      }),
    ]);
  }
  async function stop() {
    child!.send("stop");
    expect(await exit).toBe(0);
    child = undefined;
    await expect(access(resolve(dataDir, "server.lock"))).rejects.toMatchObject(
      { code: "ENOENT" },
    );
  }
  try {
    await start();
    const response = await fetch(origin + "/api/register", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        username: "devcheck",
        password: "Development-IPC-test-123!",
        name: "Entwicklung",
        station: "Entwicklungsleitstelle",
      }),
    });
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    await stop();
    await start();
    const response2 = await fetch(origin + "/api/me", { headers: { cookie } });
    expect(response2.status).toBe(200);
    const data = await response2.json();
    expect(data.save.player.station).toBe("Entwicklungsleitstelle");
    expect(data.mode).toBe("multi");
    await stop();
  } finally {
    if (child) {
      child.send("stop");
      await exit!;
    }
  }
}, 20000);
