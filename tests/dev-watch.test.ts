import { fork, type ChildProcess } from "node:child_process";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import "./fixtures/germany/session";
async function port() {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const value = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  return value;
}
it("Dev erstellt eigene Daten, übernimmt Serveränderungen, erhält bei Compilerfehlern den letzten Server und stoppt alle Prozesse", async () => {
  const base = await mkdtemp(resolve(tmpdir(), "lv-dev-watch-")),
    root = resolve(base, "app"),
    data = resolve(base, "data");
  await mkdir(root);
  for (const path of [
    "src",
    "scripts",
    "ops",
    "public",
    "package.json",
    "vite.config.ts",
    "tsconfig.json",
    "index.html",
  ])
    await cp(resolve(path), resolve(root, path), { recursive: true });
  await symlink(
    resolve("node_modules"),
    resolve(root, "node_modules"),
    "junction",
  );
  const frontend = await port(),
    backend = await port(),
    origin = `http://127.0.0.1:${frontend}`;
  let child: ChildProcess | undefined,
    log = "";
  const events: number[] = [];
  try {
    child = fork(resolve(root, "scripts/dev.mjs"), [], {
      cwd: root,
      execArgv: [],
      env: {
        ...process.env,

        DEV_DATA_DIR: data,
        DEV_PORT: String(frontend),
        DEV_API_PORT: String(backend),
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    const exit = new Promise<number | null>((done) =>
      child!.once("exit", done),
    );
    child.stdout!.on("data", (b) => (log += b));
    child.stderr!.on("data", (b) => (log += b));
    child.on("message", (m: { type?: string; pid: number }) => {
      if (m.type === "backend-ready") events.push(m.pid);
    });
    await expect.poll(() => events.length, { timeout: 15000 }).toBe(1);
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(origin + "/api/health")).status;
          } catch {
            return 0;
          }
        },
        { timeout: 15000 },
      )
      .toBe(200);
    const response = await fetch(origin + "/api/register", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        username: "devwatch",
        password: "Development-watch-test-123!",
        name: "Entwicklung",
        station: "Bestand behalten",
      }),
    });
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const file = resolve(root, "src/server/index.ts"),
      source = await readFile(file, "utf8");
    expect(source).toContain("{ ok: !failed }");
    await writeFile(
      file,
      source.replace("{ ok: !failed }", "{ ok: !failed, developmentProbe: 1 }"),
    );
    await expect.poll(() => events.length, { timeout: 15000 }).toBe(2);
    expect(events[1]).not.toBe(events[0]);
    expect(await (await fetch(origin + "/api/health")).json()).toMatchObject({
      ok: true,
      developmentProbe: 1,
    });
    await writeFile(file, "this is an intentional invalid TypeScript fixture");
    await expect
      .poll(() => log.includes("ERROR"), { timeout: 10000 })
      .toBe(true);
    expect(await (await fetch(origin + "/api/health")).json()).toMatchObject({
      ok: true,
      developmentProbe: 1,
    });
    expect(events).toHaveLength(2);
    await writeFile(
      file,
      source.replace("{ ok: !failed }", "{ ok: !failed, developmentProbe: 2 }"),
    );
    await expect.poll(() => events.length, { timeout: 15000 }).toBe(3);
    const after = await (
      await fetch(origin + "/api/me", { headers: { cookie } })
    ).json();
    expect(after.save.player.station).toBe("Bestand behalten");
    expect(await (await fetch(origin + "/api/health")).json()).toMatchObject({
      ok: true,
      developmentProbe: 2,
    });
    child.send("stop");
    expect(await exit).toBe(0);
    child = undefined;
    await expect(access(resolve(data, "server.lock"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fetch(origin + "/api/health")).rejects.toThrow();
  } finally {
    if (child?.connected) {
      const exit = new Promise((done) => child!.once("exit", done));
      child.send("stop");
      await exit;
    }
    await rm(base, { recursive: true, force: true });
  }
}, 60000);
