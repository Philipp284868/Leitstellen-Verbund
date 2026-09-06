import { it, expect } from "vitest";
import { mkdtemp, mkdir, cp, symlink, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

it("AMP: normaler Produktionsstart legt Admin an, verbirgt die Datei im HTTP und übernimmt Änderungen nach Neustart", async () => {
  const base = await mkdtemp(resolve(tmpdir(), "lv-amp-auto-")), program = resolve(base, "app"), data = resolve(base, "data");
  await mkdir(program); await mkdir(data);
  await cp(resolve("dist"), resolve(program, "dist"), { recursive: true });
  await symlink(resolve("node_modules"), resolve(program, "node_modules"), "junction");
  await writeFile(resolve(program, "package.json"), '{"type":"module"}');
  const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const address = probe.address(); if (!address || typeof address === "string") throw Error("Kein Testport");
  const port = address.port; await new Promise<void>((done) => probe.close(() => done()));
  const origin = `http://127.0.0.1:${port}`;
  const env = { ...process.env };
  for (const key of ["DATA_DIR", "HOST", "PORT", "PUBLIC_URL", "ALLOW_HTTP", "TRUSTED_PROXIES"]) delete env[key];
  const config = `HOST=127.0.0.1\nPORT=${port}\nPUBLIC_URL=${origin}\nDATA_DIR=${data.replaceAll("\\", "/")}\n`;
  await writeFile(resolve(program, ".env"), config);
  let child: ChildProcess | undefined, logs = "";
  const file = resolve(program, "admin-konto.json");
  const read = async () => JSON.parse(await readFile(file, "utf8"));
  async function start() {
    child = spawn(process.execPath, ["dist/server/index.js"], { cwd: program, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout!.on("data", (chunk) => { logs += chunk; });
    child.stderr!.on("data", (chunk) => { logs += chunk; });
    for (let i = 0; i < 200; i++) {
      if (child.exitCode !== null) throw Error(`Server vorzeitig beendet: ${logs}`);
      try { if ((await fetch(origin + "/api/health")).ok) return; } catch { /* startup */ }
      await new Promise((done) => setTimeout(done, 50));
    }
    throw Error(`Serverstart nicht bereit: ${logs}`);
  }
  async function stop() {
    if (!child || child.exitCode !== null) { child = undefined; return; }
    const done = once(child, "exit"); child.kill("SIGTERM"); const [code] = await done;
    if (process.platform === "win32") {
      spawnSync(process.execPath, ["dist/server/cli.js", "unlock", "--confirm"], { cwd: program, env });
    } else expect(code).toBe(0);
    child = undefined;
  }
  const login = (username: string, password: string) => fetch(origin + "/api/login", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ username, password }),
  });
  try {
    await start();
    const initial = await read();
    expect(initial.benutzername).toBe("philipp"); expect(initial.passwort.length).toBeGreaterThanOrEqual(24);
    for (const path of ["/admin-konto.json", "/.env", "/ADMIN-ZUGANG.txt", "/%2e%2e/admin-konto.json"])
      expect((await fetch(origin + path)).status).toBe(404);
    expect(logs).not.toContain(initial.passwort);
    const logged = await login(initial.benutzername, initial.passwort); expect(logged.status).toBe(200);
    const cookie = logged.headers.get("set-cookie")!.split(";")[0];
    const me = await (await fetch(origin + "/api/me", { headers: { cookie } })).json();
    expect(me.user.role).toBe("admin"); expect((await read()).passwort).toBe("");
    await stop();
    const password = "Neu-" + crypto.randomUUID();
    await writeFile(file, JSON.stringify({ ...await read(), benutzername: "philipp_neu", passwort: password, aenderungenAnwenden: true }));
    await start();
    expect((await login(initial.benutzername, initial.passwort)).status).toBe(401);
    const changed = await login("philipp_neu", password); expect(changed.status).toBe(200);
    expect((await fetch(origin + "/api/me", { headers: { cookie } })).status).toBe(401);
    const current = await (await fetch(origin + "/api/me", { headers: { cookie: changed.headers.get("set-cookie")!.split(";")[0] } })).json();
    expect(current.user.id).toBe(me.user.id); expect(current.save.money).toBe(me.save.money);
    expect((await read()).aenderungenAnwenden).toBe(false); expect((await read()).passwort).toBe("");
    expect(await readFile(resolve(program, ".env"), "utf8")).toBe(config);
    expect(logs).not.toContain(password);
    await stop(); await start();
    expect((await login("philipp_neu", password)).status).toBe(200);
    await stop();
  } finally {
    if (child) await stop();
    await rm(base, { recursive: true, force: true });
  }
}, 45000);
