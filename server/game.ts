import { vehiclePosition } from "../src/vehicle-position";
import { addXp } from "../src/progression";
import { stationProfile, personDuty } from "../src/simulation/staffing";
import { BALANCE } from "../src/catalog";
import { nextCallDelay } from "../src/simulation/balance";
import { majorActions, type MajorAction } from "../src/simulation/major-schema";
import { majorCommand } from "../src/simulation/major-command";
import { maybeMajor, campaignTick } from "../src/simulation/major-incidents";
import {
  effectiveSkills,
  canTransport,
} from "../src/simulation/major-resources";
import {
  organizationActions,
  aidActions,
  type OrganizationAction,
  type AidAction,
} from "../src/simulation/organizations-schema";
import {
  organizationCommand,
  attachOrganizations,
} from "../src/simulation/organizations";
import { aidCommand, aidTick, aidView, authorizedHelper } from "./aid";
import {
  boardPatients,
  deliverPatients,
  patientSeats,
  transportCandidates,
} from "../src/simulation/patients";
import { attachDynamics, followupsTick } from "../src/simulation/dynamics";
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
import type { Save, Vehicle } from "../src/model";
import { parseMode, type GameMode } from "../src/mode";
import { vt, mt, type Skills } from "../src/catalog";

export class Game {
  constructor(public db: Database) {}
  command(user: string, input: unknown, mode: GameMode = "multi") {
    parseMode(mode);
    const { id, action } = commandSchema.parse(input),
      fingerprint = hash(JSON.stringify(action));
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
      const external: Skills = {};
      if ("mission" in action) {
        const m = s.missions.find((m) => m.id === action.mission);
        if (m)
          for (const helper of saves.values())
            for (const v of helper.vehicles.filter(
              (v) =>
                v.mission === `remote:${owner}:${m.id}` &&
                v.status === "scene" &&
                (!v.fault || v.fault.state === "repaired") &&
                authorizedHelper(s, m, helper, v),
            ))
              for (const [k, n] of Object.entries(effectiveSkills(m, v)))
                external[k] = (external[k] || 0) + n;
      }
      if (
        majorActions.some((schema) => schema.shape.type.value === action.type)
      ) {
        const a = action as MajorAction;
        const m = s.missions.find((m) => m.id === a.mission);
        const foreign = m
          ? [...saves.values()]
              .filter((helper) => helper.player.id !== owner)
              .flatMap((helper) =>
                helper.vehicles.filter(
                  (v) =>
                    v.mission === `remote:${owner}:${m.id}` &&
                    authorizedHelper(s, m, helper, v),
                ),
              )
          : [];
        majorCommand(s, a, user, foreign);
      } else if (
        aidActions.some((schema) => schema.shape.type.value === action.type)
      ) {
        if (mode !== "multi")
          throw Error("Unterstützungsanfragen nur im Multiplayer.");
        const eligible = new Set(
          [...saves.keys()].filter((id) => deskOwner(this.db, id, mode) === id),
        );
        aidCommand(saves, s, action as AidAction, user, eligible);
      } else if (
        organizationActions.some(
          (schema) => schema.shape.type.value === action.type,
        )
      )
        organizationCommand(s, action as OrganizationAction, user);
      else if (action.type === "dispatch") {
        const m = s.missions.find((m) => m.id === action.mission);
        if (!m) throw Error("Eigener Einsatz fehlt.");
        legacyIncident(s, m);
        writable(m);
        alarm(
          s,
          m,
          action.vehicles,
          user,
          action.priority,
          action.alarm,
          action.travel,
        );
      } else if (
        deskActions.some((schema) => schema.shape.type.value === action.type)
      )
        deskCommand(s, action as DeskAction, user, external);
      else if (action.type === "share" || action.type === "unshare") {
        const m = s.missions.find((m) => m.id === action.id);
        if (!m) throw Error("Eigener Einsatz fehlt.");
        if (action.type === "share" && m.control && !m.control.legacy)
          throw Error(
            "Neue Einsätze bleiben in der eigenen Leitstelle. Bitte eine Unterstützungsanfrage im Leitstellenverbund erstellen.",
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
      } else {
        apply(s, action as Action);
        if (action.type === "build") {
          const b = s.buildings.at(-1)!;
          if (!["hospital", "school"].includes(b.type))
            b.organization = stationProfile(b);
        }
        if (action.type === "hire")
          for (const p of s.people.filter(
            (p) => p.home === action.home && !p.duty,
          ))
            p.duty = personDuty(s, p);
      }
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
      aidTick(saves);
      const remote = new Map<string, Record<string, Skills>>();
      const remoteVehicles = new Map<string, Record<string, Vehicle[]>>();
      const carriers: Record<string, Skills> = {};
      const remoteDynamic = new Set<string>();
      for (const [ownerId, owner] of saves) {
        const skills: Record<string, Skills> = {};
        const units: Record<string, Vehicle[]> = {};
        for (const m of owner.missions) {
          if (m.dynamics?.active)
            remoteDynamic.add(`remote:${ownerId}:${m.id}`);
          for (const [helperId, helper] of saves) {
            if (helperId === ownerId) continue;
            for (const v of helper.vehicles.filter(
              (v) =>
                v.mission === `remote:${ownerId}:${m.id}` &&
                v.status === "scene" &&
                (!v.fault || v.fault.state === "repaired") &&
                authorizedHelper(owner, m, helper, v),
            )) {
              if (!m.contributors.includes(helperId))
                m.contributors.push(helperId);
              const current = (skills[m.id] ||= {});
              (units[m.id] ||= []).push(v);
              for (const [key, value] of Object.entries(effectiveSkills(m, v)))
                current[key] = (current[key] || 0) + value;
              if (
                canTransport(m, v) &&
                !m.transports.some((t) => t.assignment === v.assignment)
              ) {
                const remaining =
                  (patientSeats(m) ?? mt(m.template).patients) -
                  m.transports.reduce((a, t) => a + t.patients, 0);
                const seats = Math.min(
                  remaining,
                  vt(v.type).capacity,
                  m.major ? transportCandidates(m).length : Infinity,
                );
                if (
                  seats > 0 &&
                  hospital(helper, v.path.at(-1)!, seats, m, v)
                ) {
                  transport(helper, v, seats, m);
                  boardPatients(owner, m, v, seats);
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
            for (const v of helper.vehicles.filter(
              (v) =>
                v.patients &&
                v.mission === `remote:${ownerId}:${m.id}` &&
                authorizedHelper(owner, m, helper, v),
            ))
              carriers[v.id] = vt(v.type).skills;
            for (const order of m.transports.filter(
              (t) => t.owner === helperId && t.status === "ordered",
            )) {
              if (
                helper.transfers.some(
                  (t) => t.assignment === order.assignment && t.delivered,
                )
              ) {
                order.status = "delivered";
                const vehicle = helper.vehicles.find(
                  (v) => v.id === order.vehicle,
                );
                if (vehicle) deliverPatients(owner, m, vehicle);
              }
            }
          }
        }
        remote.set(ownerId, skills);
        remoteVehicles.set(ownerId, units);
      }
      for (const [id, s] of saves) {
        const before = new Set(s.archive.map((m) => m.round));
        tick(
          s,
          s.time + Math.min(14400, Math.max(0, seconds)) / count,
          remote.get(id),
          false,
          false,
          carriers,
          remoteDynamic,
          remoteVehicles.get(id),
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
              addXp(helper, 60);
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
              ?.missions.some(
                (m) =>
                  m.id === missionId &&
                  authorizedHelper(saves.get(ownerId)!, m, helper, v),
              )
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
    aidTick(saves);
    for (const [id, s] of saves) {
      s.revision++;
      // Arrival intervals use real seconds, independent of simulation speed.
      // Catch-up after a stopped server never creates a backlog of new calls.
      if (seconds > 60) s.missionWait = nextCallDelay(s.seed);
      else {
        s.missionWait = Math.max(0, s.missionWait - Math.max(0, seconds));
        campaignTick(s, (template, pos) => {
          const m = {
            id: simId(s),
            template,
            pos,
            progress: 0,
            phase: "offered" as const,
            created: s.time,
            completed: 0,
            shared: false,
            round: simId(s),
            contributors: [],
            transports: [],
          };
          s.missions.push(m);
          attachIncident(s, m);
          attachDynamics(s, m);
          attachOrganizations(m);
          return m;
        });
        if (!s.operations.campaign) followupsTick(s);
        if (
          !s.operations.campaign &&
          s.missionWait === 0 &&
          s.missions.length < BALANCE.activeMax
        ) {
          const count = s.missions.length;
          generate(s);
          if (s.missions.length > count) {
            attachIncident(s, s.missions.at(-1)!);
            attachDynamics(s, s.missions.at(-1)!);
            attachOrganizations(s.missions.at(-1)!);
            maybeMajor(s, s.missions.at(-1)!);
            s.missionWait = nextCallDelay(s.seed);
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
    parseMode(mode);
    const actor = user;
    const onlineDesks = new Set(
      [...online].map((id) => deskOwner(this.db, id, mode)),
    );
    user = deskOwner(this.db, user, mode);
    const access = workspace(this.db, actor, mode);
    const saves = this.db.all(mode),
      save = saves.get(user);
    if (!save) throw Error("Spielstand fehlt.");
    const related = (
      coordinator: string,
      missionId: string,
      helper: Save,
      v: Vehicle,
    ) => {
      const o = saves.get(coordinator),
        m = o?.missions.find((m) => m.id === missionId);
      return !!o && !!m && authorizedHelper(o, m, helper, v);
    };
    const friends = [...saves.values()]
      .filter((other) => other.player.id !== user)
      .flatMap((other) => {
        const incoming = other.vehicles.filter(
          (v) =>
            v.mission?.startsWith(`remote:${user}:`) &&
            related(user, v.mission.split(":")[2], other, v),
        );
        const outgoing = save.vehicles.filter(
          (v) =>
            v.mission?.startsWith(`remote:${other.player.id}:`) &&
            related(other.player.id, v.mission.split(":")[2], save, v),
        );
        if (!incoming.length && !outgoing.length) return [];
        const missionIds = new Set(
          outgoing.map((v) => v.mission!.split(":")[2]),
        );
        const visible = other.vehicles.filter(
          (v) =>
            incoming.includes(v) || (v.mission && missionIds.has(v.mission)),
        );
        return [
          {
            id: other.player.id,
            name: other.player.name,
            status: onlineDesks.has(other.player.id)
              ? "Verbunden · Online"
              : "Verbunden · Server simuliert",
            revision: other.revision,
            buildings: other.buildings.filter((b) =>
              visible.some((v) => v.home === b.id),
            ),
            vehicles: visible.map((v) => ({
              ...v,
              turnout: undefined,
              position: vehiclePosition(v, other.time),
              eta: Math.max(0, v.arrive - other.time),
              fms: other.desk.fleet[v.id]?.code ?? 2,
            })),
            missions: publicSave(other).missions.filter((m) =>
              missionIds.has(m.id),
            ),
          },
        ];
      });
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
      network: {
        friends,
        support,
        requests: aidView(saves, user),
        neighbors: [...saves.values()]
          .filter(
            (p) =>
              p.player.id !== user &&
              deskOwner(this.db, p.player.id, mode) === p.player.id,
          )
          .map((p) => ({
            id: p.player.id,
            name: p.player.station,
            online: onlineDesks.has(p.player.id),
          })),
      },
    };
  }
}
