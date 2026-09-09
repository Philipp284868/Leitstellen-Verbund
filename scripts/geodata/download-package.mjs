import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { hostname } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";

const defaultManifest = fileURLToPath(
  new URL("./download-manifest.json", import.meta.url),
);
const hashPattern = /^[a-f0-9]{64}$/;
const allowedFiles =
  /^(manifest\.json|maps\.mbtiles|index\.sqlite|boundary\.geojson|source-manifest\.json|graph-source\.json|graphhopper\.yml|dem\.mbtiles|dem-manifest\.json|dem-source-manifest\.json|dem-license\.pdf|dem-NOTICE\.txt|validation\.json|graph-cache\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)$/;
const within = (parent, child) => {
  const path = relative(parent, child);
  return (
    !path || !(path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path))
  );
};
async function info(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}
async function safePath(path) {
  const entry = await info(path);
  if (entry?.isSymbolicLink())
    throw Error(`Symbolischer Link im Installationspfad: ${path}`);
  const parent = dirname(path);
  if (parent !== path) await safePath(parent);
  return entry;
}
async function canonical(path) {
  if (await info(path)) return realpath(path);
  const parent = dirname(path);
  return resolve(await canonical(parent), basename(path));
}
function catalogCheck(catalog) {
  const positive = (n, max) => Number.isSafeInteger(n) && n > 0 && n <= max;
  if (
    catalog?.schema !== 1 ||
    catalog.worldId !== "germany-1" ||
    !hashPattern.test(catalog.dataset) ||
    !/^germany-data-\d{4}-\d{2}-\d{2}-v\d+$/.test(catalog.releaseTag) ||
    catalog.baseUrl !==
      `https://github.com/Philipp284868/Leitstellen-Verbund/releases/download/${catalog.releaseTag}` ||
    catalog.compression !== "gzip" ||
    !positive(catalog.chunkBytes, 268435456) ||
    !Array.isArray(catalog.files) ||
    !catalog.files.length ||
    catalog.files.length > 128
  )
    throw Error(
      "Ungültiger Deutschland-Downloadkatalog oder Download-Ursprung.",
    );
  const paths = new Set(),
    assets = new Set();
  let total = 0;
  for (const file of catalog.files) {
    if (
      typeof file.path !== "string" ||
      !allowedFiles.test(file.path) ||
      paths.has(file.path.toLowerCase()) ||
      !positive(file.bytes, 40 * 1024 ** 3) ||
      !hashPattern.test(file.sha256) ||
      !Array.isArray(file.parts) ||
      !file.parts.length
    )
      throw Error(
        "Ungültiger Dateipfad, doppelte Datei oder Dateiprüfsumme im Downloadkatalog.",
      );
    paths.add(file.path.toLowerCase());
    let bytes = 0;
    for (const part of file.parts) {
      if (
        typeof part.asset !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,179}\.gz$/.test(part.asset) ||
        assets.has(part.asset.toLowerCase()) ||
        !positive(part.bytes, 300 * 1024 ** 2) ||
        !positive(part.rawBytes, catalog.chunkBytes) ||
        !hashPattern.test(part.sha256)
      )
        throw Error("Ungültiges oder doppeltes Downloadteil im Katalog.");
      assets.add(part.asset.toLowerCase());
      bytes += part.rawBytes;
    }
    if (bytes !== file.bytes)
      throw Error("Dateigrößen im Downloadkatalog widersprechen sich.");
    total += bytes;
  }
  if (
    !paths.has("manifest.json") ||
    total > 40 * 1024 ** 3 ||
    assets.size > 1000
  )
    throw Error("Unvollständiger oder zu großer Downloadkatalog.");
}
async function matches(path, expected) {
  const entry = await safePath(path);
  if (!entry) return false;
  if (!entry.isFile()) throw Error(`Reguläre Datei erforderlich: ${path}`);
  if (entry.size !== expected.bytes) return false;
  const hash = createHash("sha256");
  for await (const buffer of createReadStream(path)) hash.update(buffer);
  return hash.digest("hex") === expected.sha256;
}
function ready(bytes, catalog) {
  const manifest = JSON.parse(bytes);
  if (
    manifest.schema !== 1 ||
    manifest.status !== "ready" ||
    manifest.worldId !== catalog.worldId ||
    manifest.dataset !== catalog.dataset
  )
    throw Error(
      "Deutschland-Paket ist nicht vollständig freigegeben oder gehört zu einem anderen Datenstand.",
    );
}
async function directory(path) {
  const entry = await safePath(path);
  if (entry && !entry.isDirectory())
    throw Error(`Verzeichnis erforderlich: ${path}`);
  await mkdir(path, { recursive: true });
}
async function removeFile(path) {
  const entry = await safePath(path);
  if (entry) {
    if (!entry.isFile())
      throw Error(`Fremder Eintrag im Installationsbereich: ${path}`);
    await unlink(path);
  }
}
async function acquireLock(path) {
  await safePath(path);
  const value = JSON.stringify({ pid: process.pid, hostname: hostname() });
  try {
    await writeFile(path, value, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    // Serialize stale-lock recovery separately. Without this guard, two
    // starters can both observe the old dead PID and one can unlink the
    // already-replaced live lock of the other starter.
    const recovery = path + ".recovery";
    await safePath(recovery);
    try {
      await writeFile(recovery, value, { flag: "wx" });
    } catch (guardError) {
      if (guardError.code !== "EEXIST") throw guardError;
      throw Error(
        "Die Installationssperre wird bereits geprüft oder eine frühere Sperrenprüfung wurde unterbrochen. Laufende Installer prüfen; eine unbekannte Wiederherstellungssperre wird nicht automatisch entfernt.",
      );
    }
    try {
      // Re-read only after obtaining the guard. Another installer may already
      // have completed or taken over between the original EEXIST and now.
      const current = await safePath(path);
      if (current) {
        if (!current.isFile())
          throw Error("Installationssperre ist keine reguläre Datei.");
        const previous = JSON.parse(await readFile(path, "utf8"));
        if (
          previous.hostname !== hostname() ||
          !Number.isInteger(previous.pid) ||
          previous.pid <= 0
        )
          throw Error(
            "Installationssperre kann nicht sicher übernommen werden.",
          );
        try {
          process.kill(previous.pid, 0);
          throw Error("Eine andere Deutschland-Installation läuft bereits.");
        } catch (check) {
          if (check.code !== "ESRCH") throw check;
        }
        await unlink(path);
      }
      await writeFile(path, value, { flag: "wx" });
    } finally {
      if ((await readFile(recovery, "utf8")) === value) await unlink(recovery);
    }
  }
  return async () => {
    if ((await readFile(path, "utf8")) === value) await unlink(path);
  };
}
async function download(part, path, catalog, fetchImpl) {
  if (await matches(path, part)) return;
  const partial = path + ".part";
  await removeFile(partial);
  const response = await fetchImpl(`${catalog.baseUrl}/${part.asset}`, {
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  if (!response.ok || !response.body)
    throw Error(
      `GitHub-Download fehlgeschlagen: ${part.asset} (HTTP ${response.status}). Setup erneut starten, um fortzusetzen.`,
    );
  if (response.url) {
    const url = new URL(response.url);
    if (
      url.protocol !== "https:" ||
      ![
        "github.com",
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com",
      ].includes(url.hostname)
    ) {
      await response.body.cancel();
      throw Error("Unerwartete Download-Weiterleitung.");
    }
  }
  const length = response.headers.get("content-length");
  if (length !== null && Number(length) !== part.bytes) {
    await response.body.cancel();
    throw Error(`Falsche Downloadgröße: ${part.asset}`);
  }
  let bytes = 0;
  const hash = createHash("sha256");
  await pipeline(
    Readable.fromWeb(response.body),
    new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > part.bytes)
          return callback(
            Error(`Download überschreitet freigegebene Größe: ${part.asset}`),
          );
        hash.update(chunk);
        callback(null, chunk);
      },
    }),
    createWriteStream(partial, { flags: "wx" }),
  );
  if (bytes !== part.bytes || hash.digest("hex") !== part.sha256)
    throw Error(`Download-Prüfsumme oder Dateigröße falsch: ${part.asset}`);
  await removeFile(path);
  await rename(partial, path);
}

