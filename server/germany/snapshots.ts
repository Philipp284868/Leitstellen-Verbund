import { createHash, randomUUID } from "node:crypto";
import {
  mapSnapshotVehicles,
  snapshotScope,
  SNAPSHOT_ROUTE_BYTES,
  SNAPSHOT_ROUTE_LIMIT,
  type RoutePayload,
  type RouteSnapshotFrame,
  type SnapshotDocument,
} from "../../src/germany/snapshot";

/** One encoder per authenticated socket. Input must already be Game.view's authorized view. */
export class RouteSnapshotEncoder {
  private stream = randomUUID();
  private sequence = 0;
  private scope = "";
  private retained = new Set<string>();
  reset() {
    this.stream = randomUUID();
    this.sequence = 0;
    this.scope = "";
    this.retained.clear();
  }
  get cachedRouteCount() {
    return this.retained.size;
  }
  encode<T extends SnapshotDocument>(input: T): RouteSnapshotFrame<T> {
    const scope = snapshotScope(input),
      reset = !this.sequence || scope !== this.scope;
    const previous = reset ? new Set<string>() : this.retained;
    const retain: string[] = [],
      next = new Set<string>(),
      routes: Record<string, RoutePayload> = {};
    let bytes = 0;
    const snapshot = mapSnapshotVehicles(input, (vehicle) => {
      if (!vehicle.path)
        throw Error(
          "Vollständige Fahrzeugroute fehlt vor der Synchronisation.",
        );
      const payload: RoutePayload = { path: vehicle.path };
      if (vehicle.journey?.planned) payload.planned = vehicle.journey.planned;
      if (vehicle.journey?.motion) payload.motion = vehicle.journey.motion;
      const serialized = JSON.stringify(payload),
        size = Buffer.byteLength(serialized),
        hash = createHash("sha256").update(serialized).digest("hex"),
        ref = `${vehicle.owner}/${vehicle.id}/${hash}`;
      if (!previous.has(ref)) routes[ref] = payload;
      if (
        !next.has(ref) &&
        next.size < SNAPSHOT_ROUTE_LIMIT &&
        bytes + size <= SNAPSHOT_ROUTE_BYTES
      ) {
        next.add(ref);
        retain.push(ref);
        bytes += size;
      }
      const result = { ...vehicle, routeRef: ref };
      delete result.path;
      if (vehicle.journey) {
        const journey = { ...vehicle.journey };
        delete journey.planned;
        delete journey.motion;
        result.journey = journey;
      }
      return result;
    });
    this.sequence++;
    this.scope = scope;
    this.retained = next;
    return {
      protocol: "lv-routes-1",
      stream: this.stream,
      sequence: this.sequence,
      scope,
      reset,
      snapshot,
      routes,
      retain,
    };
  }
}
