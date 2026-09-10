import { it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
// @ts-expect-error Node bootstrap also runs without project dependencies
import { bootstrapPnpm } from "../scripts/pnpm-bootstrap.mjs";
it("verifiziert den vorhandenen Paketmanager ohne Netzwerk, repariert manipulierte Dateien und erhält .env sowie Spieldaten", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "lv-pnpm-bootstrap-")),
    dir = resolve(root, ".tools/pnpm-11.19.0");
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(
      resolve(root, "package.json"),
      JSON.stringify({ packageManager: "pnpm@11.19.0" }),
    );
    await writeFile(resolve(root, ".env"), "PRIVATE=unchanged");
    await writeFile(resolve(root, "game.sqlite"), "untouched");
    await copyFile(".tools/pnpm-11.19.0/pnpm.tgz", resolve(dir, "pnpm.tgz"));
    const noNetwork = () => {
      throw Error("Unerwarteter Download");
    };
    const first = await bootstrapPnpm(root, noNetwork);
    expect(first.downloaded).toBe(false);
    expect(first.repaired).toBeGreaterThan(0);
    const bytes = await readFile(first.file);
    await writeFile(first.file, "throw Error('tampered');");
    const repaired = await bootstrapPnpm(root, noNetwork);
    expect(repaired.repaired).toBe(1);
    expect(await readFile(first.file)).toEqual(bytes);
    expect((await bootstrapPnpm(root, noNetwork)).repaired).toBe(0);
    const version = spawnSync(process.execPath, [first.file, "--version"], {
      encoding: "utf8",
    });
    expect(version.status, version.stderr).toBe(0);
    expect(version.stdout.trim()).toBe("11.19.0");
    expect(await readFile(resolve(root, ".env"), "utf8")).toBe(
      "PRIVATE=unchanged",
    );
    expect(await readFile(resolve(root, "game.sqlite"), "utf8")).toBe(
      "untouched",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 15000);
it("akzeptiert weder einen falschen Versionseintrag noch manipulierte Downloadbytes", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "lv-pnpm-reject-"));
  try {
    await writeFile(
      resolve(root, "package.json"),
      JSON.stringify({ packageManager: "pnpm@0.0.0" }),
    );
    await expect(bootstrapPnpm(root)).rejects.toThrow("widersprechen");
    await writeFile(
      resolve(root, "package.json"),
      JSON.stringify({ packageManager: "pnpm@11.19.0" }),
    );
    await expect(
      bootstrapPnpm(root, async () => Buffer.from("wrong bytes")),
    ).rejects.toThrow("Paketintegrität");
    await expect(
      readFile(resolve(root, ".tools/pnpm-11.19.0/pnpm.tgz")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
