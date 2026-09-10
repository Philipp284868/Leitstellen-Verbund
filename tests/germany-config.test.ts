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
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

let germanyBinary: Uint8Array;
let base: string,
  app: string,
  data: string,
  geo: string,
  oldData: string,
  oldGeo: string;
beforeAll(async () => {
  async function compile() {
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
    });
    return result.outputFiles[0].contents;
  }
  germanyBinary = await compile();
});
beforeEach(() => {
  base = mkdtempSync(resolve(tmpdir(), "lv-germany-config-"));
  app = resolve(base, "app");
  data = resolve(base, "germany-data");
  geo = resolve(base, "germany-geo");
  oldData = resolve(base, "old-data");
  oldGeo = resolve(base, "old-geo");
  for (const directory of [resolve(app, "dist/server"), geo, oldData, oldGeo])
    mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(oldData, "old-save"), "unmodified-rivermere-save");
  writeFileSync(resolve(app, "dist/server/config.mjs"), germanyBinary);
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
function run(extra: Record<string, string> = {}) {
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
  return spawnSync(process.execPath, [resolve(app, "dist/server/config.mjs")], {
    cwd: base,
    env: { ...env, ...extra },
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
}
describe("shared configuration for direct server and CLI", () => {
  it("rejects conflicting files and preserves both", () => {
    configure();
    const before = readFileSync(resolve(app, ".env"));
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Konfigurationskonflikt");
    expect(readFileSync(resolve(app, ".env"))).toEqual(before);
  });
  it("supports a single legacy configuration consistently without writing it during start", () => {
    rmSync(resolve(app, ".env"));
    configure();
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).dataDir).toBe(data);
    expect(existsSync(data)).toBe(false);
  });
  it("honors explicit network overrides and reports the same routing URL to CLI", () => {
    rmSync(resolve(app, ".env"));
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
  it.each(["DATA_DIR", "GEODATA_DIR"])(
    "rejects conflicting environment path %s",
    (key) => {
      rmSync(resolve(app, ".env"));
      configure();
      const result = run({ [key]: oldData });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Datenpfadkonflikt");
      expect(existsSync(data)).toBe(false);
    },
  );
  it("uses program-relative paths when the caller has another cwd", () => {
    writeFileSync(
      resolve(app, ".env"),
      "DATA_DIR=../germany-data\nGEODATA_DIR=../germany-geo\nPUBLIC_URL=https://existing.example\n",
    );
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      dataDir: data,
      geodataDir: geo,
      port: 7777,
    });
  });
});
