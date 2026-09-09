import { it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
// Tool scripts are Node-native, also usable before the application exists.
// @ts-expect-error JavaScript tool module
import { clean } from "../scripts/clean.mjs";
// @ts-expect-error JavaScript tool module
import { cachedBuild, fingerprint } from "../scripts/build-cache.mjs";

it("Bereinigung zeigt zuerst eine Vorschau und schützt Daten sowie verknüpfte Ausgaben", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "lv-clean-"));
  try {
    await writeFile(
      resolve(root, "package.json"),
      '{"name":"leitstellen-verbund"}',
    );
    await mkdir(resolve(root, "dist"));
    await writeFile(resolve(root, "dist/index.js"), "generated");
    await clean(root, ["dist"]);
    expect(await readFile(resolve(root, "dist/index.js"), "utf8")).toBe(
      "generated",
    );
    for (const name of ["game.sqlite", ".env", "backup.json"]) {
      await writeFile(resolve(root, "dist", name), "protected");
      await expect(clean(root, ["dist"], true)).rejects.toThrow("Geschützt");
      expect(await readFile(resolve(root, "dist/index.js"), "utf8")).toBe(
        "generated",
      );
      await rm(resolve(root, "dist", name));
    }
    await expect(clean(root, ["../"], true)).rejects.toThrow(
      "Nicht freigegeben",
    );
    await mkdir(resolve(root, "data"));
    await symlink(
      resolve(root, "data"),
      resolve(root, "dist/link"),
      "junction",
    );
    await expect(clean(root, ["dist"], true)).rejects.toThrow("Verknüpft");
    await rm(resolve(root, "dist/link"));
    await clean(root, ["dist"], true);
    await expect(
      readFile(resolve(root, "dist/index.js")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("inkrementelle Artefakte sind an Eingaben gebunden und beschädigte/zusätzliche Ausgaben werden neu gebaut", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "lv-build-cache-"));
  try {
    await mkdir(resolve(root, "out"));
    await writeFile(resolve(root, "input.ts"), "first");
    let builds = 0;
    const run = async () => {
      builds++;
      await writeFile(resolve(root, "out/index.js"), String(builds));
    };
    const build = async (suffix = "") =>
      cachedBuild({
        root,
        name: "test",
        key: (await fingerprint(root, ["input.ts"])) + suffix,
        outputs: ["out"],
        reuse: true,
        run,
      });
    expect(await build()).toBe("built");
    expect(await build()).toBe("verified-cache");
    await writeFile(resolve(root, "input.ts"), "changed");
    expect(await build()).toBe("built");
    await writeFile(resolve(root, "out/index.js"), "tampered");
    expect(await build()).toBe("built");
    await writeFile(resolve(root, "out/extra.js"), "extra");
    expect(await build()).toBe("built");
    await rm(resolve(root, "out/index.js"));
    expect(await build()).toBe("built");
    expect(await build("different-toolchain")).toBe("built");
    expect(builds).toBe(6);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
