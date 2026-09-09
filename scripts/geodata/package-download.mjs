/** Publishable, resumable Germany data chunks. This never reads or packages game saves. */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGunzip, createGzip } from "node:zlib";

const script = fileURLToPath(import.meta.url);
const repo = resolve(dirname(script), "../..");
export const DATASET =
  "155596c0041a76f05d3b5fb03a36f2b9e26540b517fde8b4b9884c62c4fc1a90";
export const RELEASE_TAG = "germany-data-2026-09-07-v1";
const MAX_CHUNK_BYTES = 256 * 1024 * 1024;
const GRAPH_FILES = [
  "edgekv_keys",
  "edgekv_vals",
  "edges",
  "geometry",
  "landmarks_car",
  "landmarks_subnetwork_car",
  "location_index",
  "nodes",
  "properties",
  "properties.txt",
  "turn_costs",
];
const META_FILES = [
  "manifest.json",
  "source-manifest.json",
  "graph-source.json",
  "graphhopper.yml",
  "dem-manifest.json",
  "dem-license.pdf",
  "dem-NOTICE.txt",
];
const hash = () => createHash("sha256");
const inside = (parent, child) => {
  const path = relative(parent, child);
  return (
    path === "" ||
    !(path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path))
  );
};
async function optionalRead(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
async function realPath(path, allowMissing = false) {
  const parent = dirname(path);
  if (parent !== path) await realPath(parent, allowMissing);
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") return;
    throw error;
  }
  if (info.isSymbolicLink())
    throw Error(`Verknüpfungen sind nicht erlaubt: ${path}`);
  return info;
}
function observer(onChunk) {
  return new Transform({
    transform(chunk, _encoding, done) {
      try {
        onChunk(chunk);
        done(null, chunk);
      } catch (error) {
        done(error);
      }
    },
  });
}
function discard() {
  return new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
}
async function atomicJson(path, value) {
  await realPath(path, true);
  const temporary = `${path}.partial-${process.pid}`;
  await realPath(temporary, true);
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
  try {
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
async function checkedReuse(path, receipt, rawBytes, rawSha256) {
  if (
    !receipt ||
    receipt.rawBytes !== rawBytes ||
    receipt.rawSha256 !== rawSha256
  )
    return null;
  const info = await realPath(path, true);
  if (!info?.isFile() || info.size !== receipt.bytes) return null;
  const compressed = hash(),
    raw = hash();
  let count = 0,
    compressedBytes = 0,
    gzipOS;
  try {
    await pipeline(
      createReadStream(path),
      observer((chunk) => {
        if (compressedBytes <= 9 && compressedBytes + chunk.length > 9)
          gzipOS = chunk[9 - compressedBytes];
        compressedBytes += chunk.length;
        compressed.update(chunk);
      }),
      createGunzip(),
      observer((chunk) => {
        count += chunk.length;
        if (count > rawBytes)
          throw Error("Gzip-Teil überschreitet seine freigegebene Größe.");
        raw.update(chunk);
      }),
      discard(),
    );
    if (
      count !== rawBytes ||
      gzipOS !== 255 ||
      raw.digest("hex") !== rawSha256 ||
      compressed.digest("hex") !== receipt.sha256
    )
      return null;
    return { bytes: info.size, sha256: receipt.sha256, rawBytes };
  } catch {
    return null;
  }
}

/** Validate the controlled, explicit runtime file set before any packaging writes. */
async function sourceFiles(sourceDir) {
  const json = async (name) =>
    JSON.parse(await readFile(join(sourceDir, name), "utf8"));
  for (const name of META_FILES) {
    const info = await realPath(join(sourceDir, name));
    if (!info.isFile() || info.size > 2 * 1024 * 1024)
      throw Error(`Ungültige Metadatendatei: ${name}`);
  }
  const [manifest, dem, source, graphSource] = await Promise.all([
    json("manifest.json"),
    json("dem-manifest.json"),
    json("source-manifest.json"),
    json("graph-source.json"),
  ]);
  if (
    manifest.schema !== 1 ||
    manifest.status !== "ready" ||
    manifest.worldId !== "germany-1" ||
    manifest.dataset !== DATASET ||
    manifest.snapshot !== "2026-09-07" ||
    dem.schema !== 1 ||
    dem.status !== "ready" ||
    source.worldId !== "germany-1" ||
    source.source?.sha256 !== DATASET ||
    graphSource.dataset !== DATASET ||
    graphSource.graphhopper !== source.tools?.graphhopper?.sha256 ||
    graphSource.configSha256 !==
      hash()
        .update(await readFile(join(sourceDir, "graphhopper.yml")))
        .digest("hex")
  )
    throw Error(
      "Quellen und fertige Deutschland-Manifeste gehören nicht zur gepinnten Freigabe.",
    );
  const artifacts = manifest.artifacts;
  if (
    artifacts?.tiles?.file !== "maps.mbtiles" ||
    artifacts?.index?.file !== "index.sqlite" ||
    artifacts?.boundary?.file !== "boundary.geojson" ||
    artifacts?.graph?.file !== "graph-cache"
  )
    throw Error("Unerwartete Laufzeitdateien im Deutschland-Manifest.");
  const graphFiles = artifacts.graph.files;
  if (
    !Array.isArray(graphFiles) ||
    JSON.stringify(graphFiles.map((item) => item.file)) !==
      JSON.stringify(GRAPH_FILES.map((name) => `graph-cache/${name}`)) ||
    hash().update(JSON.stringify(graphFiles)).digest("hex") !==
      artifacts.graph.sha256 ||
    graphFiles.reduce((sum, item) => sum + item.bytes, 0) !==
      artifacts.graph.bytes
  )
    throw Error(
      "Routingdateien stimmen nicht mit der vollständigen Graph-Freigabe überein.",
    );
  const actualGraph = (await readdir(join(sourceDir, "graph-cache"))).sort();
  if (JSON.stringify(actualGraph) !== JSON.stringify(GRAPH_FILES))
    throw Error(
      "Graph enthält unerwartete Dateien oder aktive Sperren; Routingdienst zuerst beenden.",
    );
  const required = [
    artifacts.tiles,
    artifacts.index,
    artifacts.boundary,
    ...graphFiles,
    { file: "dem.mbtiles", bytes: dem.bytes, sha256: dem.sha256 },
  ];
  const result = [...required, ...META_FILES.map((file) => ({ file }))];
  for (const item of result) {
    const info = await realPath(join(sourceDir, item.file));
    if (
      !info?.isFile() ||
      info.size <= 0 ||
      (item.bytes !== undefined && item.bytes !== info.size) ||
      (item.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(item.sha256))
    )
      throw Error(
        `Freigegebene Datei fehlt oder Größe/Prüfsumme ist ungültig: ${item.file}`,
      );
    item.info = info;
    // Reject modified sources before replacing any previously valid release part.
    // A second hash during packaging still detects changes made after this preflight.
    if (item.sha256) {
      const verified = hash();
      await pipeline(
        createReadStream(join(sourceDir, item.file)),
        observer((chunk) => verified.update(chunk)),
        discard(),
      );
      if (verified.digest("hex") !== item.sha256)
        throw Error(`Freigegebene Quellprüfsumme falsch: ${item.file}`);
    }
  }
  return result;
}

export async function packageDownload({
  sourceDir = process.env.GEODATA_DIR ||
    join(repo, "../leitstellen-deutschland-geodata"),
  outputDir = process.env.GEODATA_DOWNLOAD_DIR ||
    join(repo, "../leitstellen-deutschland-download"),
  catalogFile = join(repo, "scripts/geodata/download-manifest.json"),
  chunkBytes = MAX_CHUNK_BYTES,
  log = console.log,
} = {}) {
  sourceDir = resolve(sourceDir);
  outputDir = resolve(outputDir);
  catalogFile = resolve(catalogFile);
  if (
    !Number.isSafeInteger(chunkBytes) ||
    chunkBytes < 1 ||
    chunkBytes > MAX_CHUNK_BYTES
  )
    throw Error("Teilgröße muss zwischen 1 Byte und 256 MiB liegen.");
  if (
    inside(repo, outputDir) ||
    inside(repo, sourceDir) ||
    inside(outputDir, sourceDir) ||
    inside(sourceDir, outputDir)
  )
    throw Error(
      "Quellen und Downloadpaket benötigen getrennte Verzeichnisse außerhalb des Repositories.",
    );
  await realPath(sourceDir);
  await realPath(outputDir, true);
  await realPath(catalogFile, true);
  const required = await sourceFiles(sourceDir);
  await mkdir(outputDir, { recursive: true });
  await mkdir(dirname(catalogFile), { recursive: true });
  const catalog = {
    schema: 1,
    worldId: "germany-1",
    dataset: DATASET,
    releaseTag: RELEASE_TAG,
    baseUrl: `https://github.com/Philipp284868/Leitstellen-Verbund/releases/download/${RELEASE_TAG}`,
    chunkBytes,
    compression: "gzip",
    files: [],
  };
  for (const [fileIndex, item] of required.entries()) {
    const sourcePath = join(sourceDir, item.file),
      digest = hash();
    const file = {
      path: item.file,
      bytes: item.info.size,
      sha256: "",
      parts: [],
    };
    for (
      let offset = 0, partIndex = 0;
      offset < file.bytes;
      offset += chunkBytes, partIndex++
    ) {
      const rawBytes = Math.min(chunkBytes, file.bytes - offset);
      const asset = `de-${String(fileIndex + 1).padStart(2, "0")}-${item.file.replaceAll("/", "-")}-${String(partIndex + 1).padStart(3, "0")}.gz`;
      const destination = join(outputDir, asset),
        receiptFile = `${destination}.receipt.json`;
      await realPath(destination, true);
      await realPath(receiptFile, true);
      let receipt;
      try {
        receipt = JSON.parse((await optionalRead(receiptFile)) || "null");
      } catch {
        receipt = null;
      }
      let part;
      if (receipt) {
        const raw = hash();
        await pipeline(
          createReadStream(sourcePath, {
            start: offset,
            end: offset + rawBytes - 1,
          }),
          observer((chunk) => {
            digest.update(chunk);
            raw.update(chunk);
          }),
          discard(),
        );
        const rawSha256 = raw.digest("hex");
        part = await checkedReuse(destination, receipt, rawBytes, rawSha256);
      }
      if (!part) {
        const temporary = `${destination}.partial-${process.pid}`;
        await realPath(temporary, true);
        const compressed = hash(),
          raw = hash();
        let bytes = 0;
        try {
          await pipeline(
            createReadStream(sourcePath, {
              start: offset,
              end: offset + rawBytes - 1,
            }),
            observer((chunk) => {
              if (!receipt) digest.update(chunk);
              raw.update(chunk);
            }),
            createGzip({ level: 6, chunkSize: 128 * 1024 }),
            observer((chunk) => {
              // zlib otherwise writes an OS-dependent byte (Windows 10 / Unix 3).
              // Timestamp is already zero; pin the OS marker to RFC 1952 "unknown".
              if (bytes <= 9 && bytes + chunk.length > 9)
                chunk[9 - bytes] = 255;
              bytes += chunk.length;
              compressed.update(chunk);
            }),
            createWriteStream(temporary, { flags: "wx" }),
          );
          part = { bytes, sha256: compressed.digest("hex"), rawBytes };
          if (bytes >= 2 ** 31)
            throw Error("Teil überschreitet die GitHub-Assetgrenze.");
          await rename(temporary, destination);
          await atomicJson(receiptFile, {
            ...part,
            rawSha256: raw.digest("hex"),
          });
        } finally {
          await rm(temporary, { force: true });
        }
      }
      file.parts.push({ asset, ...part });
      log(
        `${asset}: ${(part.bytes / 1024 / 1024).toFixed(1)} MiB, SHA256 ${part.sha256}`,
      );
    }
    file.sha256 = digest.digest("hex");
    const after = await realPath(sourcePath);
    if (
      after.size !== item.info.size ||
      after.mtimeMs !== item.info.mtimeMs ||
      after.ino !== item.info.ino ||
      (item.sha256 && file.sha256 !== item.sha256)
    )
      throw Error(
        `Quelldatei verändert oder freigegebene Prüfsumme falsch: ${item.file}`,
      );
    catalog.files.push(file);
  }
  // No partial catalog is ever installable. Ready manifests themselves remain ordinary pinned files.
  await atomicJson(join(outputDir, "download-manifest.json"), catalog);
  await atomicJson(catalogFile, catalog);
  const totals = catalog.files.reduce(
    (sum, file) => ({
      files: sum.files + 1,
      parts: sum.parts + file.parts.length,
      rawBytes: sum.rawBytes + file.bytes,
      downloadBytes:
        sum.downloadBytes +
        file.parts.reduce((bytes, part) => bytes + part.bytes, 0),
    }),
    { files: 0, parts: 0, rawBytes: 0, downloadBytes: 0 },
  );
  log(JSON.stringify({ status: "ready", ...totals, catalogFile, outputDir }));
  return catalog;
}

if (process.argv[1] && resolve(process.argv[1]) === script) {
  try {
    await packageDownload();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
