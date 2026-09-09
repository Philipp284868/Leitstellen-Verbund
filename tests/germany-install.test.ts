import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

const { prepareGermanyConfiguration, installGermany } = await import(
  pathToFileURL(resolve("scripts/install-germany.mjs")).href
);
let base: string, app: string;
beforeEach(() => {
  base = mkdtempSync(resolve(tmpdir(), "lv-germany-install-"));
  app = resolve(base, "app");
  mkdirSync(app);
});
afterEach(() => {
  const path = relative(resolve(tmpdir()), base);
  if (!path.startsWith("lv-germany-install-") || path.includes(sep))
    throw Error("Unsicherer Test-Aufräumpfad");
  rmSync(base, { recursive: true, force: true });
});
const configure = (environment: Record<string, string> = {}) =>
  prepareGermanyConfiguration({ programRoot: app, environment });
const germanConfig = () => readFileSync(resolve(app, ".env.germany"), "utf8");

describe("Deutschland-Neuinstallation über GitHub", () => {
  it("übernimmt vorhandene Netzwerkwerte und lässt .env und alte Spieldaten bytegleich", () => {
    const oldData = resolve(base, "rivermere-data");
    mkdirSync(oldData);
    const save = Buffer.from([0, 255, 17, 22]);
    writeFileSync(resolve(oldData, "server.sqlite"), save);
    const original = Buffer.from(
      `# Bewusste private Testkonfiguration\r\nHOST=0.0.0.0\r\nPORT=7777\r\nPUBLIC_URL=http://game.example:7777\r\nALLOW_HTTP=true\r\nDATA_DIR="${oldData}"\r\nGEODATA_DIR=/old/geo\r\nGRAPHHOPPER_URL=http://old:8989\r\n`,
    );
    writeFileSync(resolve(app, ".env"), original);
    const result = configure();
    expect(readFileSync(resolve(app, ".env"))).toEqual(original);
    expect(readFileSync(resolve(oldData, "server.sqlite"))).toEqual(save);
    expect(result).toMatchObject({
      created: true,
      dataDir: resolve(base, "leitstellen-germany-data"),
      geodataDir: resolve(base, "leitstellen-germany-geodata"),
      needsPublicUrl: false,
    });
    expect(parseEnv(germanConfig())).toMatchObject({
      PORT: "7777",
      PUBLIC_URL: "http://game.example:7777",
      ALLOW_HTTP: "true",
    });
    expect(result.environment.GRAPHHOPPER_URL).toBeUndefined();
    expect(existsSync(result.dataDir)).toBe(false);
  });
  it("legt ohne vorhandene Einstellungen nur eine sichere lokale Adresse an", () => {
    const result = configure();
    expect(result.environment).toMatchObject({
      HOST: "0.0.0.0",
      PORT: "7777",
      PUBLIC_URL: "http://127.0.0.1:7777",
      ALLOW_HTTP: "false",
    });
    expect(result.needsPublicUrl).toBe(true);
    expect(existsSync(resolve(app, ".env"))).toBe(false);
  });
  it("erhält bestehende Deutschlandkonfiguration und Spielstände bei Wiederholung vollständig", () => {
    const initial = configure();
    const custom = `${germanConfig()}\n# Eigene Einstellung bleibt erhalten\nGRAPHHOPPER_URL=http://127.0.0.1:8999\n`;
    writeFileSync(resolve(app, ".env.germany"), custom);
    mkdirSync(initial.dataDir);
    writeFileSync(resolve(initial.dataDir, "server.sqlite"), "new-world");
    const result = configure({
      PORT: "8888",
      DATA_DIR: "/old-game",
      GEODATA_DIR: "/old-map",
      GERMANY_DATA_DIR: "/different-game",
      GRAPHHOPPER_URL: "http://old-router:8989",
    });
    expect(result.created).toBe(false);
    expect(germanConfig()).toBe(custom);
    expect(result.dataDir).toBe(initial.dataDir);
    expect(result.environment.PORT).toBe("8888");
    expect(result.environment.GRAPHHOPPER_URL).toBe("http://127.0.0.1:8999");
    expect(
      readFileSync(resolve(initial.dataDir, "server.sqlite"), "utf8"),
    ).toBe("new-world");
  });
  it("nimmt ausschließlich ausdrücklich Deutschland zugewiesene Datenpfade an", () => {
    const data = resolve(base, "eigene Daten");
    const geo = resolve(base, "eigene Geodaten");
    const result = configure({
      GERMANY_DATA_DIR: data,
      GERMANY_GEODATA_DIR: geo,
      DATA_DIR: "/old-data",
      GEODATA_DIR: "/old-geo",
      GRAPHHOPPER_URL: "http://old-router:8989",
    });
    expect(parseEnv(germanConfig())).toMatchObject({
      DATA_DIR: data,
      GEODATA_DIR: geo,
    });
    expect(result.environment.GRAPHHOPPER_URL).toBeUndefined();
  });
  it.each(["GAME", "GEO"])(
    "überlagert keinen bestehenden Spielstand durch %s",
    (destination) => {
      const oldData = resolve(base, "old-data");
      mkdirSync(oldData);
      writeFileSync(resolve(oldData, "server.sqlite"), "old-world");
      expect(() =>
        configure({
          DATA_DIR: oldData,
          [destination === "GAME" ? "GERMANY_DATA_DIR" : "GERMANY_GEODATA_DIR"]:
            resolve(oldData, "nested"),
        }),
      ).toThrow("vorhandene Spieldaten");
      expect(existsSync(resolve(app, ".env.germany"))).toBe(false);
      expect(readFileSync(resolve(oldData, "server.sqlite"), "utf8")).toBe(
        "old-world",
      );
    },
  );
  it("verweigert einen unbekannten nichtleeren Deutschland-Spielordner", () => {
    const data = resolve(base, "leitstellen-germany-data");
    mkdirSync(data);
    writeFileSync(resolve(data, "server.sqlite"), "unrecognized-save");
    expect(() => configure()).toThrow("nicht leer");
    expect(readdirSync(data)).toEqual(["server.sqlite"]);
    expect(existsSync(resolve(app, ".env.germany"))).toBe(false);
  });
  it.each(["program", "parent", "nested-data", "nested-geo"])(
    "verweigert unsichere Pfadbeziehungen: %s",
    (kind) => {
      const choices: Record<string, Record<string, string>> = {
        program: { GERMANY_DATA_DIR: resolve(app, "game") },
        parent: { GERMANY_GEODATA_DIR: base },
        "nested-data": {
          GERMANY_GEODATA_DIR: resolve(base, "leitstellen-germany-data/geo"),
        },
        "nested-geo": {
          GERMANY_DATA_DIR: resolve(base, "leitstellen-germany-geodata/game"),
        },
      };
      expect(() => configure(choices[kind])).toThrow(/außerhalb|getrennte/);
      expect(existsSync(resolve(app, ".env.germany"))).toBe(false);
    },
  );
  it("erkennt einen nach innen umgeleiteten Datenordner nach Symlink-Auflösung", () => {
    const redirected = resolve(base, "redirected");
    symlinkSync(
      app,
      redirected,
      process.platform === "win32" ? "junction" : "dir",
    );
    expect(() =>
      configure({ GERMANY_GEODATA_DIR: resolve(redirected, "geo") }),
    ).toThrow("außerhalb");
    expect(existsSync(resolve(app, ".env.germany"))).toBe(false);
  });
  it("ersetzt keine umgeleitete oder unvollständige Konfigurationsdatei", () => {
    const config = resolve(app, ".env.germany");
    mkdirSync(config);
    expect(() => configure()).toThrow("reguläre Konfigurationsdatei");
    rmSync(config, { recursive: true });
    writeFileSync(config, "# Eigene unvollständige Datei\nPORT=7777\n");
    expect(() => configure()).toThrow("benötigt DATA_DIR und GEODATA_DIR");
    expect(germanConfig()).toBe("# Eigene unvollständige Datei\nPORT=7777\n");
  });
  it("verhindert zusätzliche dotenv-Zeilen und aktiviert keine HTTP-Ausnahme", () => {
    expect(() => configure({ HOST: "0.0.0.0\nALLOW_HTTP=true" })).toThrow(
      "Zeilenumbrüche",
    );
    expect(() => configure({ PUBLIC_URL: "http://public.example" })).toThrow(
      "benötigt HTTPS",
    );
    expect(existsSync(resolve(app, ".env.germany"))).toBe(false);
  });
  it("führt Build, geprüften Datenbezug und passende Plattformwerkzeuge in Reihenfolge aus", async () => {
    const steps: string[] = [];
    const messages: string[] = [];
    const environment = {
      DATA_DIR: "/old-world",
      GRAPHHOPPER_URL: "http://old-router:8989",
    };
    const result = await installGermany({
      programRoot: app,
      environment,
      execute: async (
        args: string[],
        context: { cwd: string; env: Record<string, string> },
      ) => {
        steps.push(args.join(" "));
        expect(context.cwd).toBe(app);
        expect(context.env.DATA_DIR).toBe(
          resolve(base, "leitstellen-germany-data"),
        );
        expect(context.env.GEODATA_DIR).toBe(
          resolve(base, "leitstellen-germany-geodata"),
        );
        expect(context.env.GRAPHHOPPER_URL).toBeUndefined();
      },
      download: async (options: { target: string; programRoot: string }) => {
        expect(options.target).toBe(
          resolve(base, "leitstellen-germany-geodata"),
        );
        expect(options.programRoot).toBe(app);
        steps.push("download");
      },
      onProgress: (message: string) => messages.push(message),
    });
    expect(steps).toEqual([
      "scripts/amp-setup.mjs",
      "download",
      "scripts/geodata/pipeline.mjs tools",
    ]);
    expect(readdirSync(result.dataDir)).toEqual([]);
    expect(environment).toEqual({
      DATA_DIR: "/old-world",
      GRAPHHOPPER_URL: "http://old-router:8989",
    });
    expect(messages.join(" ")).toContain("tatsächliche Browseradresse");
  });
  it("stoppt bei unvollständigen Downloads und erhält die Konfiguration für den nächsten Versuch", async () => {
    const steps: string[] = [];
    const options = {
      programRoot: app,
      environment: {},
      execute: async (args: string[]) => {
        steps.push(args.join(" "));
      },
      download: async () => {
        throw Error("Download unterbrochen");
      },
      onProgress: () => {},
    };
    await expect(installGermany(options)).rejects.toThrow(
      "Download unterbrochen",
    );
    expect(steps).toEqual(["scripts/amp-setup.mjs"]);
    const original = germanConfig();
    await installGermany({ ...options, download: async () => {} });
    expect(germanConfig()).toBe(original);
    expect(readdirSync(resolve(base, "leitstellen-germany-data"))).toEqual([]);
  });
  it("führt den echten CLI-Einstieg ohne installierte Projektabhängigkeiten mit isolierten Prozess-Fixtures aus", () => {
    mkdirSync(resolve(app, "scripts/geodata"), { recursive: true });
    copyFileSync(
      resolve("scripts/install-germany.mjs"),
      resolve(app, "scripts/install-germany.mjs"),
    );
    const fixture = `import {appendFileSync} from 'node:fs'; appendFileSync(process.env.LV_INSTALL_LOG, JSON.stringify({step:process.argv[1], arg:process.argv[2], data:process.env.DATA_DIR,geo:process.env.GEODATA_DIR,router:process.env.GRAPHHOPPER_URL})+'\\n');`;
    writeFileSync(resolve(app, "scripts/amp-setup.mjs"), fixture);
    writeFileSync(resolve(app, "scripts/geodata/pipeline.mjs"), fixture);
    writeFileSync(
      resolve(app, "scripts/geodata/download-package.mjs"),
      `import {appendFileSync} from 'node:fs'; export async function installGeodata({target}) {appendFileSync(process.env.LV_INSTALL_LOG, JSON.stringify({step:'download',geo:target})+'\\n');}`,
    );
    writeFileSync(
      resolve(app, ".env"),
      "HOST=0.0.0.0\nPORT=7777\nPUBLIC_URL=https://game.example\nDATA_DIR=/previous-data\n",
    );
    const environment = { ...process.env };
    for (const key of [
      "HOST",
      "PORT",
      "PUBLIC_URL",
      "ALLOW_HTTP",
      "TRUSTED_PROXIES",
      "DATA_DIR",
      "GEODATA_DIR",
      "GERMANY_DATA_DIR",
      "GERMANY_GEODATA_DIR",
    ])
      delete environment[key];
    const log = resolve(base, "steps.jsonl");
    const result = spawnSync(
      process.execPath,
      [resolve(app, "scripts/install-germany.mjs")],
      {
        cwd: base,
        env: {
          ...environment,
          LV_INSTALL_LOG: log,
          GRAPHHOPPER_URL: "http://old-router:8989",
        },
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
      },
    );
    expect(result.status, result.stderr).toBe(0);
    const records = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((row) => JSON.parse(row));
    expect(records).toHaveLength(3);
    expect(records[0].step).toBe(resolve(app, "scripts/amp-setup.mjs"));
    expect(records[1]).toEqual({
      step: "download",
      geo: resolve(base, "leitstellen-germany-geodata"),
    });
    expect(records[2]).toMatchObject({
      arg: "tools",
      data: resolve(base, "leitstellen-germany-data"),
      geo: resolve(base, "leitstellen-germany-geodata"),
    });
    expect(records[2]).not.toHaveProperty("router");
    expect(existsSync(resolve(app, "node_modules"))).toBe(false);
    expect(result.stdout).toContain("Installation abgeschlossen");
  });
  it("setzt einen abgebrochenen CLI-Schritt auch nach kooperativem Child-Exit 0 nicht fort", () => {
    mkdirSync(resolve(app, "scripts/geodata"), { recursive: true });
    copyFileSync(
      resolve("scripts/install-germany.mjs"),
      resolve(app, "scripts/install-germany.mjs"),
    );
    const ready = resolve(base, "child-ready 'quoted'");
    const stopped = resolve(base, "child-stopped-cleanly 'quoted'");
    const next = resolve(base, "next-step 'quoted'");
    // Fixture paths are data, including spaces and quotes; never embed them in JS.
    writeFileSync(
      resolve(app, "scripts/amp-setup.mjs"),
      "import {writeFileSync} from 'node:fs'; process.on('SIGTERM',()=>{writeFileSync(process.env.LV_INSTALL_STOPPED,'exit-0');process.exit(0);});writeFileSync(process.env.LV_INSTALL_READY,'ready');setInterval(()=>{},1000);",
    );
    writeFileSync(
      resolve(app, "scripts/geodata/download-package.mjs"),
      "import {writeFileSync} from 'node:fs';export async function installGeodata(){writeFileSync(process.env.LV_INSTALL_NEXT,'unexpected-download');}",
    );
    writeFileSync(
      resolve(app, "scripts/geodata/pipeline.mjs"),
      "process.exit(0);",
    );
    const preload = resolve(base, "interrupt.mjs");
    // Trigger the real CLI's signal handler after its real child is ready. This
    // also exercises Windows, where the child kill itself is not cooperative.
    writeFileSync(
      preload,
      "import {existsSync} from 'node:fs';const timer=setInterval(()=>{if(existsSync(process.env.LV_INSTALL_READY)){clearInterval(timer);process.emit('SIGTERM');}},20);timer.unref();",
    );
    const environment = { ...process.env };
    for (const key of [
      "HOST",
      "PORT",
      "PUBLIC_URL",
      "ALLOW_HTTP",
      "TRUSTED_PROXIES",
      "DATA_DIR",
      "GEODATA_DIR",
      "GERMANY_DATA_DIR",
      "GERMANY_GEODATA_DIR",
    ])
      delete environment[key];
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(preload).href,
        resolve(app, "scripts/install-germany.mjs"),
      ],
      {
        cwd: base,
        env: {
          ...environment,
          LV_INSTALL_READY: ready,
          LV_INSTALL_STOPPED: stopped,
          LV_INSTALL_NEXT: next,
        },
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
      },
    );
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("Setup wurde abgebrochen");
    expect(result.stdout).not.toContain("Installation abgeschlossen");
    expect(existsSync(next)).toBe(false);
    expect(readdirSync(resolve(base, "leitstellen-germany-data"))).toEqual([]);
    if (process.platform !== "win32")
      expect(readFileSync(stopped, "utf8")).toBe("exit-0");
  });
});
