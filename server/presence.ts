import { randomUUID } from "node:crypto";
import type { Database } from "./database";
import { WORLD, WORLD_WIDTH, WORLD_HEIGHT } from "../src/world";
import {
  PRESENCE_CHUNK,
  publicPlayerSchema,
  type PublicPlayer,
  type PresenceFrame,
} from "../src/presence";

export const PRESENCE_GRACE_MS = 8000;
export const PLAY_LEASE_MS = 120000;
type Connection = {
  user: string;
  session: string;
  desk?: string;
  playingUntil?: number;
};
type Actor = { id: string; status: PublicPlayer["status"] };

/** Presence never consumes or serializes a private Save. SQLite projects only
 * the public display name, assigned desk and its first owned station location. */
export function readPublicPresence(
  db: Database,
  actors: readonly Actor[],
): PublicPlayer[] {
  const players: PublicPlayer[] = [];
  const statuses = new Map(actors.map((a) => [a.id, a.status]));
  for (let offset = 0; offset < actors.length; offset += PRESENCE_CHUNK) {
    const ids = actors.slice(offset, offset + PRESENCE_CHUNK).map((a) => a.id);
    const rows = db.sql
      .prepare(
        `SELECT u.id,
      json_extract(own.data,'$.player.name') AS name,
      COALESCE(m.owner_id,u.id) AS desk_id,
      json_extract(desk.data,'$.player.station') AS desk_name,
      (SELECT json_object('x',json_extract(b.value,'$.pos.x'),'y',json_extract(b.value,'$.pos.y'),
         'label',json_extract(b.value,'$.name'),'source','station')
       FROM json_each(desk.data,'$.buildings') b
       WHERE json_extract(b.value,'$.owner')=COALESCE(m.owner_id,u.id)
         AND json_extract(b.value,'$.type') NOT IN ('hospital','school')
       ORDER BY CAST(b.key AS INTEGER) LIMIT 1) AS location
      FROM users u JOIN saves own ON own.user_id=u.id
      LEFT JOIN desk_members m ON m.user_id=u.id
      JOIN saves desk ON desk.user_id=COALESCE(m.owner_id,u.id)
      WHERE u.role='player' AND u.id IN (${ids.map(() => "?").join(",")}) ORDER BY u.id`,
      )
      .all(...ids);
    for (const row of rows) {
      const location =
        typeof row.location === "string" ? JSON.parse(row.location) : null;
      const validLocation =
        location &&
        Number.isFinite(location.x) &&
        Number.isFinite(location.y) &&
        location.x >= 0 &&
        location.y >= 0 &&
        location.x <= WORLD_WIDTH &&
        location.y <= WORLD_HEIGHT;
      players.push(
        publicPlayerSchema.parse({
          id: String(row.id),
          name:
            String(row.name || "Disponent")
              .trim()
              .slice(0, 48) || "Disponent",
          deskId: String(row.desk_id),
          deskName:
            String(row.desk_name || "Leitstelle")
              .trim()
              .slice(0, 48) || "Leitstelle",
          status: statuses.get(String(row.id)),
          location: validLocation
            ? {
                x: location.x,
                y: location.y,
                label: String(location.label || "Wachenstandort").slice(0, 80),
                source: "station",
              }
            : null,
        }),
      );
    }
  }
  return players;
}

