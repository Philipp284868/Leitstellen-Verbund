import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const { packageDownload, DATASET } = await import(
  pathToFileURL(resolve("scripts/geodata/package-download.mjs")).href
);
type Artifact = { file: string; bytes: number; sha256: string };
type Part = { asset: string; bytes: number; sha256: string; rawBytes: number };
type Catalog = {
  schema: number;
  worldId: string;
  dataset: string;
  releaseTag: string;
  baseUrl: string;
  chunkBytes: number;
  compression: string;
  files: { path: string; bytes: number; sha256: string; parts: Part[] }[];
};
const chunkBytes = 128;
const digest = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
let base: string, sourceDir: string, outputDir: string, catalogFile: string;
let originals: Map<string, Buffer>;
async function put(file: string, data: string | Buffer): Promise<Artifact> {
  const bytes = Buffer.from(data);
  await writeFile(resolve(sourceDir, file), bytes);
  originals.set(file, bytes);
  return { file, bytes: bytes.length, sha256: digest(bytes) };
}
async function json(file: string, value: unknown) {
  return put(file, JSON.stringify(value));
}
async function pack(
  extra: { outputDir?: string; catalogFile?: string } = {},
): Promise<Catalog> {
  return packageDownload({
    sourceDir,
    outputDir,
    catalogFile,
    chunkBytes,
    log: () => {},
    ...extra,
  });
}
function parts(catalog: Catalog) {
  return catalog.files.flatMap((file) => file.parts);
}
async function checkRoundtrip(catalog: Catalog, directory = outputDir) {
  expect(catalog).toMatchObject({
    schema: 1,
    worldId: "germany-1",
    dataset: DATASET,
    releaseTag: "germany-data-2026-09-07-v1",
    baseUrl:
      "https://github.com/Philipp284868/Leitstellen-Verbund/releases/download/germany-data-2026-09-07-v1",
    chunkBytes,
    compression: "gzip",
  });
  expect(catalog.files).toHaveLength(22);
  expect(new Set(catalog.files.map((file) => file.path))).toEqual(
    new Set(originals.keys()),
  );
  expect(new Set(parts(catalog).map((part) => part.asset)).size).toBe(
    parts(catalog).length,
  );
  for (const file of catalog.files) {
    const rawParts: Buffer[] = [];
    for (const part of file.parts) {
      expect(part.asset).toMatch(/^de-\d+-[a-zA-Z0-9_.-]+-\d+\.gz$/);
      const compressed = await readFile(resolve(directory, part.asset));
      expect(compressed.length).toBe(part.bytes);
      expect(digest(compressed)).toBe(part.sha256);
      expect(part.rawBytes).toBeGreaterThan(0);
      expect(part.rawBytes).toBeLessThanOrEqual(chunkBytes);
      const raw = gunzipSync(compressed);
      expect(raw.length).toBe(part.rawBytes);
      rawParts.push(raw);
    }
    const whole = Buffer.concat(rawParts);
    expect(whole.length).toBe(file.bytes);
    expect(digest(whole)).toBe(file.sha256);
    expect(whole).toEqual(originals.get(file.path));
  }
}
async function assetTimes(catalog: Catalog) {
  return Promise.all(
    parts(catalog).map(
      async (part) => (await stat(resolve(outputDir, part.asset))).mtimeMs,
    ),
  );
}

beforeEach(async () => {
  base = await mkdtemp(resolve(tmpdir(), "lv-germany-package-"));
  sourceDir = resolve(base, "source");
  outputDir = resolve(base, "download");
  catalogFile = resolve(base, "catalog.json");
  originals = new Map();
  await mkdir(resolve(sourceDir, "graph-cache"), { recursive: true });
  const graph: Artifact[] = [];
  for (const name of [
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
  ])
    graph.push(await put(`graph-cache/${name}`, `fixture graph ${name}`));
  const tiles = await put(
    "maps.mbtiles",
    Buffer.from(Array.from({ length: 385 }, (_, i) => (i * 73 + 19) % 256)),
  );
  const index = await put("index.sqlite", "fixture address index ".repeat(25));
  const boundary = await json("boundary.geojson", {
    type: "FeatureCollection",
    features: [],
  });
  const dem = await put("dem.mbtiles", "fixture height data ".repeat(13));
  const config = await put("graphhopper.yml", "fixture routing configuration");
  await json("manifest.json", {
    schema: 1,
    status: "ready",
    worldId: "germany-1",
    dataset: DATASET,
    snapshot: "2026-09-07",
    artifacts: {
      tiles,
      index,
      boundary,
      graph: {
        file: "graph-cache",
        bytes: graph.reduce((sum, file) => sum + file.bytes, 0),
        sha256: digest(JSON.stringify(graph)),
        files: graph,
      },
    },
  });
  await json("source-manifest.json", {
    worldId: "germany-1",
    source: { sha256: DATASET },
    tools: { graphhopper: { sha256: "fixture-tool-digest" } },
  });
  await json("graph-source.json", {
    dataset: DATASET,
    graphhopper: "fixture-tool-digest",
    configSha256: config.sha256,
  });
  await json("dem-manifest.json", {
    schema: 1,
    status: "ready",
    bytes: dem.bytes,
    sha256: dem.sha256,
  });
  await put("dem-license.pdf", "fixture license text");
  await put("dem-NOTICE.txt", "fixture attribution text");
  // Deliberately excluded even if accidentally placed beside the approved data.
  await writeFile(resolve(sourceDir, ".env"), "PRIVATE_VALUE=fixture-secret");
  await writeFile(resolve(sourceDir, "server.sqlite"), "fixture private save");
  await mkdir(resolve(sourceDir, "sources"));
  await writeFile(resolve(sourceDir, "sources/raw.pbf"), "fixture raw source");
});
afterEach(async () => {
  const path = relative(resolve(tmpdir()), base);
  if (!path.startsWith("lv-germany-package-") || path.includes(sep))
    throw Error("Unsicherer Test-Aufräumpfad");
  await rm(base, { recursive: true, force: true });
});

