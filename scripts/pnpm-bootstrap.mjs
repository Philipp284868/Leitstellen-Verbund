import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, rename, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { assertBuildPaths } from "./build/build-paths.mjs";

// Registry integrity verified when updating the pinned package manager. A local
// cache cannot replace this expected digest with its own claim.
export const PNPM_PIN = {
  version: "11.19.0",
  integrity:
    "sha512-eIHz7VkNRyxKlV4riLISF5ERYGbcyIy8o4SeybYPG7qm0syyIfqR2k4cZb7yvL43k2Wup6xTnHv4be3DobItzg==",
};
export async function bootstrapPnpm(
  root,
  download = async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok)
      throw Error(`Paketmanager-Download: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  },
) {
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  if (pkg.packageManager !== `pnpm@${PNPM_PIN.version}`)
    throw Error(
      "Paketmanager-Version und geprüfter Integritätspin widersprechen sich.",
    );
  const dir = resolve(root, ".tools", `pnpm-${PNPM_PIN.version}`),
    archive = resolve(dir, "pnpm.tgz");
  await assertBuildPaths(root, [dir]);
  await mkdir(dir, { recursive: true });
  const matches = (bytes) =>
    `sha512-${createHash("sha512").update(bytes).digest("base64")}` ===
    PNPM_PIN.integrity;
  let bytes;
  let downloaded = false,
    repaired = 0;
  try {
    if (!(await lstat(archive)).isFile())
      throw Error("Paketmanagerarchiv muss reguläre Datei sein.");
    bytes = await readFile(archive);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (!bytes || !matches(bytes)) {
    bytes = await download(
      `https://registry.npmjs.org/pnpm/-/pnpm-${PNPM_PIN.version}.tgz`,
    );
    if (!matches(bytes)) throw Error("pnpm-Paketintegrität fehlgeschlagen.");
    await writeFile(archive + ".part", bytes);
    await rename(archive + ".part", archive);
    downloaded = true;
  }
  const tar = gunzipSync(bytes);
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, ""),
      size =
        parseInt(
          header.subarray(124, 136).toString().replace(/\0.*$/, "").trim(),
          8,
        ) || 0,
      type = header[156];
    if (
      size < 0 ||
      !Number.isSafeInteger(size) ||
      offset + 512 + size > tar.length
    )
      throw Error("Ungültige Paketmanager-Archivlänge.");
    if (name.startsWith("package/") && (type === 0 || type === 48)) {
      const relative = name.slice(8);
      if (
        relative.split("/").some((p) => p === "..") ||
        relative.startsWith("/") ||
        relative.includes("\\")
      )
        throw Error("Unsicherer Paketmanager-Archivpfad.");
      const path = resolve(dir, relative),
        expected = tar.subarray(offset + 512, offset + 512 + size);
      await assertBuildPaths(root, [path]);
      let existing;
      try {
        if (!(await lstat(path)).isFile())
          throw Error("Paketmanagerdatei muss regulär sein.");
        existing = await readFile(path);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      if (!existing?.equals(expected)) {
        await mkdir(resolve(path, ".."), { recursive: true });
        await writeFile(path, expected);
        repaired++;
      }
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return {
    file: resolve(dir, "bin/pnpm.cjs"),
    version: PNPM_PIN.version,
    downloaded,
    repaired,
  };
}
