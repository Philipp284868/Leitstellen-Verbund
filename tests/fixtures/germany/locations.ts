import { project } from "../../../src/germany/projection";

/** Small, fixed Berlin corridor for technical fixtures, never a playable map.
 * Endpoints follow Straße des 17. Juni; intermediate anchors exercise spatial
 * and route contracts. OSM ingestion/geographic evidence have separate tests. */
const spaced = Array.from({ length: 8 }, (_, i) => i * 16);
const order = [
  ...spaced,
  ...Array.from({ length: 128 }, (_, i) => i).filter(
    (i) => !spaced.includes(i),
  ),
];
export const coordinates = order.map((i) => ({
  lon: 13.324 + i * 0.00045,
  lat: 52.5142 + i * 0.00002,
}));
export const sites = coordinates.map(project);
export const fixtureDataset = "c4".repeat(32);
export const fixtureTime = Date.UTC(2026, 8, 10, 12) / 1000;
