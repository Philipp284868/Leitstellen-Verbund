import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  copyFileSync,
  chmodSync,
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
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { createGermanyPackage } from "./fixtures/germany/package";
import { installationDatabase } from "./fixtures/installation";
const { prepareGermanyConfiguration, installGermany } = await import(
  pathToFileURL(resolve("scripts/install-germany.mjs")).href
);
const { installationLocation, resolveConfiguration } = await import(
  pathToFileURL(resolve("scripts/configuration.mjs")).href
);
const { diagnose } = await import(
  pathToFileURL(resolve("scripts/diagnose.mjs")).href
);
let base: string, app: string;
beforeEach(() => {
  base = mkdtempSync(resolve(tmpdir(), "lv-germany-install-"));
  app = resolve(base, "app");
  mkdirSync(app);
});
afterEach(() => rmSync(base, { recursive: true, force: true }));
const configure = (environment: Record<string, string> = {}) =>
  prepareGermanyConfiguration({ programRoot: app, environment });
const contents = () => readFileSync(resolve(app, ".env"), "utf8");
function game(
  data = resolve(base, "game"),
  geo = resolve(base, "geo"),
  world = "germany-1",
) {
  createGermanyPackage(geo);
  installationDatabase(data, world);
  return { data, geo };
}
function configFile(data: string, geo: string, file = ".env") {
  writeFileSync(
    resolve(app, file),
    `HOST=127.0.0.1\nPORT=7777\nPUBLIC_URL=https://game.example\nDATA_DIR="${data}"\nGEODATA_DIR="${geo}"\n`,
  );
}
function snapshot(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const file of readdirSync(root, {
    recursive: true,
    withFileTypes: true,
  }))
    if (file.isFile()) {
      const path = resolve(file.parentPath, file.name);
      result[path] = createHash("sha256")
        .update(readFileSync(path))
        .digest("hex");
    }
  return result;
}

