import { expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  poiTileBounds,
  indexedPoiTile,
  createPoiIndex,
} from "../src/server/germany/poi-index";
import {
  polygonLabelPoint,
  deduplicatePois,
  poiCategory,
  tilePoi,
  type MapPoi,
} from "../src/shared/germany/poi-data";
import { project } from "../src/shared/germany/projection";
import {
  clusterPoiPixels,
  hitPoiClusters,
} from "../src/client/germany/poi-layer";

const point = (id: string, extra: Partial<MapPoi> = {}): MapPoi => ({
  id,
  category: "hospital",
  name: "Klinik am Park",
  lon: 13.405,
  lat: 52.52,
  count: 1,
  source: "index",
  kind: "hospital",
  ...extra,
});
it("klassifiziert nur tatsächliche OSM-Merkmale und keine suggestiven Namen oder fremden Objektfelder", () => {
  expect(poiCategory("poi", { class: "hospital" })).toBe("hospital");
  expect(poiCategory("poi", { class: "railway", subclass: "station" })).toBe(
    "station",
  );
  expect(poiCategory("poi", { class: "school" })).toBe("education");
  expect(poiCategory("aerodrome_label", {})).toBe("airport");
  for (const props of [
    { class: "restaurant", name: "Feuerwache" },
    { class: "__proto__" },
    { subclass: "constructor" },
  ])
    expect(poiCategory("poi", props)).toBeUndefined();
  expect(poiCategory("landuse", { class: "hospital" })).toBeUndefined();
  expect(
    tilePoi(
      {
        properties: { class: "hospital" },
        geometry: { type: "GeometryCollection" },
      },
      "poi",
    ),
  ).toBeUndefined();
  expect(
    tilePoi(
      {
        properties: { class: "hospital" },
        geometry: { type: "Point", coordinates: [-120, 40] },
      },
      "poi",
    ),
  ).toBeUndefined();
  const item = tilePoi(
    {
      id: 17,
      properties: { class: "hospital", "name:de": "Krankenhaus an der Spree" },
      geometry: { type: "Point", coordinates: [13.4, 52.5] },
    },
    "poi",
  );
  expect(item).toMatchObject({
    name: "Krankenhaus an der Spree",
    source: "tiles",
    count: 1,
    category: "hospital",
  });
});
it("de-dupliziert Index und Vektorkachel sowie gekaufte identische Spielgebäude ohne Besitz zu verändern", () => {
  const index = point("index:1"),
    tile = point("tile:1", { source: "tiles", lon: 13.40501 });
  expect(deduplicatePois([tile, index], [])).toEqual([index]);
  const building = { type: "hospital", name: index.name, pos: project(index) };
  expect(deduplicatePois([index, tile], [building])).toEqual([]);
  expect(building).toEqual({
    type: "hospital",
    name: index.name,
    pos: project(index),
  });
  expect(
    deduplicatePois(
      [point("nearby", { lon: 13.406, name: "Andere Klinik" })],
      [building],
    ),
  ).toHaveLength(1);
  expect(
    deduplicatePois([point("school", { category: "education" })], [building]),
  ).toHaveLength(1);
  expect(
    deduplicatePois([point("aggregate", { count: 20 })], [building]),
  ).toHaveLength(1);
});
it("zeigt nahe getrennte Einrichtungen getrennt, bewahrt vollständige Clusterzahlen und die gewählte Einrichtung", () => {
  const source = Array.from({ length: 8000 }, (_, i) =>
    point(String(i), { lon: 13 + i / 100000, count: i === 0 ? 7 : 1 }),
  );
  const clusters = clusterPoiPixels(
    source,
    () => ({ x: 80, y: 100 }),
    1920,
    1080,
    10,
    "4000",
  );
  expect(clusters).toHaveLength(2);
  expect(clusters[0].point.id).toBe("4000");
  expect(clusters.reduce((sum, c) => sum + c.count, 0)).toBe(8006);
  expect(clusters.reduce((sum, c) => sum + c.members.length, 0)).toBe(8000);
  expect(
    clusterPoiPixels([source[0]], () => ({ x: 10000, y: 20 }), 1920, 1080, 16),
  ).toEqual([]);
});

it("erhält alle gleich platzierten Einrichtungen in der Trefferliste auch nach Auswahl eines einzelnen Markers", () => {
  const points = deduplicatePois(
    ["A", "B", "C"].map((id) => point(id, { name: `Klinik ${id}` })),
    [],
  );
  expect(points).toHaveLength(3);
  for (const selected of [undefined, "A", "B", "C"]) {
    const groups = clusterPoiPixels(
      points,
      () => ({ x: 400, y: 400 }),
      1920,
      1080,
      18,
      selected,
    );
    const hit = hitPoiClusters(groups, 400, 400)!;
    expect(hit.count).toBe(3);
    expect(hit.members.map((point) => point.id).sort()).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(hitPoiClusters(groups, 800, 800)).toBeUndefined();
  }
});

function indexFixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE places(id INTEGER PRIMARY KEY,kind TEXT,name TEXT,lon REAL,lat REAL);CREATE VIRTUAL TABLE places_rtree USING rtree(id,min_lon,max_lon,min_lat,max_lat)",
  );
  const insert = (id: number, kind: string, lon: number, lat: number) => {
    db.prepare("INSERT INTO places VALUES(?,?,?,?,?)").run(
      id,
      kind,
      `Einrichtung ${id}`,
      lon,
      lat,
    );
    db.prepare("INSERT INTO places_rtree VALUES(?,?,?,?,?)").run(
      id,
      lon,
      lon,
      lat,
      lat,
    );
  };
  return { db, insert };
}
it("liefert 1300 indizierte Einrichtungen als vollständige räumliche Gruppen statt stillen LIMIT-Verlust", () => {
  const { db, insert } = indexFixture();
  const [w, s, e, n] = poiTileBounds(11, 1100, 670);
  try {
    db.exec("BEGIN");
    for (let i = 0; i < 1300; i++)
      insert(
        i + 1,
        ["hospital", "clinic", "police", "fire_station"][i % 4],
        w + (e - w) * (0.05 + (i % 20) / 25),
        s + (n - s) * (0.05 + (Math.floor(i / 20) % 20) / 25),
      );
    db.exec("COMMIT");
    const points = indexedPoiTile(db, 11, 1100, 670);
    expect(points.length).toBeLessThanOrEqual(256);
    expect(points.reduce((sum, p) => sum + p.count, 0)).toBe(1300);
    expect(
      points.every(
        (p) =>
          p.source === "index" &&
          p.lon >= w &&
          p.lon < e &&
          p.lat >= s &&
          p.lat < n,
      ),
    ).toBe(true);
  } finally {
    db.close();
  }
});
it("grenzt Kacheln halb offen ab, schließt Nicht-POIs aus und liefert Einzelstandorte ab Detailzoom", () => {
  const { db, insert } = indexFixture();
  const [w, s, e, n] = poiTileBounds(12, 2200, 1340);
  try {
    insert(1, "hospital", w, (s + n) / 2);
    insert(2, "fire_station", e, (s + n) / 2);
    insert(3, "city", (w + e) / 2, (s + n) / 2);
    const left = indexedPoiTile(db, 12, 2200, 1340),
      right = indexedPoiTile(db, 12, 2201, 1340);
    expect(left.map((p) => p.id)).toEqual(["index:1"]);
    expect(right.map((p) => p.id)).toEqual(["index:2"]);
    expect(left[0]).toMatchObject({
      name: "Einrichtung 1",
      category: "hospital",
      count: 1,
    });
    for (const args of [
      [3, 0, 0],
      [15, 0, 0],
      [11, -1, 0],
      [11, 2048, 0],
      [11.5, 1, 1],
    ])
      expect(() =>
        poiTileBounds(...(args as [number, number, number])),
      ).toThrow("Ungültige POI");
  } finally {
    db.close();
  }
});

it("verankert echte Industrieflächen innerhalb ihrer Kontur und außerhalb von Polygonlöchern", () => {
  const geometry = {
    type: "Polygon",
    coordinates: [
      [
        [13, 52],
        [13.1, 52],
        [13.1, 52.1],
        [13, 52.1],
        [13, 52],
      ],
      [
        [13.02, 52.02],
        [13.08, 52.02],
        [13.08, 52.08],
        [13.02, 52.08],
        [13.02, 52.02],
      ],
    ],
  };
  const anchor = polygonLabelPoint(geometry)!;
  expect(anchor[0] >= 13 && anchor[0] <= 13.1).toBe(true);
  expect(anchor[1]).toBeCloseTo(52.05);
  expect(anchor[0] < 13.02 || anchor[0] > 13.08).toBe(true);
  const industrial = tilePoi(
    { properties: { class: "industrial", name: "Industriegebiet" }, geometry },
    "landuse",
  );
  expect(industrial).toMatchObject({
    category: "industry",
    kind: "industrial-area",
    name: "Industriegebiet",
    source: "tiles",
  });
  expect(
    polygonLabelPoint({ type: "Point", coordinates: [13, 52] }),
  ).toBeUndefined();
  expect(
    deduplicatePois([point("same"), point("same", { lon: 13.44 })], []),
  ).toHaveLength(1);
});

it("kopiert ausschließlich passende Geografie vor dem Start in einen schreibgeschützten Speicherindex", () => {
  const { db, insert } = indexFixture();
  insert(1, "hospital", 13.4, 52.52);
  insert(2, "address", 13.4, 52.52);
  insert(3, "police", 13.401, 52.52);
  const sparse = createPoiIndex(db);
  try {
    expect(sparse.prepare("SELECT COUNT(*) AS n FROM places").get()?.n).toBe(2);
    expect(db.prepare("SELECT COUNT(*) AS n FROM places").get()?.n).toBe(3);
    expect(() => sparse.exec("DELETE FROM places")).toThrow(/readonly/i);
    expect(indexedPoiTile(sparse, 14, 8801, 5373).map((p) => p.name)).toEqual([
      "Einrichtung 1",
      "Einrichtung 3",
    ]);
    expect(
      deduplicatePois(
        [point("campus-a"), point("campus-b", { name: "Andere echte Klinik" })],
        [],
      ),
    ).toHaveLength(2);
  } finally {
    sparse.close();
    db.close();
  }
});
