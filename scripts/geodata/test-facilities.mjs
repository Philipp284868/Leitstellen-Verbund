import { mkdtemp, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { normalizeFacilities } from "./facility-catalog.mjs";
const root = resolve(
  process.env.GEODATA_DIR || "../leitstellen-deutschland-geodata",
);
const folder = (await readdir(join(root, "tools"))).find((n) =>
  n.startsWith("jdk-21.0.12.1"),
);
const java = join(
  root,
  "tools",
  folder,
  "bin",
  process.platform === "win32" ? "java.exe" : "java",
);
const cp = ["graphhopper-web-11.0.jar", "planetiler-0.10.2.jar"]
  .map((n) => join(root, "tools", n))
  .join(process.platform === "win32" ? ";" : ":");
const dir = await mkdtemp(join(tmpdir(), "lv-facility-extract-")),
  input = join(dir, "fixture.osm"),
  output = join(dir, "facilities.ndjson");
const states = "BE BB BW BY HB HE HH MV NI NW RP SH SL SN ST TH".split(" ");
await writeFile(
  input,
  `<osm version="0.6">
<node id="1" lon="13" lat="52"/><node id="2" lon="14" lat="52"/><node id="3" lon="14" lat="53"/><node id="4" lon="13" lat="53"/>
<node id="10" lon="13.1" lat="52.1"/><node id="11" lon="13.2" lat="52.1"/><node id="12" lon="13.2" lat="52.2"/><node id="13" lon="13.1" lat="52.2"/>
<node id="20" lon="13.15" lat="52.15"><tag k="healthcare" v="hospital"/><tag k="name" v="Prüfklinik"/></node>
<node id="21" lon="13.15" lat="52.15"><tag k="emergency" v="ambulance_station"/><tag k="name" v="Campusrettung"/></node>
<node id="22" lon="13.1" lat="52.15"><tag k="emergency" v="emergency_ward_entrance"/></node>
<node id="23" lon="15" lat="52.15"><tag k="amenity" v="fire_station"/></node>
<way id="100"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/></way>
<way id="101"><nd ref="10"/><nd ref="11"/><nd ref="12"/><nd ref="13"/><nd ref="10"/><tag k="amenity" v="hospital"/><tag k="name" v="Prüfklinik"/></way>
<way id="102"><nd ref="10"/><nd ref="11"/><tag k="amenity" v="fire_station"/></way>
${states.map((s, i) => `<relation id="${1000 + i}"><member type="way" ref="100" role="outer"/><tag k="type" v="boundary"/><tag k="boundary" v="administrative"/><tag k="admin_level" v="4"/><tag k="ISO3166-2" v="DE-${s}"/></relation>`).join("")}
<relation id="2000"><member type="way" ref="101" role="outer"/><tag k="type" v="multipolygon"/><tag k="healthcare" v="hospital"/><tag k="name" v="Prüfklinik"/></relation>
</osm>`,
);
const args = [
  "-cp",
  cp,
  resolve("scripts/geodata/ExtractFacilities.java"),
  input,
  output,
];
const run = spawnSync(java, args, { encoding: "utf8", windowsHide: true });
assert.equal(run.status, 0, run.stdout + run.stderr);
const rows = (await readFile(output, "utf8"))
  .trim()
  .split("\n")
  .map(JSON.parse);
assert.equal(rows.length, 4);
assert.ok(
  rows.some(
    (r) =>
      r.source === "relation:2000" &&
      r.entrances.some((e) => e.source === "node:22"),
  ),
);
assert.ok(!rows.some((r) => r.source === "node:23"));
assert.match(
  await readFile(output + ".errors.ndjson", "utf8"),
  /Unclosed facility area 102/,
);
const normalized = normalizeFacilities(rows, { snapshot: "fixture" });
assert.equal(normalized.length, 2);
assert.deepEqual(normalized.find((r) => r.kind === "hospital").sources, [
  "relation:2000",
  "way:101",
  "node:20",
]);
const again = spawnSync(java, args, { encoding: "utf8", windowsHide: true });
assert.notEqual(again.status, 0);
console.log(
  "Facility extraction passed: points, polygons, relations, entrances, clipping, deduplication, campus separation, invalid geometry and overwrite protection.",
);
