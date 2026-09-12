import { z } from "zod";
import type { Point } from "./world";

const presenceId = z.string().min(1).max(100);
const locationSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    label: z.string().min(1).max(80),
    source: z.literal("station"),
  })
  .strict();
export const publicPlayerSchema = z
  .object({
    id: presenceId,
    name: z.string().min(1).max(48),
    deskId: presenceId,
    deskName: z.string().min(1).max(48),
    status: z.enum(["online", "reconnecting"]),
    location: locationSchema.nullable(),
  })
  .strict();
export type PublicPlayer = z.infer<typeof publicPlayerSchema>;
export type PresenceLocation = NonNullable<PublicPlayer["location"]>;
export type PresenceDesk = {
  id: string;
  name: string;
  location: PresenceLocation | null;
  players: PublicPlayer[];
};
export const PRESENCE_CHUNK = 128;
export const presenceFrameSchema = z
  .object({
    protocol: z.literal("lv-presence-1"),
    world: z.string().min(1).max(40),
    stream: presenceId,
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    full: z.boolean(),
    part: z.number().int().min(1),
    parts: z.number().int().min(1),
    total: z.number().int().min(0),
    upsert: z.array(publicPlayerSchema).max(PRESENCE_CHUNK),
    removed: z.array(presenceId).max(PRESENCE_CHUNK),
  })
  .strict()
  .refine(
    (f) =>
      f.part <= f.parts && f.upsert.length + f.removed.length <= PRESENCE_CHUNK,
  );
export type PresenceFrame = z.infer<typeof presenceFrameSchema>;
export const comparePlayers = (a: PublicPlayer, b: PublicPlayer) =>
  a.deskName.localeCompare(b.deskName, "de") ||
  a.deskId.localeCompare(b.deskId) ||
  a.name.localeCompare(b.name, "de") ||
  a.id.localeCompare(b.id);
export function groupPresence(
  players: readonly PublicPlayer[],
): PresenceDesk[] {
  const groups = new Map<string, PresenceDesk>();
  for (const p of players) {
    let group = groups.get(p.deskId);
    if (!group) {
      group = {
        id: p.deskId,
        name: p.deskName,
        location: p.location,
        players: [],
      };
      groups.set(p.deskId, group);
    }
    group.players.push(p);
  }
  for (const group of groups.values()) group.players.sort(comparePlayers);
  return [...groups.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id),
  );
}
export const presencePoint = (player: PublicPlayer): Point | null =>
  player.location && { x: player.location.x, y: player.location.y };

/** Atomically assemble bounded chunks. A partial roster is never presented as all players. */
export class PresenceDecoder {
  private stream = "";
  private revision = -1;
  private players = new Map<string, PublicPlayer>();
  private pending?: {
    frame: PresenceFrame;
    next: number;
    players: Map<string, PublicPlayer>;
    changed: Set<string>;
  };
  constructor(private world: string) {}
  reset() {
    this.stream = "";
    this.revision = -1;
    this.players.clear();
    this.pending = undefined;
  }
  decode(
    input: unknown,
  ): { players: PublicPlayer[]; revision: number } | undefined {
    const f = presenceFrameSchema.parse(input);
    if (f.world !== this.world)
      throw Error("Präsenz gehört zu einer anderen Spielwelt.");
    if (
      (f.stream === this.stream && f.revision < this.revision) ||
      (!f.full && f.stream === this.stream && f.revision === this.revision)
    )
      return undefined;
    if (f.part === 1) {
      if (
        !f.full &&
        (f.stream !== this.stream || f.revision !== this.revision + 1)
      )
        throw Error("Präsenz muss vollständig neu geladen werden.");
      this.pending = {
        frame: f,
        next: 1,
        players: f.full ? new Map() : new Map(this.players),
        changed: new Set(),
      };
    }
    const pending = this.pending;
    if (
      !pending ||
      pending.next !== f.part ||
      ["stream", "revision", "parts", "total", "full"].some(
        (k) =>
          pending.frame[k as keyof PresenceFrame] !==
          f[k as keyof PresenceFrame],
      )
    )
      throw Error("Unvollständige Präsenzübertragung.");
    for (const id of [...f.removed, ...f.upsert.map((p) => p.id)]) {
      if (pending.changed.has(id)) throw Error("Doppelter Präsenzdatensatz.");
      pending.changed.add(id);
    }
    if (f.full && f.removed.length)
      throw Error("Ungültige vollständige Präsenzübertragung.");
    f.removed.forEach((id) => pending.players.delete(id));
    f.upsert.forEach((p) => pending.players.set(p.id, p));
    pending.next++;
    if (f.part < f.parts) return undefined;
    if (pending.players.size !== f.total)
      throw Error("Unvollständige Spielerliste.");
    this.players = pending.players;
    this.stream = f.stream;
    this.revision = f.revision;
    this.pending = undefined;
    return {
      players: [...this.players.values()].sort(comparePlayers),
      revision: this.revision,
    };
  }
}
