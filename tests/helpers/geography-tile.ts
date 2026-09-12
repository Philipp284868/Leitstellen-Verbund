import { PbfWriter } from "pbf";
import { gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { project } from "../../src/shared/germany/projection";

export const tile = { x: 8802, y: 5373, z: 14, extent: 4096 };
export const fixtureDataset = "a".repeat(64);
export type TileFeature = {
  layer: string;
  properties: Record<string, string>;
  type: 1 | 2 | 3;
  parts: [number, number][][];
};
export const rectangle = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): [number, number][] => [
  [x1, y1],
  [x2, y1],
  [x2, y2],
  [x1, y2],
];
export function tilePoint(
  x: number,
  y: number,
  tileX = tile.x,
  tileY = tile.y,
) {
  return project({
    lon: ((tileX + x / tile.extent) / 2 ** tile.z) * 360 - 180,
    lat:
      (Math.atan(
        Math.sinh(
          Math.PI * (1 - (2 * (tileY + y / tile.extent)) / 2 ** tile.z),
        ),
      ) *
        180) /
      Math.PI,
  });
}
export function encodeTile(features: TileFeature[]) {
  const out = new PbfWriter();
  for (const name of [...new Set(features.map((f) => f.layer))]) {
    const list = features.filter((f) => f.layer === name);
    out.writeMessage(
      3,
      (_, layer) => {
        layer.writeVarintField(15, 2);
        layer.writeStringField(1, name);
        layer.writeVarintField(5, tile.extent);
        const keys = [
          ...new Set(list.flatMap((f) => Object.keys(f.properties))),
        ];
        const values = [
          ...new Set(list.flatMap((f) => Object.values(f.properties))),
        ];
        for (const feature of list)
          layer.writeMessage(
            2,
            (f, pbf) => {
              pbf.writePackedVarint(
                2,
                Object.entries(f.properties).flatMap(([key, value]) => [
                  keys.indexOf(key),
                  values.indexOf(value),
                ]),
              );
              pbf.writeVarintField(3, f.type);
              let x = 0,
                y = 0;
              const geometry: number[] = [],
                zig = (n: number) => (n < 0 ? -n * 2 - 1 : n * 2);
              for (const part of f.parts) {
                geometry.push(9, zig(part[0][0] - x), zig(part[0][1] - y));
                [x, y] = part[0];
                if (part.length > 1) geometry.push((part.length - 1) * 8 + 2);
                for (const point of part.slice(1)) {
                  geometry.push(zig(point[0] - x), zig(point[1] - y));
                  [x, y] = point;
                }
                if (f.type === 3) geometry.push(15);
              }
              pbf.writePackedVarint(4, geometry);
            },
            feature,
          );
        for (const key of keys) layer.writeStringField(3, key);
        for (const value of values)
          layer.writeMessage(4, (v, pbf) => pbf.writeStringField(1, v), value);
      },
      undefined,
    );
  }
  return gzipSync(out.finish());
}
export function createMap(
  path: string,
  features: TileFeature[],
  dataset = fixtureDataset,
) {
  const db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE metadata(name TEXT PRIMARY KEY,value TEXT); CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB,PRIMARY KEY(zoom_level,tile_column,tile_row));",
  );
  db.prepare("INSERT INTO metadata VALUES('source_sha256',?)").run(dataset);
  db.prepare("INSERT INTO metadata VALUES('maxzoom','14')").run();
  db.prepare("INSERT INTO tiles VALUES(?,?,?,?)").run(
    tile.z,
    tile.x,
    2 ** tile.z - 1 - tile.y,
    encodeTile(features),
  );
  db.close();
}
