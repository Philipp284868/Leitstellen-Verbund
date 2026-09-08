import type { Coordinate, MotionPhase } from "../motion";

export type RoutePayload = {
  path: Coordinate[];
  planned?: Coordinate[];
  motion?: MotionPhase[];
};
export type SnapshotVehicle = {
  id: string;
  owner: string;
  path?: Coordinate[];
  routeRef?: string;
  journey?: { planned?: Coordinate[]; motion?: MotionPhase[] };
};
export interface SnapshotDocument {
  mode: string;
  workspace?: { owner: string };
  save: {
    world: string;
    generation: string;
    revision: number;
    player: { id: string };
    vehicles: SnapshotVehicle[];
  };
  network: {
    friends: { id: string; vehicles: SnapshotVehicle[] }[];
    support: { vehicle: SnapshotVehicle }[];
  };
}
export interface RouteSnapshotFrame<
  T extends SnapshotDocument = SnapshotDocument,
> {
  protocol: "lv-routes-1";
  stream: string;
  sequence: number;
  scope: string;
  reset: boolean;
  snapshot: T;
  routes: Record<string, RoutePayload>;
  retain: string[];
}
export const SNAPSHOT_ROUTE_LIMIT = 512;
export const SNAPSHOT_ROUTE_BYTES = 64 * 1024 * 1024;
export function snapshotScope(data: SnapshotDocument) {
  return JSON.stringify([
    data.mode,
    data.save.world,
    data.save.generation,
    data.save.player.id,
    data.workspace?.owner ?? data.save.player.id,
  ]);
}
export function mapSnapshotVehicles<T extends SnapshotDocument>(
  data: T,
  transform: (vehicle: SnapshotVehicle) => SnapshotVehicle,
): T {
  return {
    ...data,
    save: { ...data.save, vehicles: data.save.vehicles.map(transform) },
    network: {
      ...data.network,
      friends: data.network.friends.map((friend) => ({
        ...friend,
        vehicles: friend.vehicles.map(transform),
      })),
      support: data.network.support.map((support) => ({
        ...support,
        vehicle: transform(support.vehicle),
      })),
    },
  };
}
export class SnapshotResyncError extends Error {
  constructor(
    message = "Routendaten müssen erneut vollständig synchronisiert werden.",
  ) {
    super(message);
    this.name = "SnapshotResyncError";
  }
}
/** Reconnect must call reset before accepting the first frame of the new socket stream. */
export class RouteSnapshotDecoder<
  T extends SnapshotDocument = SnapshotDocument,
> {
  private routes = new Map<string, { payload: RoutePayload; bytes: number }>();
  private stream = "";
  private sequence = 0;
  private scope = "";
  reset() {
    this.routes.clear();
    this.stream = "";
    this.sequence = 0;
    this.scope = "";
  }
  get cachedRouteCount() {
    return this.routes.size;
  }
  decode(frame: RouteSnapshotFrame<T>): T | null {
    if (
      frame.protocol !== "lv-routes-1" ||
      typeof frame.stream !== "string" ||
      !frame.stream ||
      !Number.isSafeInteger(frame.sequence) ||
      frame.sequence < 1
    )
      throw new SnapshotResyncError("Ungültiger Routensynchronisationsrahmen.");
    if (this.stream && frame.stream !== this.stream)
      throw new SnapshotResyncError(
        "Routendaten stammen aus einer alten oder anderen Verbindung.",
      );
    if (this.stream && frame.sequence <= this.sequence) return null;
    if (
      (!this.stream && !frame.reset) ||
      (this.stream && frame.sequence !== this.sequence + 1)
    )
      throw new SnapshotResyncError(
        "Eine Routensynchronisation fehlt; vollständigen Stand neu anfordern.",
      );
    if (
      snapshotScope(frame.snapshot) !== frame.scope ||
      (this.scope && this.scope !== frame.scope && !frame.reset)
    )
      throw new SnapshotResyncError(
        "Leitstellen- oder Weltwechsel benötigt vollständige Routendaten.",
      );
    if (
      !Array.isArray(frame.retain) ||
      frame.retain.length > SNAPSHOT_ROUTE_LIMIT ||
      new Set(frame.retain).size !== frame.retain.length
    )
      throw new SnapshotResyncError("Ungültiger Routencacheumfang.");
    const prior = frame.reset
      ? new Map<string, { payload: RoutePayload; bytes: number }>()
      : this.routes;
    const available = new Map(prior),
      used = new Set<string>();
    for (const [ref, payload] of Object.entries(frame.routes)) {
      if (
        !Array.isArray(payload.path) ||
        (payload.planned !== undefined && !Array.isArray(payload.planned)) ||
        (payload.motion !== undefined && !Array.isArray(payload.motion))
      )
        throw new SnapshotResyncError("Unvollständige Routengeometrie.");
      available.set(ref, {
        payload,
        bytes: new TextEncoder().encode(JSON.stringify(payload)).byteLength,
      });
    }
    const snapshot = mapSnapshotVehicles(frame.snapshot, (vehicle) => {
      const ref = vehicle.routeRef;
      if (!ref || !ref.startsWith(`${vehicle.owner}/${vehicle.id}/`))
        throw new SnapshotResyncError(
          "Routenreferenz gehört nicht zum Fahrzeug.",
        );
      const found = available.get(ref);
      if (!found) throw new SnapshotResyncError();
      used.add(ref);
      const result = { ...vehicle, path: found.payload.path };
      delete result.routeRef;
      if (vehicle.journey)
        result.journey = {
          ...vehicle.journey,
          planned: found.payload.planned,
          motion: found.payload.motion,
        };
      return result;
    });
    const next = new Map<string, { payload: RoutePayload; bytes: number }>();
    let bytes = 0;
    for (const ref of frame.retain) {
      const found = available.get(ref);
      if (!found || !used.has(ref))
        throw new SnapshotResyncError(
          "Routencache enthält kein aktuell sichtbares Fahrzeug.",
        );
      bytes += found.bytes;
      if (bytes > SNAPSHOT_ROUTE_BYTES)
        throw new SnapshotResyncError(
          "Routencache überschreitet die Speichergrenze.",
        );
      next.set(ref, found);
    }
    // No partial application on malformed frames; revoke invisible geometry as part of the same commit.
    this.routes = next;
    this.stream = frame.stream;
    this.sequence = frame.sequence;
    this.scope = frame.scope;
    return snapshot;
  }
}
