import { fixturePurchase } from "./fixtures/germany/facilities";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { exportText } from "../src/storage";
import { established } from "./e2e/fixtures";
import { sites as nodes } from "./fixtures/germany/locations";
import "./fixtures/germany/session";

it("startet gebaute Node-Datei mit .env, verwaltet nur Spieler und restauriert nach Prozessneustart", async () => {
  const base = await mkdtemp(resolve(tmpdir(), "lv-runtime-")),
    program = resolve(base, "app"),
    data = resolve(base, "data");
  await mkdir(program);
  await cp(resolve("dist"), resolve(program, "dist"), { recursive: true });
  await symlink(
    resolve("node_modules"),
    resolve(program, "node_modules"),
    "junction",
  );
  await writeFile(resolve(program, "package.json"), '{"type":"module"}');
  const port = 31000 + Math.floor(Math.random() * 7000),
    origin = `http://127.0.0.1:${port}`,
    env = { ...process.env };
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
    `HOST=127.0.0.1\nPORT=${port}\nPUBLIC_URL=${origin}\nDATA_DIR=${data.replaceAll("\\", "/")}\nALLOW_HTTP=true\n`,
  );
  const password = "Runtime-" + crypto.randomUUID();
  const cli = (args: string[], input?: string) =>
    spawnSync(process.execPath, ["dist/server/cli.js", ...args], {
      cwd: program,
      env,
      encoding: "utf8",
      input,
    });
  const createArgs = [
    "player-create",
    "--username",
    "runtime",
    "--name",
    "Runtime",
    "--station",
    "Zentrale",
    "--password-stdin",
  ];
  const create = cli(createArgs, password);
  expect(create.status, create.stderr).toBe(0);
  expect(cli(createArgs, password).status).not.toBe(0);
  expect(cli(["admin-create"], password).status).not.toBe(0);
  expect(cli(["invite"]).status).not.toBe(0);
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
        /* already released */
      }
    }
    child = undefined;
  }
  const logIn = () =>
    fetch(origin + "/api/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ username: "runtime", password }),
    });
  try {
    await start();
    expect((await fetch(origin)).status).toBe(200);
    const login = await logIn();
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const me = await (
      await fetch(origin + "/api/me", { headers: { cookie } })
    ).json();
    expect(me.user.role).toBe("player");
    const command = {
      id: crypto.randomUUID(),
      action: fixturePurchase("fire", nodes[0]),
    };
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
    const file = saved.stdout.trim(),
      legacy = resolve(base, "legacy.json");
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
    const again = await logIn();
    expect(again.status).toBe(200);
    const current = await (
      await fetch(origin + "/api/me", {
        headers: { cookie: again.headers.get("set-cookie")!.split(";")[0] },
      })
    ).json();
    expect(current.user.role).toBe("player");
    expect(current.save.player.id).toBe(me.save.player.id);
    expect(current.save.buildings).toHaveLength(1);
    expect(current.save.buildings[0].type).toBe("fire");
    expect(current.save.reliefActive).toBe(false);
    await stop();
  } finally {
    if (child) await stop();
  }
}, 30000);
