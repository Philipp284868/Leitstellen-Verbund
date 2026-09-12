import { z } from "zod";
import { fresh } from "../shared/model";
import { Database } from "./database";
import { hash, token, passwordSchema, verifyPassword } from "./auth";
export const accountPrepareSchema = z
  .object({ operation: z.enum(["reset", "delete"]), password: passwordSchema })
  .strict();
export const accountConfirmSchema = z
  .object({
    challenge: z.string().min(20).max(100),
    phrase: z.string().max(180),
    acknowledged: z.literal(true),
  })
  .strict();
type Pending = {
  user: string;
  operation: "reset" | "delete";
  username: string;
  generation: string;
  expires: number;
};
export class AccountLifecycle {
  private pending = new Map<string, Pending>();
  constructor(private db: Database) {}
  private idle(user: string) {
    const saves = this.db.all();
    for (const s of saves.values()) {
      if (
        s.aid.some(
          (r) =>
            (r.owner === user || r.peer === user) &&
            ["ACCEPTED", "IN_PROGRESS"].includes(r.state),
        ) ||
        s.missions.some((m) =>
          s.player.id === user
            ? m.contributors.length > 0
            : m.contributors.includes(user),
        )
      )
        throw Error(
          "Zuerst laufende gemeinsame Einsätze und externe Unterstützung abschließen. Andere Leitstellen dürfen keine gebundenen Patienten oder Kräfte verlieren.",
        );
    }
    return saves.get(user);
  }
  async prepare(user: string, input: unknown, now = Date.now()) {
    const data = accountPrepareSchema.parse(input);
    const row = this.db.sql
      .prepare("SELECT username,password FROM users WHERE id=?")
      .get(user);
    if (!row || !(await verifyPassword(data.password, String(row.password))))
      throw Error("Aktuelles Passwort stimmt nicht.");
    const s = this.idle(user);
    for (const [key, value] of this.pending)
      if (value.user === user || value.expires <= now) this.pending.delete(key);
    const challenge = token(),
      username = String(row.username);
    this.pending.set(hash(challenge), {
      user,
      operation: data.operation,
      username,
      generation: s?.generation ?? "",
      expires: now + 300000,
    });
    return {
      challenge,
      operation: data.operation,
      phrase: `${data.operation === "reset" ? "ZURÜCKSETZEN" : "LÖSCHEN"} ${username}`,
      buildings: s?.buildings.length ?? 0,
      vehicles: s?.vehicles.length ?? 0,
      missions: s?.missions.length ?? 0,
    };
  }
  confirm(user: string, input: unknown, now = Date.now()) {
    const data = accountConfirmSchema.parse(input),
      key = hash(data.challenge),
      pending = this.pending.get(key);
    if (!pending || pending.user !== user || pending.expires <= now)
      throw Error(
        "Bestätigung abgelaufen oder ungültig. Bitte erneut mit Passwort prüfen.",
      );
    const phrase = `${pending.operation === "reset" ? "ZURÜCKSETZEN" : "LÖSCHEN"} ${pending.username}`;
    if (data.phrase !== phrase)
      throw Error("Bestätigungstext stimmt nicht überein.");
    this.db.transaction(() => {
      const s = this.idle(user);
      if ((s?.generation ?? "") !== pending.generation)
        throw Error("Spielstand wurde inzwischen geändert. Bitte neu prüfen.");
      // Unaccepted requests have no bound resources; close them in the same
      // transaction rather than leaving another desk waiting for a removed world.
      for (const [id, other] of this.db.all()) {
        if (id === user) continue;
        let changed = false;
        for (const request of other.aid) {
          if (
            request.peer !== user ||
            !["DRAFT", "SENT"].includes(request.state)
          )
            continue;
          request.state = "CANCELLED";
          request.updated = other.time;
          changed = true;
        }
        if (changed) this.db.save(id, other);
      }
      // Explicit table list: no dynamic SQL identifiers come from the request.
      for (const table of [
        "sessions",
        "actions",
        "rewards",
        "tutorial_progress",
        "training_worlds",
        "solo_saves",
        "saves",
      ])
        this.db.sql.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(user);
      this.db.sql
        .prepare("DELETE FROM mission_history WHERE owner=?")
        .run(user);
      this.db.sql
        .prepare("DELETE FROM facility_rights WHERE owner=?")
        .run(user);
      this.db.sql
        .prepare("DELETE FROM desk_invites WHERE user_id=? OR owner_id=?")
        .run(user, user);
      this.db.sql
        .prepare("DELETE FROM desk_members WHERE user_id=? OR owner_id=?")
        .run(user, user);
      for (const table of [
        "game_events",
        "event_cursors",
        "desk_metrics",
        "ranked_missions",
      ])
        this.db.sql.prepare(`DELETE FROM ${table} WHERE owner=?`).run(user);
      this.db.sql
        .prepare("DELETE FROM player_activity WHERE owner=? OR actor=?")
        .run(user, user);
      const excluded = Number(
        this.db.sql
          .prepare("SELECT excluded FROM player_metrics WHERE user_id=?")
          .get(user)?.excluded ?? 0,
      );
      this.db.sql
        .prepare("DELETE FROM player_metrics WHERE user_id=?")
        .run(user);
      if (pending.operation === "reset") {
        const next = fresh(
          s?.player.name ?? pending.username,
          s?.player.station ?? "Neue Leitstelle",
          s?.time ?? now / 1000,
        );
        next.player.id = user;
        this.db.save(user, next);
        this.db.sql
          .prepare("UPDATE player_metrics SET excluded=? WHERE user_id=?")
          .run(excluded, user);
        this.db.audit(user, "personal-world-reset");
      } else {
        this.db.sql.prepare("DELETE FROM audit WHERE actor=?").run(user);
        this.db.sql.prepare("DELETE FROM users WHERE id=?").run(user);
        this.db.audit("server", "player-account-deleted");
      }
    });
    this.pending.delete(key);
    return { ok: true, operation: pending.operation };
  }
}