export class WorldPresence {
  private connections = new Map<string, Connection>();
  private away = new Map<string, { sessions: Set<string>; until: number }>();
  private players = new Map<string, PublicPlayer>();
  private fingerprints = new Map<string, string>();
  private revision = 0;
  private stream = randomUUID();
  constructor(
    private world = WORLD,
    private grace = PRESENCE_GRACE_MS,
  ) {}
  connect(id: string, user: string, session: string) {
    this.connections.set(id, { user, session });
    this.away.delete(user);
  }
  play(id: string, desk: string, active: boolean, now: number) {
    const c = this.connections.get(id);
    if (!c) return false;
    const changed = !!c.playingUntil !== active || (active && c.desk !== desk);
    c.desk = active ? desk : undefined;
    c.playingUntil = active ? now + PLAY_LEASE_MS : undefined;
    return changed;
  }
  playing(
    desk: string,
    now: number,
    valid: (session: string, user: string) => boolean,
    owner: (user: string) => string,
  ) {
    return [...this.connections.values()].some(
      (c) =>
        c.desk === desk &&
        (c.playingUntil ?? 0) > now &&
        valid(c.session, c.user) &&
        owner(c.user) === desk,
    );
  }
  disconnect(id: string, now: number, immediate = false) {
    const connection = this.connections.get(id);
    if (!connection) return;
    this.connections.delete(id);
    if ([...this.connections.values()].some((c) => c.user === connection.user))
      return;
    if (immediate) this.away.delete(connection.user);
    else
      this.away.set(connection.user, {
        sessions: new Set([connection.session]),
        until: now + this.grace,
      });
  }
  revokeSession(session: string) {
    for (const [id, c] of this.connections)
      if (c.session === session) this.disconnect(id, 0, true);
    for (const [id, grace] of this.away) {
      grace.sessions.delete(session);
      if (!grace.sessions.size) this.away.delete(id);
    }
  }
  revokeUser(user: string) {
    for (const [id, c] of this.connections)
      if (c.user === user) this.connections.delete(id);
    this.away.delete(user);
  }
  actors(
    now: number,
    valid: (session: string, user: string) => boolean,
  ): Actor[] {
    for (const [id, c] of this.connections)
      if (!valid(c.session, c.user)) this.disconnect(id, now, true);
    for (const [user, away] of this.away)
      if (
        now >= away.until ||
        ![...away.sessions].some((session) => valid(session, user))
      )
        this.away.delete(user);
    const users = new Map<string, PublicPlayer["status"]>(
      [...this.away.keys()].map((id) => [id, "reconnecting"]),
    );
    for (const c of this.connections.values()) users.set(c.user, "online");
    return [...users]
      .map(([id, status]) => ({ id, status }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  reconcile(players: readonly PublicPlayer[]): PresenceFrame[] | undefined {
    const next = new Map(players.map((p) => [p.id, p])),
      fingerprints = new Map(players.map((p) => [p.id, JSON.stringify(p)]));
    const changed = players.filter(
      (p) => this.fingerprints.get(p.id) !== fingerprints.get(p.id),
    );
    const removed = [...this.players.keys()].filter((id) => !next.has(id));
    if (!changed.length && !removed.length) return undefined;
    this.players = next;
    this.fingerprints = fingerprints;
    this.revision++;
    return this.frames(changed, removed, false);
  }
  snapshot(): PresenceFrame[] {
    return this.frames([...this.players.values()], [], true);
  }
  private frames(
    upsert: readonly PublicPlayer[],
    removed: readonly string[],
    full: boolean,
  ): PresenceFrame[] {
    const changes = [
      ...upsert.map((player) => ({ player, id: "" })),
      ...removed.map((id) => ({ player: undefined, id })),
    ];
    const parts = Math.max(1, Math.ceil(changes.length / PRESENCE_CHUNK));
    return Array.from({ length: parts }, (_, index) => {
      const chunk = changes.slice(
        index * PRESENCE_CHUNK,
        (index + 1) * PRESENCE_CHUNK,
      );
      return {
        protocol: "lv-presence-1",
        world: this.world,
        stream: this.stream,
        revision: this.revision,
        full,
        part: index + 1,
        parts,
        total: this.players.size,
        upsert: chunk.flatMap((c) => (c.player ? [c.player] : [])),
        removed: chunk.flatMap((c) => (c.player ? [] : [c.id])),
      };
    });
  }
  close() {
    this.connections.clear();
    this.away.clear();
    this.players.clear();
    this.fingerprints.clear();
  }
}
