import { deskOwner, workspace, membership } from "./workspaces";
import { attachIncident } from "../src/simulation/calls";
import { legacyIncident, publicSave } from "../src/simulation/incidents";
import { alarm } from "../src/simulation/dispatch";
import { deskCommand } from "../src/simulation/commands";
import { writable, simId } from "../src/simulation/events";
import { deskActions, type DeskAction } from "../src/simulation/actions";
import { Database } from "./database";
import { commandSchema } from "./actions";
import { hash } from "./auth";
import {
  apply,
  generate,
  beginTrip,
  readiness,
  tick,
  money,
  recall,
  transport,
  hospital,
  endCooperation,
  type Action,
} from "../src/engine";
import type { GameMode } from "../src/mode";
import { vt, mt, type Skills } from "../src/catalog";
import { along } from "../src/world";

export class Game {
  constructor(public db: Database) {}
  command(user: string, input: unknown, mode: GameMode = "multi") {
    const { id, action } = commandSchema.parse(input),
      fingerprint = hash(
        JSON.stringify(mode === "multi" ? action : { mode, action }),
      );
    return this.db.transaction(() => {
      const prior = this.db.sql
        .prepare("SELECT fingerprint FROM actions WHERE user_id=? AND id=?")
        .get(user, id);
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw Error("Aktions-ID bereits für eine andere Aktion benutzt.");
        return;
      }
      if (membership(this.db, user, action, mode)) {
        this.db.sql
          .prepare("INSERT INTO actions VALUES (?,?,?)")
          .run(user, id, fingerprint);
        return;
      }
      const owner = deskOwner(this.db, user, mode);
      const saves = this.db.all(mode),
        s = saves.get(owner);
      if (!s) throw Error("Konto fehlt.");
      if (
        mode === "single" &&
        ["share", "unshare", "support"].includes(action.type)
      )
        throw Error("Zusammenarbeit ist nur im Multiplayer möglich.");
      if (action.type === "dispatch") {
        const m = s.missions.find((m) => m.id === action.mission);
        if (!m) throw Error("Eigener Einsatz fehlt.");
        legacyIncident(s, m);
        writable(m);
        alarm(s, m, action.vehicles, user, action.priority, action.alarm);
      } else if (
        deskActions.some((schema) => schema.shape.type.value === action.type)
      )
        deskCommand(s, action as DeskAction, user);
      else if (action.type === "share" || action.type === "unshare") {
        const m = s.missions.find((m) => m.id === action.id);
        if (!m) throw Error("Eigener Einsatz fehlt.");
        if (action.type === "share" && m.control && !m.control.legacy)
          throw Error(
            "Neue Einsätze bleiben in der eigenen Leitstelle. Nachbarleitstellen folgen in Phase 3.",
          );
        if (action.type === "share") m.shared = true;
        else {
          if (
            m.transports.some(
              (t) => t.owner !== owner && t.status === "ordered",
            )
          )
            throw Error(
              "Laufender fremder Patiententransport muss zuerst ankommen.",
            );
          for (const helper of saves.values())
            for (const v of helper.vehicles.filter(
              (v) => v.mission === `remote:${owner}:${m.id}` && !v.patients,
            ))
              recall(helper, v);
          endCooperation(s, m.id);
        }
      } else if (action.type === "support") {
        const remoteOwner = saves.get(action.peer),
          m = remoteOwner?.missions.find((m) => m.id === action.mission);
        const v = s.vehicles.find((v) => v.id === action.vehicle);
        if (
          action.peer === owner ||
          !m?.shared ||
          m.round !== action.round ||
          m.phase === "done" ||
          !v
        )
          throw Error("Freigegebener Einsatz oder eigenes Fahrzeug fehlt.");
        const reason = readiness(s, v);
        if (reason) throw Error(reason);
        if (vt(v.type).mode === "water" && !mt(m.template).water)
          throw Error("Boot benötigt Gewässereinsatz.");
        const participants = new Set([
          ...m.contributors,
          ...Array.from(saves.values())
            .filter((p) =>
              p.vehicles.some(
                (v) => v.mission === `remote:${action.peer}:${m.id}`,
              ),
            )
            .map((p) => p.player.id),
        ]);
        if (participants.size >= 4 && !participants.has(owner))
          throw Error("Maximal vier unterstützende Konten je Einsatz.");
        v.assignment = simId(s);
        v.mission = `remote:${action.peer}:${m.id}`;
        s.contributions = s.contributions
          .filter((c) => c.status === "active")
          .slice(-499);
        s.contributions.push({
          assignment: v.assignment,
          peer: action.peer,
          mission: m.id,
          round: m.round,
          vehicle: v.id,
          maxReward: mt(m.template).reward,
          status: "active",
        });
        beginTrip(s, v, m.pos, "travel");
      } else if (action.type === "settings")
        s.settings = { light: action.light, reduced: action.reduced };
      else if (action.type === "template") {
        action.types.forEach(vt);
        if (s.templates.length >= 12) throw Error("Maximal zwölf Vorlagen.");
        s.templates.push({ name: action.name, types: action.types });
      } else apply(s, action as Action);
      for (const [id, value] of saves) {
        value.revision++;
        this.db.save(id, value, mode);
      }
      this.db.sql
        .prepare("INSERT INTO actions VALUES (?,?,?)")
        .run(user, id, fingerprint);
    });
  }
  step(seconds: number, now = Date.now()) {
    this.db.transaction(() => {
      this.stepMode(seconds, now, "multi");
      this.stepMode(seconds, now, "single");
    });
  }
  private stepMode(seconds: number, now: number, mode: GameMode) {
    const saves = this.db.all(mode);
    // Each slice reconciles all participants from authoritative persisted state.
    const count = Math.max(
      1,
      Math.ceil(Math.min(14400, Math.max(0, seconds)) / 5),
    );
    for (let n = 0; n < count; n++) {
      const remote = new Map<string, Record<string, Skills>>();
      for (const [ownerId, owner] of saves) {
        const skills: Record<string, Skills> = {};
        for (const m of owner.missions.filter((m) => m.shared)) {
          for (const [helperId, helper] of saves) {
            if (helperId === ownerId) continue;
            for (const v of helper.vehicles.filter(
              (v) =>
                v.mission === `remote:${ownerId}:${m.id}` &&
                v.status === "scene",
            )) {
              if (!m.contributors.includes(helperId))
                m.contributors.push(helperId);
              const current = (skills[m.id] ||= {});
              for (const [key, value] of Object.entries(vt(v.type).skills))
                current[key] = (current[key] || 0) + value;
              if (
                m.phase === "transport" &&
                !m.transports.some((t) => t.assignment === v.assignment)
              ) {
                const remaining =
                  mt(m.template).patients -
                  m.transports.reduce((a, t) => a + t.patients, 0);
                const seats = Math.min(remaining, vt(v.type).capacity);
                if (seats > 0 && hospital(helper, v.path.at(-1)!, seats)) {
                  transport(helper, v, seats);
                  const assignment = v.assignment!;
                  m.transports.push({
                    assignment,
                    owner: helperId,
                    vehicle: v.id,
                    patients: seats,
                    status: "ordered",
                  });
                  helper.transfers.push({
                    assignment,
                    peer: ownerId,
                    mission: m.id,
                    round: m.round,
                    patients: seats,
                    delivered: false,
                  });
                }
              }
            }
            for (const order of m.transports.filter(
              (t) => t.owner === helperId && t.status === "ordered",
            )) {
              if (
                helper.transfers.some(
                  (t) => t.assignment === order.assignment && t.delivered,
                )
              )
                order.status = "delivered";
            }
          }
        }
        remote.set(ownerId, skills);
      }
      for (const [id, s] of saves) {
        const before = new Set(s.archive.map((m) => m.round));
        tick(
          s,
          s.time + Math.min(14400, Math.max(0, seconds)) / count,
          remote.get(id),
          false,
          false,
        );
        for (const m of s.archive.filter((m) => !before.has(m.round))) {
          this.db.sql
            .prepare("INSERT OR IGNORE INTO rewards VALUES (?,?,?)")
            .run(
              `owner:${m.round}:${id}`,
              id,
              m.contributors.length
                ? Math.floor(mt(m.template).reward / 2)
                : mt(m.template).reward,
            );
          for (const helperId of m.contributors) {
            const helper = saves.get(helperId);
            if (!helper) throw Error("Beteiligtes Konto fehlt.");
            const amount = Math.floor(
                mt(m.template).reward / 2 / m.contributors.length,
              ),
              receipt = `coop:${m.round}:${helperId}`;
            const inserted = this.db.sql
              .prepare("INSERT OR IGNORE INTO rewards VALUES (?,?,?)")
              .run(receipt, helperId, amount);
            if (inserted.changes) {
              money(helper, amount, `Verbund: ${mt(m.template).name}`, receipt);
              helper.xp += 25;
            }
          }
        }
      }
      // A disconnected browser never owns a coordination role. Orphan assignments return safely.
      for (const helper of saves.values()) {
        for (const v of helper.vehicles.filter(
          (v) => v.mission?.startsWith("remote:") && !v.patients,
        )) {
          const [, ownerId, missionId] = v.mission!.split(":");
          if (
            !saves
              .get(ownerId)
              ?.missions.some((m) => m.id === missionId && m.shared)
          )
            recall(helper, v);
        }
        helper.transfers = helper.transfers.filter(
          (t) =>
            !t.delivered ||
            Array.from(saves.values()).some((s) =>
              s.missions.some((m) => m.round === t.round),
            ),
        );
        helper.receipts = helper.receipts.slice(-10000);
      }
    }
    for (const [id, s] of saves) {
      s.revision++;
      // Arrival intervals use real seconds, independent of simulation speed.
      // Catch-up after a stopped server never creates a backlog of new calls.
      if (seconds > 60) s.missionWait = 90 + (s.seed % 121);
      else {
        s.missionWait = Math.max(0, s.missionWait - Math.max(0, seconds));
        if (s.missionWait === 0 && s.missions.length < 2) {
          const count = s.missions.length;
          generate(s);
          if (s.missions.length > count) {
            attachIncident(s, s.missions.at(-1)!);
            s.missionWait = 90 + (s.seed % 121);
          }
        }
      }
      this.db.save(id, s, mode);
    }
    this.db.sql
      .prepare(
        "INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run("lastTick", String(now));
    this.db.sql.prepare("DELETE FROM sessions WHERE expires<?").run(now);
    this.db.sql.prepare("DELETE FROM limits WHERE until_at<?").run(now);
  }
  view(user: string, online: Set<string>, mode: GameMode = "multi") {
    const actor = user;
    user = deskOwner(this.db, user, mode);
    const access = workspace(this.db, actor, mode);
    if (mode === "single") this.db.ensureSolo(user);
    const saves = this.db.all(mode),
      save = saves.get(user);
    if (!save) throw Error("Spielstand fehlt.");
    if (mode === "single")
      return {
        mode,
        workspace: access,
        save: publicSave(save),
        network: { friends: [], support: [] },
      };
    const sharedAssignment = (mission: string | null, owner: string) => {
      if (!mission) return false;
      if (mission.startsWith("remote:")) {
        const [, coordinator, id] = mission.split(":");
        return !!saves
          .get(coordinator)
          ?.missions.some((m) => m.id === id && m.shared);
      }
      return !!saves
        .get(owner)
        ?.missions.some((m) => m.id === mission && m.shared);
    };
    const friends = Array.from(saves.values())
      .filter(
        (s) =>
          s.player.id !== user &&
          (save.vehicles.some((v) =>
            v.mission?.startsWith(`remote:${s.player.id}:`),
          ) ||
            s.vehicles.some((v) => v.mission?.startsWith(`remote:${user}:`))),
      )
      .map((s) => ({
        id: s.player.id,
        name: s.player.name,
        status: online.has(s.player.id)
          ? "Verbunden · Online"
          : "Verbunden · Server simuliert (Browser offline)",
        revision: s.revision,
        buildings: s.buildings,
        vehicles: s.vehicles
          .filter((v) => sharedAssignment(v.mission, s.player.id))
          .map((v) => ({
            ...v,
            position: along(
              v.path,
              (s.time - v.depart) / (v.arrive - v.depart || 1),
            ),
            eta: Math.max(0, v.arrive - s.time),
          })),
        missions: publicSave(s).missions.filter(
          (m) =>
            m.shared &&
            save.vehicles.some(
              (v) => v.mission === `remote:${s.player.id}:${m.id}`,
            ),
        ),
      }));
    const support = friends.flatMap((f) =>
      f.vehicles
        .filter((v) => v.mission?.startsWith(`remote:${user}:`))
        .map((v) => ({
          peer: f.id,
          mission: v.mission!.split(":")[2],
          round:
            save.missions.find((m) => m.id === v.mission!.split(":")[2])
              ?.round || "",
          assignment: v.assignment!,
          vehicle: v,
          at: Date.now(),
        })),
    );
    return {
      mode,
      workspace: access,
      save: publicSave(save),
      network: { friends, support },
    };
  }
}