/** Only a complete, hash-verified runtime dataset becomes visible at target. */
export async function installGeodata({
  target,
  programRoot = fileURLToPath(new URL("../../", import.meta.url)),
  manifestPath = defaultManifest,
  onProgress = console.log,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!target || typeof target !== "string")
    throw Error("Geodaten-Zielverzeichnis fehlt.");
  const catalogBytes = await readFile(manifestPath);
  const catalog = JSON.parse(catalogBytes);
  catalogCheck(catalog);
  const catalogSha256 = createHash("sha256").update(catalogBytes).digest("hex");
  target = resolve(programRoot, target);
  await safePath(target);
  programRoot = await canonical(resolve(programRoot));
  target = await canonical(target);
  if (within(programRoot, target) || within(target, programRoot))
    throw Error("Geodaten müssen außerhalb des Programmverzeichnisses liegen.");
  const existing = await info(target);
  if (existing && !existing.isDirectory())
    throw Error("Geodatenpfad muss ein Verzeichnis sein.");
  if (existing && (await readdir(target)).length) {
    onProgress("Vorhandene Deutschland-Geodaten werden vollständig geprüft …");
    try {
      await safePath(resolve(target, "manifest.json"));
      ready(await readFile(resolve(target, "manifest.json"), "utf8"), catalog);
      for (const file of catalog.files)
        if (!(await matches(resolve(target, file.path), file)))
          throw Error(`Prüfsumme stimmt nicht: ${file.path}`);
    } catch (error) {
      throw Error(
        `Vorhandener Datenordner bleibt unverändert. ${error.message}`,
      );
    }
    onProgress(
      "Deutschland-Geodaten bereits vollständig und geprüft; kein erneuter Download.",
    );
    return { target, dataset: catalog.dataset, reused: true };
  }
  const stage = resolve(
    dirname(target),
    `.${basename(target)}.install-${catalog.dataset.slice(0, 12)}`,
  );
  const receiptFile = resolve(stage, "receipt.json");
  const receipt = JSON.stringify({
    schema: 1,
    target,
    dataset: catalog.dataset,
    catalogSha256,
  });
  const previous = await safePath(stage);
  if (!previous) {
    await mkdir(stage, { recursive: true });
    await writeFile(receiptFile, receipt, { flag: "wx" });
  } else if (
    !previous.isDirectory() ||
    (await safePath(receiptFile))?.isFile() !== true ||
    (await readFile(receiptFile, "utf8")) !== receipt
  ) {
    throw Error(
      "Vorhandenes temporäres Verzeichnis gehört nicht zu dieser Installation.",
    );
  }
  const unlock = await acquireLock(resolve(stage, "lock.json"));
  try {
    const content = resolve(stage, "content"),
      chunks = resolve(stage, "chunks");
    await directory(content);
    await directory(chunks);
    const files = [...catalog.files].sort(
      (a, b) =>
        Number(a.path === "manifest.json") - Number(b.path === "manifest.json"),
    );
    for (const [index, file] of files.entries()) {
      onProgress(
        `Deutschland ${index + 1}/${files.length}: ${file.path} (${(file.bytes / 1024 ** 2).toFixed(1)} MiB)`,
      );
      const output = resolve(content, file.path);
      if (await matches(output, file)) continue;
      await directory(dirname(output));
      const partial = output + ".part";
      await removeFile(partial);
      const hash = createHash("sha256");
      let bytes = 0;
      for (const [partIndex, part] of file.parts.entries()) {
        const cached = resolve(chunks, part.asset);
        onProgress(
          `  Downloadteil ${partIndex + 1}/${file.parts.length}: ${part.asset}`,
        );
        await download(part, cached, catalog, fetchImpl);
        let rawBytes = 0;
        await pipeline(
          createReadStream(cached),
          createGunzip(),
          new Transform({
            transform(chunk, _encoding, callback) {
              rawBytes += chunk.length;
              bytes += chunk.length;
              if (rawBytes > part.rawBytes || bytes > file.bytes)
                return callback(
                  Error("Entpackte Datei überschreitet freigegebene Größe."),
                );
              hash.update(chunk);
              callback(null, chunk);
            },
          }),
          createWriteStream(partial, { flags: partIndex === 0 ? "wx" : "a" }),
        );
        if (rawBytes !== part.rawBytes)
          throw Error(`Entpackte Teilgröße falsch: ${part.asset}`);
      }
      if (bytes !== file.bytes || hash.digest("hex") !== file.sha256)
        throw Error(`Entpackte Datei-Prüfsumme falsch: ${file.path}`);
      await removeFile(output);
      await rename(partial, output);
      for (const part of file.parts)
        await removeFile(resolve(chunks, part.asset));
    }
    ready(await readFile(resolve(content, "manifest.json"), "utf8"), catalog);
    // Recheck before publication; never replace a populated or redirected target.
    const destination = await safePath(target);
    if (destination) {
      if (!destination.isDirectory() || (await readdir(target)).length)
        throw Error("Zielordner wurde während der Installation verändert.");
      await rmdir(target);
    }
    await rename(content, target);
    onProgress(
      "Deutschland-Geodaten vollständig heruntergeladen, entpackt und geprüft.",
    );
    return { target, dataset: catalog.dataset, reused: false };
  } finally {
    await unlock();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await installGeodata({ target: process.env.GEODATA_DIR });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
