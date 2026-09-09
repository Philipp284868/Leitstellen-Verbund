import { describe, expect, it } from "vitest";
import { RouteSnapshotEncoder } from "../server/germany/snapshots";
import {
  RouteSnapshotDecoder,
  SnapshotResyncError,
  type SnapshotDocument,
} from "../src/germany/snapshot";

function snapshot(points = 3): SnapshotDocument {
  const path = Array.from({ length: points }, (_, i) => ({
    x: i * 0.7,
    y: 100 + i * 0.3,
  }));
  return {
    mode: "multi",
    workspace: { owner: "desk-a" },
    save: {
      world: "germany-1",
      generation: "generation-a",
      revision: 1,
      player: { id: "desk-a" },
      vehicles: [
        {
          owner: "desk-a",
          id: "lf-a",
          path,
          journey: {
            planned: [...path],
            motion: path.slice(1).map((p, i) => ({
              from: path[i],
              to: p,
              meters: 12,
              limit: 50,
              edge: `gh:dataset:${i}`,
              start: i,
              duration: 1,
              velocity: 12,
              acceleration: 0,
              offset: 0,
              traveled: i * 12,
            })),
          },
        },
      ],
    },
    network: { friends: [], support: [] },
  };
}
describe("Deutschland-Routensnapshots", () => {
  it("omits identical long geometry after the first frame and reconstructs every point", () => {
    const encoder = new RouteSnapshotEncoder(),
      decoder = new RouteSnapshotDecoder();
    const first = snapshot(15000),
      full = encoder.encode(first),
      fullBytes = Buffer.byteLength(JSON.stringify(full));
    const decoded = decoder.decode(full)!;
    expect(decoded).toEqual(first);
    const next = structuredClone(first);
    next.save.revision++;
    const delta = encoder.encode(next),
      deltaBytes = Buffer.byteLength(JSON.stringify(delta));
    expect(Object.keys(delta.routes)).toHaveLength(0);
    expect(deltaBytes).toBeLessThan(fullBytes / 100);
    const result = decoder.decode(delta)!;
    expect(result).toEqual(next);
    expect(result.save.vehicles[0].path).toBe(decoded.save.vehicles[0].path);
    expect(result.save.vehicles[0].path).toHaveLength(15000);
  });
  it("detects interior route and motion changes with unchanged endpoints and point counts", () => {
    const encoder = new RouteSnapshotEncoder(),
      decoder = new RouteSnapshotDecoder(),
      data = snapshot();
    decoder.decode(encoder.encode(data));
    data.save.vehicles[0].path![1].x += 4;
    data.save.vehicles[0].journey!.motion![0].limit = 30;
    const changed = encoder.encode(data);
    expect(Object.keys(changed.routes)).toHaveLength(1);
    expect(decoder.decode(changed)).toEqual(data);
  });
  it("ignores duplicate and older frames, requires resync on a missing sequence and sends full on reconnect", () => {
    const encoder = new RouteSnapshotEncoder(),
      decoder = new RouteSnapshotDecoder(),
      data = snapshot();
    const first = encoder.encode(data);
    decoder.decode(first);
    expect(decoder.decode(first)).toBeNull();
    encoder.encode(data);
    expect(() => decoder.decode(encoder.encode(data))).toThrow(
      SnapshotResyncError,
    );
    encoder.reset();
    decoder.reset();
    const reset = encoder.encode(data);
    expect(reset.sequence).toBe(1);
    expect(Object.keys(reset.routes)).toHaveLength(1);
    expect(decoder.decode(reset)).toEqual(data);
    expect(() => decoder.decode(first)).toThrow("anderen Verbindung");
  });
  it("resets on generation or desk change and never carries a route into another owner's vehicle", () => {
    const encoder = new RouteSnapshotEncoder(),
      decoder = new RouteSnapshotDecoder(),
      data = snapshot();
    decoder.decode(encoder.encode(data));
    data.save.generation = "new-generation";
    const reset = encoder.encode(data);
    expect(reset.reset).toBe(true);
    expect(Object.keys(reset.routes)).toHaveLength(1);
    decoder.decode(reset);
    data.save.player.id = "desk-b";
    data.workspace!.owner = "desk-b";
    data.save.vehicles[0].owner = "desk-b";
    const switched = encoder.encode(data);
    expect(switched.reset).toBe(true);
    expect(decoder.decode(switched)).toEqual(data);
    expect(decoder.cachedRouteCount).toBe(1);
  });
  it("revokes helper geometry immediately and resends it only when it becomes authorized again", () => {
    const encoder = new RouteSnapshotEncoder(),
      decoder = new RouteSnapshotDecoder(),
      data = snapshot();
    const helper = {
      ...structuredClone(data.save.vehicles[0]),
      owner: "other",
      id: "lf-a",
    };
    data.network.friends = [{ id: "other", vehicles: [helper] }];
    data.network.support = [{ vehicle: helper }];
    const first = encoder.encode(data);
    expect(Object.keys(first.routes)).toHaveLength(2);
    decoder.decode(first);
    expect(decoder.cachedRouteCount).toBe(2);
    data.network.friends = [];
    data.network.support = [];
    const removed = decoder.decode(encoder.encode(data))!;
    expect(removed.network.friends).toEqual([]);
    expect(decoder.cachedRouteCount).toBe(1);
    data.network.friends = [{ id: "other", vehicles: [helper] }];
    const returned = encoder.encode(data);
    expect(Object.keys(returned.routes)).toHaveLength(1);
    expect(decoder.decode(returned)).toEqual(data);
  });
  it("rejects missing references atomically and bounds cache entries without losing visible geometry", () => {
    const encoder = new RouteSnapshotEncoder(),
      decoder = new RouteSnapshotDecoder(),
      data = snapshot();
    const first = encoder.encode(data),
      broken = structuredClone(first);
    broken.routes = {};
    expect(() => decoder.decode(broken)).toThrow(SnapshotResyncError);
    expect(decoder.cachedRouteCount).toBe(0);
    expect(decoder.decode(first)).toEqual(data);
    const large = snapshot();
    large.save.vehicles = Array.from({ length: 600 }, (_, i) => ({
      ...large.save.vehicles[0],
      id: `unit-${i}`,
    }));
    const frame = encoder.encode(large);
    expect(frame.retain).toHaveLength(512);
    expect(decoder.decode(frame)).toEqual(large);
    expect(decoder.cachedRouteCount).toBe(512);
    const repeat = encoder.encode(large);
    expect(Object.keys(repeat.routes)).toHaveLength(88);
    expect(decoder.decode(repeat)).toEqual(large);
  });
});
