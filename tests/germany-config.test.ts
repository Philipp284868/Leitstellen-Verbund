import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve, sep } from "node:path";

let germanyBinary: Uint8Array, legacyBinary: Uint8Array;
let base: string,
  app: string,
  data: string,
  geo: string,
  oldData: string,
  oldGeo: string;
beforeAll(async () => {
  async function compile(world: string) {
    const result = await build({
      stdin: {
        contents:
          'import {config} from "./server/config"; try { console.log(JSON.stringify(config())); } catch(error) { console.error(error.message); process.exitCode=1; }',
        resolveDir: resolve("."),
      },
      write: false,
      bundle: true,
      platform: "node",
      format: "esm",
      define: { __LV_WORLD__: JSON.stringify(world) },
    });
    return result.outputFiles[0].contents;
  }
  [germanyBinary, legacyBinary] = await Promise.all([
    compile("germany-1"),
    compile("rivermere-1"),
  ]);
});
beforeEach(() => {
  base = mkdtempSync(resolve(tmpdir(), "lv-germany-config-"));
  app = resolve(base, "app");
  data = resolve(base, "germany-data");
  geo = resolve(base, "germany-geo");
  oldData = resolve(base, "old-data");
  oldGeo = resolve(base, "old-geo");
  for (const directory of [
    resolve(app, "dist/germany/server"),
    resolve(app, "dist/server"),
    geo,
    oldData,
    oldGeo,
  ])
    mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(oldData, "old-save"), "unmodified-rivermere-save");
  writeFileSync(resolve(app, "dist/germany/server/config.mjs"), germanyBinary);
  writeFileSync(resolve(app, "dist/server/config.mjs"), legacyBinary);
  writeFileSync(
    resolve(app, ".env"),
    `HOST=127.0.0.1\nPORT=7777\nPUBLIC_URL=https://old.example\nDATA_DIR="${oldData}"\nGEODATA_DIR="${oldGeo}"\nGRAPHHOPPER_URL=http://127.0.0.1:8999\n`,
  );
});
afterEach(() => {
  const path = relative(resolve(tmpdir()), base);
  if (!path.startsWith("lv-germany-config-") || path.includes(sep))
    throw Error("Unsicherer Test-Aufräumpfad");
  rmSync(base, { recursive: true, force: true });
});
function configure(extra = "") {
  writeFileSync(
    resolve(app, ".env.germany"),
    `HOST=0.0.0.0\nPORT=7788\nPUBLIC_URL=https://germany.example\nDATA_DIR="${data}"\nGEODATA_DIR="${geo}"\n${extra}`,
  );
}
function run(extra: Record<string, string> = {}, germany = true) {
  const env = { ...process.env };
  for (const key of [
    "HOST",
    "PORT",
    "PUBLIC_URL",
    "ALLOW_HTTP",
    "TRUSTED_PROXIES",
    "DATA_DIR",
    "GEODATA_DIR",
    "GRAPHHOPPER_URL",
  ])
    delete env[key];
  return spawnSync(
    process.execPath,
    [
      resolve(
        app,
        germany ? "dist/germany/server/config.mjs" : "dist/server/config.mjs",
      ),
    ],
    {
      cwd: base,
      env: { ...env, ...extra },
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    },
  );
}
describe("Deutschland-Konfiguration für Server und CLI", () => {
  it("verwendet beim direkten Programmeinstieg die Deutschlanddatei und erhält den alten Spielstand", () => {
    configure();
    const original = readFileSync(resolve(app, ".env"));
    const result = run({ DATA_DIR: oldData, GEODATA_DIR: oldGeo });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      host: "0.0.0.0",
      port: 7788,
      publicUrl: "https://germany.example",
      dataDir: data,
      geodataDir: geo,
      routerUrl: "http://127.0.0.1:8989",
    });
    expect(readFileSync(resolve(app, ".env"))).toEqual(original);
    expect(readFileSync(resolve(oldData, "old-save"), "utf8")).toBe(
      "unmodified-rivermere-save",
    );
  });
  it("behält die vom Launcher verwaltete Routeradresse und ausdrückliche Netzwerk-Umgebungswerte", () => {
    configure();
    const result = run({
      PORT: "7799",
      PUBLIC_URL: "https://override.example",
      GRAPHHOPPER_URL: "http://127.0.0.1:9001",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      port: 7799,
      publicUrl: "https://override.example",
      routerUrl: "http://127.0.0.1:9001",
      dataDir: data,
    });
  });
  it("wendet einen ausdrücklich in Deutschland konfigurierten separaten Router an", () => {
    configure("GRAPHHOPPER_URL=http://127.0.0.1:9011\n");
    const result = run({ GRAPHHOPPER_URL: "http://127.0.0.1:8999" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).routerUrl).toBe("http://127.0.0.1:9011");
  });
  it.each(["DATA_DIR", "GEODATA_DIR"])(
    "fällt bei fehlendem %s nicht auf einen alten AMP-Pfad zurück",
    (missing) => {
      configure();
      const file = resolve(app, ".env.germany");
      writeFileSync(
        file,
        readFileSync(file, "utf8")
          .split("\n")
          .filter((line) => !line.startsWith(`${missing}=`))
          .join("\n"),
      );
      const result = run({ DATA_DIR: oldData, GEODATA_DIR: oldGeo });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(missing);
      expect(readFileSync(resolve(oldData, "old-save"), "utf8")).toBe(
        "unmodified-rivermere-save",
      );
      if (missing === "DATA_DIR") expect(existsSync(data)).toBe(false);
    },
  );
  it("erhält die bisherige .env-Auswertung einer manuell eingerichteten Deutschlandwelt", () => {
    writeFileSync(
      resolve(app, ".env"),
      `DATA_DIR="${data}"\nGEODATA_DIR="${geo}"\nPUBLIC_URL=https://existing-germany.example\n`,
    );
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      dataDir: data,
      geodataDir: geo,
      publicUrl: "https://existing-germany.example",
    });
  });
  it("lässt Rivermere weiterhin seine bisherige .env und Welt verwenden", () => {
    configure();
    const result = run({}, false);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      dataDir: oldData,
      publicUrl: "https://old.example",
      port: 7777,
    });
    expect(JSON.parse(result.stdout)).not.toHaveProperty("geodataDir");
    expect(existsSync(data)).toBe(false);
  });
});
