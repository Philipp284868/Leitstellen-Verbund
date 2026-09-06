import { it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  cp,
  symlink,
  writeFile,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { established } from "./e2e/fixtures";
import { exportText } from "../src/storage";

it("startet gebaute Node-Datei mit .env, administriert ohne Standardkonto und restauriert nach Prozessneustart", async () => {
  const base = await mkdtemp(resolve(tmpdir(), "lv-runtime-")),
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
  const port = 31000 + Math.floor(Math.random() * 7000),
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
  await writeFile(
    resolve(program, ".env"),
    `HOST=127.0.0.1\nPORT=${port}\nPUBLIC_URL=${origin}\nDATA_DIR=${data.replaceAll("\\", "/")}\n`,
  );
  const password = "Runtime-" + crypto.randomUUID(),
    cli = (args: string[], input?: string) =>
      spawnSync(process.execPath, ["dist/server/cli.js", ...args], {
        cwd: program,
        env,
        encoding: "utf8",
        input,
      });
  const create = cli(
    [
      "admin-create",
      "--username",
      "runtime",
      "--name",
      "Runtime",
      "--station",
      "Zentrale",
      "--password-stdin",
    ],
    password,
  );
  expect(create.status, create.stderr).toBe(0);
  expect(
    cli(
      [
        "admin-create",
        "--username",
        "second",
        "--name",
        "Second",
        "--station",
        "Second",
        "--password-stdin",
      ],
      password,
    ).status,
  ).not.toBe(0);
  let child: ChildProcess | undefined;
  async function start() {
    child = spawn(process.execPath, ["dist/server/index.js"], {
      cwd: program,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        ready = (await fetch(origin + "/api/health")).ok;
      } catch {
        /* starting */
      }
      if (ready) break;
      if (child.exitCode !== null)
        throw Error("Produktionsserver ist vorzeitig beendet.");
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(ready).toBe(true);
  }
  async function stop() {
    if (!child) return;
    const ended = once(child, "exit");
    child.kill("SIGTERM");
    const [code] = await ended;
    if (process.platform !== "win32") expect(code).toBe(0);
    else {
      try {
        await access(resolve(data, "server.lock"));
        expect(cli(["unlock", "--confirm"]).status).toBe(0);
      } catch {
        /* SIGTERM was graceful */
      }
    }
    child = undefined;
  }
  try {
    await start();
    expect((await fetch(origin)).status).toBe(200);
    const login = await fetch(origin + "/api/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "runtime", password }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const me = await (
      await fetch(origin + "/api/me", { headers: { cookie } })
    ).json();
    const command = { id: crypto.randomUUID(), action: { type: "relief" } };
    for (let i = 0; i < 2; i++)
      expect(
        (
          await fetch(origin + "/api/action", {
            method: "POST",
            headers: {
              origin,
              cookie,
              "content-type": "application/json",
              "x-csrf-token": me.csrf,
            },
            body: JSON.stringify(command),
          })
        ).status,
      ).toBe(200);
    expect(cli(["backup"]).status).not.toBe(0);
    await stop();
    const saved = cli(["backup"]);
    expect(saved.status, saved.stderr).toBe(0);
    const file = saved.stdout.trim();
    const legacy = resolve(base, "legacy.json");
    await writeFile(legacy, exportText(established("Altbestand")));
    expect(
      cli(["legacy-import", "--username", "runtime", "--file", legacy]).status,
    ).not.toBe(0);
    const imported = cli([
      "legacy-import",
      "--username",
      "runtime",
      "--file",
      legacy,
      "--confirm-replace-and-reset-active",
    ]);
    expect(imported.status, imported.stderr).toBe(0);
    const restored = cli(["restore", "--file", file, "--confirm"]);
    expect(restored.status, restored.stderr).toBe(0);
    await start();
    expect(
      (await fetch(origin + "/api/me", { headers: { cookie } })).status,
    ).toBe(401);
    const again = await fetch(origin + "/api/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "runtime", password }),
    });
    expect(again.status).toBe(200);
    const current = await (
      await fetch(origin + "/api/me", {
        headers: { cookie: again.headers.get("set-cookie")!.split(";")[0] },
      })
    ).json();
    expect(current.save.player.id).toBe(me.save.player.id);
    expect(current.save.buildings).toHaveLength(0);
    expect(current.save.reliefActive).toBe(true);
    await stop();
  } finally {
    if (child) await stop();
  }
}, 30000);
