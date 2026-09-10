import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

/** Only the isolated acceptance test downloads Caddy. The game never installs/reconfigures a proxy. */
export async function caddyBinary(root = resolve(".tools/caddy-2.11.4")) {
  if (process.arch !== "x64" || !["linux", "win32"].includes(process.platform))
    throw Error("Caddy acceptance supports Linux/Windows x64.");
  const windows = process.platform === "win32";
  const name = `caddy_2.11.4_${windows ? "windows_amd64.zip" : "linux_amd64.tar.gz"}`;
  const expected = windows
    ? "1708333f79e274c7697285afe6d592ab39314e0b131e9ec6bea08ad27df62ebf"
    : "527fbf917c39189a1e3b31d34fa955601680b2d5c8055d2a87b8b9588dec7bb9";
  await mkdir(root, { recursive: true });
  const archive = resolve(root, name);
  if (!existsSync(archive)) {
    const response = await fetch(
      `https://github.com/caddyserver/caddy/releases/download/v2.11.4/${name}`,
    );
    if (!response.ok) throw Error(`Caddy test download: ${response.status}`);
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  }
  if (
    createHash("sha256")
      .update(await readFile(archive))
      .digest("hex") !== expected
  )
    throw Error("Caddy test archive SHA256 mismatch.");
  execFileSync(windows ? "tar.exe" : "tar", ["-xf", archive, "-C", root], {
    windowsHide: true,
  });
  const binary = resolve(root, windows ? "caddy.exe" : "caddy");
  if (
    !execFileSync(binary, ["version"], {
      encoding: "utf8",
      windowsHide: true,
    }).startsWith("v2.11.4")
  )
    throw Error("Caddy test version mismatch.");
  return binary;
}
