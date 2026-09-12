import { gunzipSync } from "node:zlib";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  lstatSync,
  writeFileSync,
  symlinkSync,
  readlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { hash, safePath, within } from "./files.mjs";

function name(value) {
  const path = value.replace(/^\.\//, "").replace(/\/$/, "");
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes(":") ||
    path.split("/").some((p) => !p || p === "." || p === "..") ||
    /[\x00-\x1f]/.test(path)
  )
    throw Error("Unsicherer Archivpfad.");
  return path;
}
// Restricted tar subset: regular files, directories and internal dependency links.
// Validate the entire archive before writing a single entry. No external tar extraction.
export function unpack(bytes, destination) {
  const tar = gunzipSync(bytes, { maxOutputLength: 768 * 1024 * 1024 });
  let cursor = 0,
    longName;
  const entries = [],
    seen = new Set();
  const string = (b) => b.toString("utf8").replace(/\0.*$/s, "");
  while (cursor + 512 <= tar.length) {
    const h = tar.subarray(cursor, cursor + 512);
    cursor += 512;
    if (h.every((b) => b === 0)) break;
    const octal = (b) => {
      const t = string(b).trim();
      if (!/^[0-7]+$/.test(t)) throw Error("Ungültiger TAR-Kopf.");
      return parseInt(t, 8);
    };
    const sum = octal(h.subarray(148, 156));
    if (h.reduce((n, b, j) => n + (j >= 148 && j < 156 ? 32 : b), 0) !== sum)
      throw Error("Archivkopf beschädigt.");
    const size = octal(h.subarray(124, 136)),
      type = String.fromCharCode(h[156] || 48);
    if (size > 256 * 1024 * 1024 || cursor + size > tar.length)
      throw Error("Archiv unvollständig oder Datei zu groß.");
    const data = tar.subarray(cursor, cursor + size);
    cursor += Math.ceil(size / 512) * 512;
    if (type === "L") {
      if (longName || size > 4096) throw Error("Ungültiger Langname.");
      longName = string(data);
      continue;
    }
    if (!["0", "5", "2"].includes(type))
      throw Error(
        "Verknüpfungen und Sonderdateien sind im Laufzeitpaket verboten.",
      );
    const raw = longName || string(h.subarray(0, 100));
    longName = undefined;
    if (raw === "./" && type === "5") continue;
    const path = name(raw);
    if (seen.has(path)) throw Error("Doppelter Archivpfad.");
    seen.add(path);
    const link = type === "2" ? string(h.subarray(157, 257)) : undefined;
    if (
      link &&
      (!path.startsWith("node_modules/") ||
        link.startsWith("/") ||
        link.includes("\\") ||
        link.includes(":") ||
        !within(
          resolve(destination, "node_modules"),
          resolve(destination, path, "..", link),
        ))
    )
      throw Error("Symlink-Ausbruch im Paket.");
    entries.push({
      path,
      type,
      data,
      link,
      mode: octal(h.subarray(100, 108)) & 0o111 ? 0o700 : 0o600,
    });
  }
  if (longName || !entries.length) throw Error("Archiv unvollständig.");
  if (existsSync(destination) && readdirSync(destination).length)
    throw Error("Paket darf nur in einen leeren Ordner entpackt werden.");
  const types = new Map(entries.map((e) => [e.path, e.type]));
  for (const e of entries)
    for (const parent of e.path
      .split("/")
      .slice(0, -1)
      .map((_, n) =>
        e.path
          .split("/")
          .slice(0, n + 1)
          .join("/"),
      ))
      if (types.has(parent) && types.get(parent) !== "5")
        throw Error("Datei als Archivverzeichnis.");
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  for (const e of entries) {
    const file = safePath(destination, resolve(destination, e.path));
    if (e.type === "5") mkdirSync(file, { recursive: true, mode: 0o700 });
    else if (e.type !== "2") {
      mkdirSync(resolve(file, ".."), { recursive: true, mode: 0o700 });
      writeFileSync(file, e.data, { flag: "wx", mode: e.mode });
    }
  }
  for (const e of entries.filter((e) => e.type === "2")) {
    const file = safePath(destination, resolve(destination, e.path));
    if (!existsSync(resolve(file, "..", e.link)))
      throw Error("Symlinkziel fehlt.");
    symlinkSync(e.link, file);
  }
  return verifyPackage(destination);
}
export function verifyPackage(root) {
  const manifest = JSON.parse(
    readFileSync(resolve(root, "release.json"), "utf8"),
  );
  if (
    manifest.format !== 2 ||
    manifest.product !== "germany-1" ||
    manifest.node !== "24.x" ||
    manifest.platform !== "linux-x64" ||
    !/^[a-f0-9]{40}$/.test(manifest.commit) ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version)
  )
    throw Error("Unpassendes Runtime-Manifest.");
  const expected = new Map(manifest.files.map((f) => [name(f.path), f]));
  if (expected.size !== manifest.files.length)
    throw Error("Doppelter Manifestpfad.");
  const actual = [];
  function scan(dir, prefix = "") {
    for (const n of readdirSync(dir)) {
      const p = resolve(dir, n),
        s = lstatSync(p),
        rel = prefix + n;
      if (s.isSymbolicLink()) {
        const target = readlinkSync(p);
        if (
          !rel.startsWith("node_modules/") ||
          target.includes(":") ||
          target.includes("\\") ||
          !within(resolve(root, "node_modules"), resolve(p, "..", target))
        )
          throw Error("Verknüpfung außerhalb der Laufzeitabhängigkeiten.");
        actual.push(rel);
      } else if (s.isDirectory()) scan(p, rel + "/");
      else if (s.isFile()) actual.push(rel);
      else throw Error("Sonderdatei im Laufzeitpaket.");
    }
  }
  scan(root);
  for (const p of actual.filter((p) => p !== "release.json")) {
    const entry = expected.get(p);
    if (
      !entry ||
      (entry.link
        ? readlinkSync(resolve(root, p)) !== entry.link
        : hash(readFileSync(resolve(root, p))) !== entry.sha256)
    )
      throw Error("Paketdatei fehlt im Manifest oder Prüfsumme falsch: " + p);
    expected.delete(p);
    if (
      /(^|\/)(?:\.git|tests|test-results|playwright-report|coverage|\.env|game\.sqlite)(\/|$)|\.map$/.test(
        p,
      ) ||
      (p.startsWith("docs/") && p !== "docs/LIZENZEN.md")
    )
      throw Error("Entwicklungs- oder Privatdatei im Paket: " + p);
  }
  if (expected.size) throw Error("Paketdateien fehlen.");
  return manifest;
}
