/** Integration checks against the actual completed national dataset and local routing server. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const root = resolve(
  process.env.GEODATA_DIR || join(repo, "../leitstellen-deutschland-geodata"),
);
const origin = process.env.GRAPHHOPPER_URL || "http://127.0.0.1:8989";
const adapterBuild = await build({
  entryPoints: [join(repo, "src/germany/route.ts")],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  target: "node24",
  logLevel: "silent",
});
const { adaptGraphHopperRoute, graphHopperRequest } = await import(
  `data:text/javascript;base64,${Buffer.from(adapterBuild.outputFiles[0].contents).toString("base64")}`
);
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname),
  "Validation only calls the locally operated routing service.",
);
const manifest = JSON.parse(
  await readFile(join(root, "manifest.json"), "utf8"),
);
assert.equal(manifest.status, "ready");
assert.equal(manifest.worldId, "germany-1");
assert.equal(
  manifest.dataset,
  "155596c0041a76f05d3b5fb03a36f2b9e26540b517fde8b4b9884c62c4fc1a90",
);
const index = new DatabaseSync(join(root, "index.sqlite"), { readOnly: true });
const maps = new DatabaseSync(join(root, "maps.mbtiles"), { readOnly: true });
assert.equal(
  index.prepare("SELECT value FROM metadata WHERE key='source_sha256'").get()
    .value,
  manifest.dataset,
);
assert.equal(
  maps.prepare("SELECT value FROM metadata WHERE name='source_sha256'").get()
    .value,
  manifest.dataset,
);
const settlements = [
  ["Berlin", 13.405, 52.52],
  ["Hamburg", 9.993, 53.551],
  ["München", 11.582, 48.135],
  ["Köln", 6.96, 50.938],
  ["Dresden", 13.737, 51.05],
  ["Kiel", 10.123, 54.323],
  ["Saarbrücken", 6.997, 49.233],
  ["Konstanz", 9.175, 47.663],
  ["Flensburg", 9.437, 54.793],
];
// Verified through GermanyProvider against this pinned PBF; place labels are not driving locations.
const drivingAnchors = {
  Berlin: 1827996421,
  Hamburg: 34022710,
  München: 616684899,
  Köln: 74948541,
  Dresden: 13256253723,
};
function tileAt(lon, lat, z) {
  const count = 2 ** z,
    x = Math.floor(((lon + 180) / 360) * count);
  const rad = (lat * Math.PI) / 180,
    y = Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * count);
  return maps
    .prepare(
      "SELECT length(tile_data) bytes FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?",
    )
    .get(z, x, count - 1 - y);
}
const found = [];
for (const [name, lon, lat] of settlements) {
  const place = index
    .prepare(
      "SELECT name,lon,lat,kind FROM places WHERE name=? COLLATE NOCASE AND kind IN ('city','town') AND abs(lon-?)<0.15 AND abs(lat-?)<0.15 LIMIT 1",
    )
    .get(name, lon, lat);
  assert.ok(
    place,
    `${name} must exist at its actual location in the OSM-derived index.`,
  );
  for (const z of [6, 10, 14])
    assert.ok(
      tileAt(lon, lat, z)?.bytes > 0,
      `${name}: map tile z${z} missing.`,
    );
  const routeAnchor =
    drivingAnchors[name] === undefined
      ? undefined
      : index
          .prepare("SELECT id,name,lon,lat,road_class FROM anchors WHERE id=?")
          .get(drivingAnchors[name]);
  if (drivingAnchors[name] !== undefined) {
    assert.ok(routeAnchor, `${name}: verified provider anchor missing.`);
    assert.ok(
      Math.abs(routeAnchor.lon - lon) < 0.03 &&
        Math.abs(routeAnchor.lat - lat) < 0.02,
      `${name}: verified driving anchor is outside its known city area.`,
    );
  }
  found.push({ ...place, routeAnchor });
}
assert.ok(index.prepare("SELECT count(*) n FROM anchors").get().n > 1_000_000);
assert.ok(
  index.prepare("SELECT count(*) n FROM places WHERE kind='village'").get().n >
    1_000,
);
assert.ok(
  index.prepare("SELECT count(*) n FROM places WHERE kind='hospital'").get().n >
    100,
);
const routes = [];
for (const [from, to, minKm, maxKm] of [
  ["Berlin", "Hamburg", 250, 400],
  ["Berlin", "München", 500, 800],
  ["Köln", "Dresden", 500, 750],
]) {
  const a = found.find((p) => p.name === from),
    b = found.find((p) => p.name === to),
    started = performance.now();
  const response = await fetch(`${origin}/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(graphHopperRequest(a.routeAnchor, b.routeAnchor, 90)),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json();
  assert.ok(response.ok, `${from}–${to}: ${JSON.stringify(payload)}`);
  const path = payload.paths[0];
  assert.ok(
    path.distance > minKm * 1000 && path.distance < maxKm * 1000,
    `${from}–${to}: road distance outside plausible range.`,
  );
  assert.ok(path.points.coordinates.length > 100);
  assert.ok(path.details.edge_id.length > 20 && path.details.time.length > 20);
  assert.ok(
    path.details.road_class.some(
      (segment) => segment[2] === "motorway" || segment[2] === "MOTORWAY",
    ),
  );
  const adapted = adaptGraphHopperRoute(payload, manifest.dataset, 90);
  assert.ok(adapted.legs.every((leg) => leg.limit > 0 && leg.limit <= 90));
  const vehicleSeconds = adapted.legs.reduce(
    (sum, leg) => sum + leg.meters / (leg.limit / 3.6) + leg.waitSeconds,
    0,
  );
  assert.ok(
    vehicleSeconds >= (path.distance / (90 / 3.6)) * 0.99,
    "Actual game adapter ETA must honor vehicle speed cap on every road segment.",
  );
  routes.push({
    from,
    to,
    meters: path.distance,
    milliseconds: path.time,
    vehicleMaximumKmh: 90,
    vehicleSeconds: Math.round(vehicleSeconds),
    vertices: path.points.coordinates.length,
    calculationMs: Math.round(performance.now() - started),
  });
}
const report = {
  checkedAt: new Date().toISOString(),
  dataset: manifest.dataset,
  settlements: found,
  routes,
  anchorCount: index.prepare("SELECT count(*) n FROM anchors").get().n,
  placeCount: index.prepare("SELECT count(*) n FROM places").get().n,
  tileCount: manifest.tileCount,
};
index.close();
maps.close();
await writeFile(
  join(root, "validation.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
