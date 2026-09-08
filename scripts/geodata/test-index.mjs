import { mkdtemp, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const root = resolve(
  process.env.GEODATA_DIR || join(repo, "../leitstellen-deutschland-geodata"),
);
const dir = await mkdtemp(join(tmpdir(), "leitstellen-geodata-index-"));
const folder = (await readdir(join(root, "tools"))).find((name) =>
  name.startsWith("jdk-21.0.12.1"),
);
const java = join(
  root,
  "tools",
  folder,
  "bin",
  process.platform === "win32" ? "java.exe" : "java",
);
const source = join(dir, "fixture.osm"),
  output = join(dir, "index.sqlite");
await writeFile(
  source,
  `<?xml version="1.0"?><osm version="0.6">
<node id="1" lat="52.51" lon="13.40"/>
<node id="2" lat="52.511" lon="13.401"><tag k="place" v="village"/><tag k="name" v="Prüfort"/></node>
<node id="3" lat="52.512" lon="13.402"><tag k="amenity" v="hospital"/><tag k="name" v="Testklinik"/><tag k="addr:street" v="Prüfweg"/><tag k="addr:housenumber" v="3"/></node>
<node id="4" lat="52.513" lon="13.403"><tag k="addr:street" v="Prüfweg"/><tag k="addr:housenumber" v="4"/><tag k="addr:city" v="Prüfort"/></node>
<node id="5" lat="52.514" lon="13.404"/>
<node id="6" lat="52.515" lon="13.405"/>
<node id="7" lat="52.516" lon="13.406"/>
<node id="8" lat="52.517" lon="13.407"/>
<node id="9" lat="54.0" lon="15.0"><tag k="place" v="town"/><tag k="name" v="Außerhalb"/></node>
<node id="10" lat="54.1" lon="15.1"/>
<node id="101" lat="52.0" lon="13.0"/><node id="102" lat="53.0" lon="13.0"/><node id="103" lat="53.0" lon="14.0"/><node id="104" lat="52.0" lon="14.0"/>
<way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><tag k="highway" v="residential"/><tag k="name" v="Prüfweg"/></way>
<way id="11"><nd ref="3"/><nd ref="4"/><nd ref="5"/><tag k="highway" v="primary"/><tag k="bridge" v="yes"/></way>
<way id="12"><nd ref="6"/><nd ref="7"/><tag k="highway" v="footway"/></way>
<way id="13"><nd ref="8"/><nd ref="7"/><tag k="highway" v="service"/><tag k="access" v="private"/></way>
<way id="14"><nd ref="9"/><nd ref="10"/><tag k="highway" v="residential"/><tag k="name" v="Außenweg"/></way>
<way id="20"><nd ref="7"/><nd ref="8"/><tag k="building" v="yes"/><tag k="addr:street" v="Prüfweg"/><tag k="addr:housenumber" v="7"/></way>
<way id="40"><nd ref="101"/><nd ref="102"/><nd ref="103"/><nd ref="104"/><nd ref="101"/></way>
<relation id="51477"><member type="way" ref="40" role="outer"/><tag k="type" v="boundary"/><tag k="admin_level" v="2"/><tag k="name" v="Deutschland"/></relation>
</osm>`,
);
const cp = [
  join(root, "tools", "graphhopper-web-11.0.jar"),
  join(root, "tools", "planetiler-0.10.2.jar"),
].join(process.platform === "win32" ? ";" : ":");
const result = spawnSync(
  java,
  ["-cp", cp, join(repo, "scripts/geodata/BuildIndex.java"), source, output],
  { encoding: "utf8", windowsHide: true },
);
assert.equal(result.status, 0, result.stdout + result.stderr);
const db = new DatabaseSync(output, { readOnly: true });
assert.equal(db.prepare("SELECT count(*) n FROM anchors").get().n, 5);
assert.ok(
  db
    .prepare("SELECT name FROM sqlite_master WHERE name='places_exact_name'")
    .get(),
);
assert.equal(
  db.prepare("SELECT bridge FROM anchors WHERE id=3").get().bridge,
  0,
);
assert.equal(
  db.prepare("SELECT bridge FROM anchors WHERE id=5").get().bridge,
  1,
);
assert.equal(
  db.prepare("SELECT count(*) n FROM places WHERE kind='hospital'").get().n,
  1,
);
assert.equal(
  db.prepare("SELECT count(*) n FROM places WHERE kind='address'").get().n,
  2,
);
assert.equal(
  db
    .prepare(
      "SELECT count(*) n FROM places_fts WHERE places_fts MATCH 'prufort'",
    )
    .get().n,
  2,
);
assert.equal(
  db
    .prepare(
      "SELECT count(*) n FROM anchors_rtree WHERE min_lon<=13.4021 AND max_lon>=13.3999",
    )
    .get().n,
  3,
);
assert.equal(
  db.prepare("SELECT value FROM metadata WHERE key='world_id'").get().value,
  "germany-1",
);
assert.equal(
  db
    .prepare(
      "SELECT count(*) n FROM places WHERE name IN ('Außerhalb','Außenweg')",
    )
    .get().n,
  0,
);
db.close();
const repeat = spawnSync(
  java,
  ["-cp", cp, join(repo, "scripts/geodata/BuildIndex.java"), source, output],
  { encoding: "utf8", windowsHide: true },
);
assert.notEqual(
  repeat.status,
  0,
  "An existing index must never be overwritten.",
);
console.log(
  "Geodata index: anchors, access, bridge, hospital, addresses, FTS, RTree and overwrite protection passed.",
);