describe("AMP installation and recovery", () => {
  it.each(["identity", "manifest", "binding"])(
    "keeps broken private %s contents out of diagnostic errors",
    (kind) => {
      const { data, geo } = game();
      configFile(data, geo);
      configure();
      const file =
        kind === "identity"
          ? resolve(installationLocation(app), "installation.json")
          : kind === "manifest"
            ? resolve(geo, "manifest.json")
            : resolve(data, ".leitstellen-instance.json");
      writeFileSync(file, "private-test-credential-invalid-json");
      const before = snapshot(base);
      const report = diagnose({ programRoot: app, environment: {} });
      expect(report.problem).toContain("Beschädigte JSON-Daten");
      expect(JSON.stringify(report)).not.toContain("private-test-credential");
      expect(snapshot(base)).toEqual(before);
    },
  );
  it("creates one private .env and distinct persistent directories for each installation", () => {
    const first = configure();
    const bytes = contents();
    const second = configure();
    expect(second.dataDir).toBe(first.dataDir);
    expect(contents()).toBe(bytes);
    expect(first.environment).toMatchObject({
      HOST: "127.0.0.1",
      PORT: "7777",
      PUBLIC_URL: "http://127.0.0.1:7777",
      ALLOW_HTTP: "false",
    });
    expect(existsSync(resolve(app, ".env.germany"))).toBe(false);
    const other = resolve(base, "app2");
    mkdirSync(other);
    const b = prepareGermanyConfiguration({
      programRoot: other,
      environment: {},
    });
    expect(first.dataDir).not.toBe(b.dataDir);
    expect(first.geodataDir).not.toBe(b.geodataDir);
  });
  it("preserves existing valid data and comments, reports AMP network overrides", () => {
    const { data, geo } = game();
    configFile(data, geo);
    writeFileSync(resolve(app, ".env"), contents() + "# note\n");
    const bytes = contents(),
      db = readFileSync(resolve(data, "game.sqlite"));
    configure();
    const result = configure({
      PORT: "7888",
      PUBLIC_URL: "https://override.example",
    });
    expect(contents()).toBe(bytes);
    expect(readFileSync(resolve(data, "game.sqlite"))).toEqual(db);
    expect(result.environment.PORT).toBe("7888");
    expect(result.sources.PORT).toBe("AMP-Umgebung");
  });
  it("migrates equal legacy values with protected backups and retires the competing file", () => {
    const { data, geo } = game();
    configFile(data, geo);
    configFile(data, geo, ".env.germany");
    const bytes = contents();
    const result = configure();
    expect(result.migrated).toBe(true);
    expect(parseEnv(contents()).DATA_DIR).toBe(data);
    expect(existsSync(resolve(app, ".env.germany"))).toBe(false);
    expect(
      readdirSync(installationLocation(app)).filter((f: string) =>
        f.startsWith("env-germany-before"),
      ),
    ).toHaveLength(1);
    const archived = readdirSync(app).find((f) =>
      f.startsWith(".env.germany.migrated"),
    )!;
    expect(readFileSync(resolve(app, archived), "utf8")).toBe(bytes);
  });
  it("rejects conflicting files in every entry reader until explicitly selected", () => {
    const { data, geo } = game();
    configFile(data, geo);
    configFile(data, geo, ".env.germany");
    writeFileSync(
      resolve(app, ".env.germany"),
      contents().replace("7777", "7788"),
    );
    const before = snapshot(base);
    expect(() => configure()).toThrow("Konfigurationskonflikt");
    expect(() =>
      resolveConfiguration({ programRoot: app, environment: {} }),
    ).toThrow("PORT");
    expect(snapshot(base)).toEqual(before);
    const result = prepareGermanyConfiguration({
      programRoot: app,
      environment: {},
      preferLegacy: true,
    });
    expect(result.environment.PORT).toBe("7788");
  });
  it("restores deleted config from trusted mapping without changing game bytes", () => {
    const { data, geo } = game();
    configFile(data, geo);
    configure();
    const bytes = contents(),
      db = readFileSync(resolve(data, "game.sqlite"));
    rmSync(resolve(app, ".env"));
    const result = configure();
    expect(result.recovered).toBe(true);
    expect(parseEnv(contents())).toEqual(parseEnv(bytes));
    expect(readFileSync(resolve(data, "game.sqlite"))).toEqual(db);
  });
  it("does not overwrite the last valid backup with invalid values", () => {
    const { data, geo } = game();
    configFile(data, geo);
    configure();
    const directory = installationLocation(app),
      before = snapshot(directory);
    writeFileSync(
      resolve(app, ".env"),
      contents().replace("PORT=7777", "PORT=invalid"),
    );
    expect(() => configure()).toThrow("PORT");
    expect(() => configure({ PORT: "7777" })).toThrow("PORT");
    expect(snapshot(directory)).toEqual(before);
  });
  it.runIf(process.platform !== "win32")(
    "rejects publicly readable installation identity on Linux",
    () => {
      configure();
      const file = resolve(installationLocation(app), "installation.json");
      chmodSync(file, 0o644);
      expect(() => configure()).toThrow("Rechtefehler");
      chmodSync(file, 0o600);
    },
  );
  it("migrates a legacy-only file without losing its data paths", () => {
    const { data, geo } = game();
    configFile(data, geo, ".env.germany");
    const result = configure();
    expect(result.migrated).toBe(true);
    expect(parseEnv(contents())).toMatchObject({
      DATA_DIR: data,
      GEODATA_DIR: geo,
    });
    expect(existsSync(resolve(app, ".env.germany"))).toBe(false);
  });
  it("uses bounded verified backups to offer recovery when both config and identity are lost", () => {
    const { data, geo } = game();
    configFile(data, geo);
    const original = configure();
    rmSync(resolve(app, ".env"));
    rmSync(resolve(installationLocation(app), "installation.json"));
    const before = snapshot(base);
    const report = diagnose({ programRoot: app, environment: {} });
    expect(report.candidates).toContainEqual(
      expect.objectContaining({
        DATA_DIR: data,
        GEODATA_DIR: geo,
        status: "valid",
      }),
    );
    expect(() => configure()).toThrow("Wiederherstellung erforderlich");
    expect(snapshot(base)).toEqual(before);
    const recovered = prepareGermanyConfiguration({
      programRoot: app,
      environment: {},
      recovery: { data, geo, confirm: true },
    });
    expect(recovered.identity.id).toBe(original.identity.id);
    expect(() => configure()).not.toThrow();
  });
  it.each(["DATA_DIR", "GEODATA_DIR"])(
    "rejects silent AMP path changes for %s",
    (key) => {
      configure();
      const before = snapshot(base);
      expect(() => configure({ [key]: resolve(base, "different") })).toThrow(
        "Datenpfadkonflikt",
      );
      expect(snapshot(base)).toEqual(before);
    },
  );
  it("offers a recognized old standard folder and requires explicit recovery", () => {
    const { data, geo } = game(
      resolve(base, "leitstellen-germany-data"),
      resolve(base, "leitstellen-germany-geodata"),
    );
    const before = snapshot(base);
    expect(() => configure()).toThrow("Wiederherstellung erforderlich");
    expect(snapshot(base)).toEqual(before);
    const result = prepareGermanyConfiguration({
      programRoot: app,
      environment: {},
      recovery: { data, geo, confirm: true },
    });
    expect(result.dataDir).toBe(data);
  });
  it("lists ambiguous candidates without selecting or writing a replacement world", () => {
    game(
      resolve(base, "leitstellen-germany-data"),
      resolve(base, "leitstellen-germany-geodata"),
    );
    game(
      resolve(base, "leitstellen-deutschland-data"),
      resolve(base, "leitstellen-deutschland-geodata"),
    );
    const before = snapshot(base);
    const report = diagnose({ programRoot: app, environment: {} });
    expect(
      report.candidates.filter((c: { status: string }) => c.status === "valid"),
    ).toHaveLength(2);
    expect(() => configure()).toThrow("Wiederherstellung");
    expect(snapshot(base)).toEqual(before);
  });
  it.each(["wrong-world", "manifest", "missing-db", "foreign-database"])(
    "rejects %s without data modifications",
    (kind) => {
      const { data, geo } = game(
        undefined,
        undefined,
        kind === "wrong-world" ? "rivermere-1" : "germany-1",
      );
      configFile(data, geo);
      if (kind === "manifest")
        writeFileSync(resolve(geo, "manifest.json"), "{}");
      if (kind === "missing-db") {
        configure();
        rmSync(resolve(data, "game.sqlite"));
      }
      if (kind === "foreign-database")
        writeFileSync(resolve(data, "game.sqlite"), "not SQLite");
      const before = snapshot(base);
      expect(() => configure()).toThrow();
      expect(snapshot(base)).toEqual(before);
    },
  );
  it("does not attach a second installation to another installation game directory", () => {
    const { data, geo } = game();
    configFile(data, geo);
    configure();
    const other = resolve(base, "app2");
    mkdirSync(other);
    expect(() =>
      prepareGermanyConfiguration({
        programRoot: other,
        environment: { DATA_DIR: data, GEODATA_DIR: geo },
      }),
    ).toThrow("anderen Installation");
  });
  it("rejects redirected and overlapping paths", () => {
    const link = resolve(base, "redirected");
    symlinkSync(app, link, process.platform === "win32" ? "junction" : "dir");
    expect(() =>
      configure({
        DATA_DIR: resolve(link, "game"),
        GEODATA_DIR: resolve(base, "geo"),
      }),
    ).toThrow("außerhalb");
    expect(() =>
      configure({ DATA_DIR: base, GEODATA_DIR: resolve(base, "geo") }),
    ).toThrow("außerhalb");
  });
  it("diagnoses missing config/build without writing and without exposing arbitrary config values", () => {
    writeFileSync(resolve(app, ".env"), "PASSWORD=do-not-log-this\n");
    const before = snapshot(base);
    expect(
      JSON.stringify(diagnose({ programRoot: app, environment: {} })),
    ).not.toContain("do-not-log-this");
    expect(snapshot(base)).toEqual(before);
  });
  it("resumes an interrupted setup and runs the existing build/download/tools chain", async () => {
    const steps: string[] = [],
      options = {
        programRoot: app,
        environment: {},
        execute: async (args: string[]) => {
          steps.push(args.join(" "));
        },
        onProgress: () => {},
      };
    await expect(
      installGermany({
        ...options,
        download: async () => {
          throw Error("Download unterbrochen");
        },
      }),
    ).rejects.toThrow("unterbrochen");
    const bytes = contents();
    await installGermany({
      ...options,
      download: async () => {
        steps.push("download");
      },
    });
    expect(contents()).toBe(bytes);
    expect(steps).toEqual([
      "scripts/amp-setup.mjs",
      "scripts/amp-setup.mjs",
      "download",
      "scripts/geodata/pipeline.mjs tools",
    ]);
  });
  it("runs diagnosis from an unrelated cwd without project dependencies or build", () => {
    mkdirSync(resolve(app, "scripts"));
    for (const name of [
      "configuration.mjs",
      "installation.mjs",
      "installation-storage.mjs",
      "diagnose.mjs",
    ])
      copyFileSync(resolve("scripts", name), resolve(app, "scripts", name));
    const before = snapshot(base);
    const env = { ...process.env };
    for (const key of [
      "DATA_DIR",
      "GEODATA_DIR",
      "GERMANY_DATA_DIR",
      "GERMANY_GEODATA_DIR",
    ])
      delete env[key];
    const result = spawnSync(
      process.execPath,
      [resolve(app, "scripts/diagnose.mjs")],
      { cwd: base, env, encoding: "utf8", windowsHide: true },
    );
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).build).toBe(false);
    expect(snapshot(base)).toEqual(before);
  });
});