describe("Deutschland-Releasepaket", () => {
  it("überträgt alle 22 freigegebenen Dateien vollständig mit Teil- und Dateiprüfsummen", async () => {
    const catalog = await pack();
    await checkRoundtrip(catalog);
    expect(await readFile(catalogFile)).toEqual(
      await readFile(resolve(outputDir, "download-manifest.json")),
    );
    expect(
      (await readdir(outputDir)).some((name) => name.includes(".partial-")),
    ).toBe(false);
  });

  it("erzeugt portable gzip-Header und bei frischer Wiederholung bytegleiche Assets und Kataloge", async () => {
    const catalog = await pack();
    const secondDir = resolve(base, "second-download");
    const secondCatalog = resolve(base, "second-catalog.json");
    expect(
      await pack({ outputDir: secondDir, catalogFile: secondCatalog }),
    ).toEqual(catalog);
    expect(await readFile(secondCatalog)).toEqual(await readFile(catalogFile));
    for (const part of parts(catalog)) {
      const bytes = await readFile(resolve(outputDir, part.asset));
      expect([...bytes.subarray(0, 8)]).toEqual([31, 139, 8, 0, 0, 0, 0, 0]);
      expect(bytes[9]).toBe(255);
      expect(await readFile(resolve(secondDir, part.asset))).toEqual(bytes);
    }
  });

  it("verifiziert vorhandene Teile bei Wiederaufnahme ohne sie neu zu schreiben", async () => {
    const catalog = await pack();
    const previous = await readFile(catalogFile);
    const oldTime = new Date("2001-01-01T00:00:00Z");
    for (const part of parts(catalog))
      await utimes(resolve(outputDir, part.asset), oldTime, oldTime);
    const times = await assetTimes(catalog);
    expect(await pack()).toEqual(catalog);
    expect(await assetTimes(catalog)).toEqual(times);
    expect(await readFile(catalogFile)).toEqual(previous);
  });

  it("erkennt beschädigte komprimierte Teile und stellt genau die freigegebenen Bytes wieder her", async () => {
    const catalog = await pack();
    const chosen = resolve(outputDir, parts(catalog)[0].asset);
    const bytes = await readFile(chosen);
    const corrupt = Buffer.from(bytes);
    corrupt[corrupt.length - 1] ^= 1;
    await writeFile(chosen, corrupt);
    expect(await pack()).toEqual(catalog);
    expect(await readFile(chosen)).toEqual(bytes);
    await checkRoundtrip(catalog);
  });

  it("baut fehlende Teile nach Abbruch neu und übernimmt keine unvollständige temporäre Datei", async () => {
    const catalog = await pack();
    const chosen = resolve(outputDir, parts(catalog)[1].asset);
    await unlink(chosen);
    const interrupted = `${chosen}.partial-interrupted`;
    await writeFile(interrupted, "unvollständiger Download");
    expect(await pack()).toEqual(catalog);
    await checkRoundtrip(catalog);
    expect(await readFile(interrupted, "utf8")).toBe(
      "unvollständiger Download",
    );
  });

  it("weist gleichlange veränderte Quellen vor Schreibzugriffen zurück und erhält das gültige Paket", async () => {
    const catalog = await pack();
    const previous = await readFile(catalogFile);
    const times = await assetTimes(catalog);
    const corrupt = Buffer.from(originals.get("maps.mbtiles")!);
    corrupt[0] ^= 1;
    await writeFile(resolve(sourceDir, "maps.mbtiles"), corrupt);
    await expect(pack()).rejects.toThrow(/Quellprüfsumme falsch/);
    expect(await readFile(catalogFile)).toEqual(previous);
    expect(
      await readFile(resolve(outputDir, "download-manifest.json")),
    ).toEqual(previous);
    expect(await assetTimes(catalog)).toEqual(times);
    await checkRoundtrip(catalog);
  });
});
