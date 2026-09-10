import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import "./fixtures/germany/session";
it("AMP startet ohne Admin-Erstellung und ignoriert frühere Admin-Dateien auch nach Neustart", async () => {
  const base = await mkdtemp(resolve(tmpdir(), "lv-no-bootstrap-")),
    program = resolve(base, "app"),
    data = resolve(base, "data");
  await mkdir(program);
  await mkdir(data);
  await cp(resolve("dist"), resolve(program, "dist"), { recursive: true });
  await symlink(
    resolve("node_modules"),
    resolve(program, "node_modules"),
    "junction",
  );
  await writeFile(resolve(program, "package.json"), '{"type":"module"}');
  const port = 30000 + Math.floor(Math.random() * 6000),
    origin = `http://127.0.0.1:${port}`;
  const env = { ...process.env };
  for (const key of [
    "DATA_DIR",
    "HOST",
    "PORT",
    "PUBLIC_URL",
    "ALLOW_HTTP",
    "TRUSTED_PROXIES",
  ])
    delete env[key];
  const envText = `HOST=127.0.0.1\nPORT=${port}\nPUBLIC_URL=${origin}\nDATA_DIR=${data.replaceAll("\\", "/")}\n`;
  await writeFile(resolve(program, ".env"), envText);
  const oldText = JSON.stringify({
    benutzername: "philipp",
    passwort: "Ignored-old-file-password!",
    aenderungenAnwenden: true,
  });
  await writeFile(resolve(program, "admin-konto.json"), oldText);
  let child: ChildProcess | undefined;
  async function start() {
    child = spawn(process.execPath, ["dist/server/index.js"], {
      cwd: program,
      env,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    for (let i = 0; i < 120; i++) {
      try {
        if ((await fetch(origin + "/api/health")).ok) return;
      } catch {
        /* starting */
      }
      if (child.exitCode !== null) throw Error("Serverstart fehlgeschlagen.");
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error("Server wurde nicht bereit.");
  }
  async function stop() {
    if (!child) return;
    const done = once(child, "exit");
    // Linux exercises actual SIGTERM; Windows exercises the same shutdown
    // implementation over its supported IPC transport rather than TerminateProcess.
    if (process.platform === "win32") child.send({ type: "shutdown" });
    else child.kill("SIGTERM");
    const [code] = await done;
    expect(code).toBe(0);
    child = undefined;
  }
  const post = (path: string, value: unknown) =>
    fetch(origin + "/api/" + path, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(value),
    });
  try {
    await start();
    const db = new DatabaseSync(resolve(data, "game.sqlite"), {
      readOnly: true,
    });
    expect(db.prepare("SELECT id FROM users").all()).toHaveLength(0);
    db.close();
    expect((await fetch(origin + "/admin-konto.json")).status).toBe(404);
    const password = "User-chosen-new-password!";
    const registered = await post("register", {
      username: "philipp",
      password,
      name: "Philipp",
      station: "Eigene Wache",
    });
    expect(registered.status).toBe(200);
    const cookie = registered.headers.get("set-cookie")!.split(";")[0];
    const first = await (
      await fetch(origin + "/api/me", { headers: { cookie } })
    ).json();
    expect(first.user.role).toBe("player");
    await stop();
    if (process.platform === "win32") {
      // The existing project supports Linux AMP; Windows does not provide a real SIGTERM.
      try {
        await access(resolve(data, "server.lock"));
        throw Error(
          "Lock nach Windows-Stopp vorhanden; Linux-CI erforderlich.",
        );
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    await start();
    expect(
      (await post("login", { username: "philipp", password })).status,
    ).toBe(200);
    expect(
      (
        await post("login", {
          username: "philipp",
          password: "Ignored-old-file-password!",
        })
      ).status,
    ).toBe(401);
    const after = await (
      await fetch(origin + "/api/me", { headers: { cookie } })
    ).json();
    expect(after.user.id).toBe(first.user.id);
    expect(after.user.role).toBe("player");
    expect(after.save.money).toBe(first.save.money);
    expect(await readFile(resolve(program, "admin-konto.json"), "utf8")).toBe(
      oldText,
    );
    expect(await readFile(resolve(program, ".env"), "utf8")).toBe(envText);
    expect((await post("admin/invite", {})).status).toBe(404);
    await stop();
  } finally {
    if (child) await stop();
  }
}, 30000);
