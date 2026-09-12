import {
  civilProtectionActions,
  type CivilProtectionAction,
} from "../src/simulation/civil-protection-schema";
import { civilProtectionCommand } from "../src/simulation/civil-protection";
import { diagnostics } from "./diagnostics";
import {
  callGenerationAllowed,
  withCallGeneration,
} from "../src/simulation/call-generation";
import { mulRatio } from "../src/money";
import { ensureWorldSituation, stepWorldSituation } from "./world-situation";
import { advanceSituation } from "../src/simulation/world-situation";
import { repairIncidentLocations } from "../src/simulation/location-repair";
import { vehiclePosition } from "../src/vehicle-position";
import { qualityFactor } from "../src/simulation/reports";
import { withAutomaticRouting } from "../src/simulation/routing-context";
import { addXp } from "../src/progression";
import { personDuty } from "../src/simulation/staffing";
import {
  prepareCallPacing,
  mayCreateIncident,
  recordIncidentCreated,
  retryCallLater,
} from "../src/simulation/pacing";
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
import { patientTransportReason } from "../src/simulation/patients";
import {
  migratePatientTransports,
  transportSeatsAvailable,
  registerPatientTransport,
  completePatientTransport,
  transportIdentity,
} from "../src/simulation/patient-transport";
import { attachDynamics, followupsTick } from "../src/simulation/dynamics";
import { deskOwner, workspace, membership } from "./workspaces";
import { attachIncident } from "../src/simulation/calls";
import { legacyIncident, publicSave } from "../src/simulation/incidents";
import { alarm } from "../src/simulation/dispatch";
import { withdraw, assessRemoteWithdrawal } from "../src/simulation/withdrawal";
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
  constructor(
    public db: Database,
    private canGenerate: (desk: string) => boolean = () => false,
  ) {}
  command(user: string, input: unknown, mode: GameMode = "multi") {
    parseMode(mode);
    if (
      input &&
      typeof input === "object" &&
      "action" in input &&
      input.action &&
      typeof input.action === "object" &&
      "type" in input.action &&
      ["build", "move-building", "relocate-building"].includes(
        String(input.action.type),
      )
    )
      throw Error(
        "BUILDING_PURCHASE_ONLY: Bitte einen bestehenden Standort erwerben.",
      );
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
      const external: Skills = {},
        externalUnits: Vehicle[] = [];
      const actionMission =
        "mission" in action
          ? action.mission
          : action.type === "recall"
            ? s.vehicles.find((v) => v.id === action.id)?.mission
            : undefined;
      if (actionMission) {
        const m = s.missions.find((m) => m.id === actionMission);
        if (m)
          for (const helper of saves.values())
            for (const v of helper.vehicles.filter(
              (v) =>
                v.mission === `remote:${owner}:${m.id}` &&
                v.status === "scene" &&
                (!v.fault || v.fault.state === "repaired") &&
                authorizedHelper(s, m, helper, v),
            )) {
              externalUnits.push(v);
              for (const [k, n] of Object.entries(effectiveSkills(m, v)))
                external[k] = (external[k] || 0) + n;
            }
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
        civilProtectionActions.some(
          (schema) => schema.shape.type.value === action.type,
        )
      )
        civilProtectionCommand(s, action as CivilProtectionAction, user);
      else if (
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
        deskCommand(s, action as DeskAction, user, external, externalUnits);
      else if (
        action.type === "recall" &&
        s.vehicles.some(
          (v) =>
            v.id === action.id &&
            v.status === "scene" &&
            s.missions.some((m) => m.id === v.mission),
        )
      ) {
        const v = s.vehicles.find((v) => v.id === action.id)!;
        const m = s.missions.find((m) => m.id === v.mission)!;
        writable(m);
        withdraw(s, m, [v.id], user, external, externalUnits);
      } else if (
        action.type === "recall" &&
        s.vehicles.some(
          (v) =>
            v.id === action.id &&
            v.status === "scene" &&
            v.mission?.startsWith("remote:"),
        )
      ) {
        const v = s.vehicles.find((v) => v.id === action.id)!;
        const targetOwner = [...saves.values()].find((other) =>
          other.missions.some(
            (m) => v.mission === `remote:${other.player.id}:${m.id}`,
          ),
        );
        const m = targetOwner?.missions.find(
          (m) => v.mission === `remote:${targetOwner.player.id}:${m.id}`,
        );
        if (targetOwner && m && m.phase !== "done") {
          writable(m);
          if (!authorizedHelper(targetOwner, m, s, v))
            throw Error("Keine gültige Unterstützungszuordnung.");
          const units: Vehicle[] = [],
            skills: Skills = {};
          for (const helper of saves.values())
            for (const unit of helper.vehicles) {
              if (
                unit.mission !== v.mission ||
                unit.status !== "scene" ||
                !authorizedHelper(targetOwner, m, helper, unit)
              )
                continue;
              units.push(unit);
              for (const [key, n] of Object.entries(effectiveSkills(m, unit)))
                skills[key] = (skills[key] || 0) + n;
            }
          const assessment = assessRemoteWithdrawal(
            targetOwner,
            m,
            [v.id],
            skills,
            units,
          );
          if (!assessment.allowed) throw Error(assessment.reasons.join(" "));
        }
        recall(s, v);
      } else if (action.type === "share" || action.type === "unshare") {
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
          const units: Vehicle[] = [],
            skills: Skills = {};
          for (const helper of saves.values())
            for (const v of helper.vehicles) {
              if (
                v.mission !== `remote:${owner}:${m.id}` ||
                !authorizedHelper(s, m, helper, v)
              )
                continue;
              units.push(v);
              if (v.status === "scene")
                for (const [key, n] of Object.entries(effectiveSkills(m, v)))
                  skills[key] = (skills[key] || 0) + n;
            }
          if (units.length) {
            const assessment = assessRemoteWithdrawal(
              s,
              m,
              units.map((v) => v.id),
              skills,
              units,
            );
            if (!assessment.allowed) throw Error(assessment.reasons.join(" "));
          }
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
          maxReward: m.paymentCents ?? mt(m.template).reward,
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
  step(
    seconds: number,
    now = Date.now(),
    options: { generation?: boolean; sharedSituation?: boolean } = {},
  ) {
    withAutomaticRouting(() =>
      this.db.transaction(() => {
        withCallGeneration(
          (s) =>
            options.generation !== false &&
            seconds <= 60 &&
            deskOwner(this.db, s.player.id, "multi") === s.player.id &&
            this.canGenerate(s.player.id),
          () =>
            this.stepMode(
              seconds,
              now,
              "multi",
              options.generation !== false,
              options.sharedSituation !== false,
            ),
        );
      }),
    );
  }
  private stepMode(
    seconds: number,
    now: number,
    mode: GameMode,
    allowGeneration = true,
    sharedSituation = true,
  ) {
    const saves = this.db.all(mode);
    const world = ensureWorldSituation(this.db.sql);
    for (const s of saves.values())
      repairIncidentLocations(s, (m) => {
        for (const helper of saves.values()) {
          if (helper.player.id === s.player.id) continue;
          for (const v of helper.vehicles.filter(
            (v) =>
              v.mission === `remote:${s.player.id}:${m.id}` &&
              ["alarmed", "travel"].includes(v.status) &&
              authorizedHelper(s, m, helper, v),
          )) {
            const departure =
              v.status === "alarmed"
                ? Math.max(helper.time, v.depart)
                : helper.time;
            beginTrip(
              helper,
              v,
              m.pos,
              v.status,
              v.journey?.mode ?? "priority",
            );
            v.arrive += departure - helper.time;
            v.depart = departure;
          }
        }
      });
    // Each slice reconciles all participants from authoritative persisted state.
    const count = Math.max(
      1,
      Math.ceil(Math.min(14400, Math.max(0, seconds)) / 5),
    );
    for (let n = 0; n < count; n++) {
      const currentWorld = advanceSituation(
        world,
        ((n + 1) * Math.min(14400, Math.max(0, seconds))) / count,
      );
      if (sharedSituation)
        for (const s of saves.values()) s.worldSituation = currentWorld;
      aidTick(saves);
      const remote = new Map<string, Record<string, Skills>>();
      const remoteVehicles = new Map<string, Record<string, Vehicle[]>>();
      const carriers: Record<string, Skills> = {};
      const remoteDynamic = new Set<string>();
      for (const [ownerId, owner] of saves) {
        const skills: Record<string, Skills> = {};
        const units: Record<string, Vehicle[]> = {};
        for (const m of owner.missions) {
          migratePatientTransports(m);
          const locationPending = m.location?.state === "repair-pending";
          if (!locationPending && m.dynamics?.active)
            remoteDynamic.add(`remote:${ownerId}:${m.id}`);
          for (const [helperId, helper] of saves) {
            if (helperId === ownerId) continue;
            for (const v of helper.vehicles.filter(
              (v) =>
                !locationPending &&
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
                !patientTransportReason(m, v) &&
                !m.transports.some(
                  (t) =>
                    t.assignment === v.assignment && t.status === "ordered",
                )
              ) {
                const seats = transportSeatsAvailable(m, v);
                if (
                  seats > 0 &&
                  hospital(helper, v.path.at(-1)!, seats, m, v)
                ) {
                  transport(helper, v, seats, m);
                  const assignment = v.assignment!;
                  const order = registerPatientTransport(
                    owner,
                    m,
                    v,
                    seats,
                    helperId,
                  );
                  helper.transfers.push({
                    assignment,
                    transportId: transportIdentity(order),
                    hospital: v.destination,
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
              carriers[v.id] = effectiveSkills(m, v);
            for (const order of m.transports.filter(
              (t) => t.owner === helperId && t.status === "ordered",
            )) {
              if (
                helper.transfers.some(
                  (t) =>
                    (t.transportId ?? t.assignment) ===
                      transportIdentity(order) && t.delivered,
                )
              ) {
                completePatientTransport(owner, m, order);
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
          if (m.location?.state === "technical-closure") continue;
          this.db.sql
            .prepare("INSERT OR IGNORE INTO rewards VALUES (?,?,?)")
            .run(`owner:${m.round}:${id}`, id, m.telemetry?.credits ?? 0);
          for (const helperId of m.contributors) {
            const helper = saves.get(helperId);
            if (!helper) throw Error("Beteiligtes Konto fehlt.");
            const amount = mulRatio(
                m.paymentCents ?? mt(m.template).reward,
                Math.round(qualityFactor(m) * 400),
                800 * m.contributors.length,
              ),
              receipt = `coop:${m.round}:${helperId}`;
            const inserted = this.db.sql
              .prepare("INSERT OR IGNORE INTO rewards VALUES (?,?,?)")
              .run(receipt, helperId, amount);
            if (inserted.changes) {
              money(helper, amount, `Verbund: ${mt(m.template).name}`, receipt);
              addXp(helper, Math.floor(60 * qualityFactor(m)));
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
    stepWorldSituation(this.db.sql, seconds);
    aidTick(saves);
    for (const [id, s] of saves) {
      s.revision++;
      // A shared dispatch has exactly one generator. Dormant member saves and
      // missed server time cannot create an additional queue or catch-up wave.
      const activeDesk = callGenerationAllowed(s);
      if (!activeDesk && s.vehicles.length)
        diagnostics.log("generation", "CALLS_SUPPRESSED_ABSENT");
      prepareCallPacing(s, seconds, activeDesk);
      if (
        allowGeneration &&
        activeDesk &&
        seconds <= 60 &&
        s.missionWait === 0
      ) {
        if (!mayCreateIncident(s)) retryCallLater(s);
        else {
          const count = s.missions.length;
          campaignTick(s, (template, pos) => {
            if (!callGenerationAllowed(s))
              throw Error("PLAY_PRESENCE_REQUIRED");
            const m = {
              id: simId(s),
              template,
              paymentCents: mt(template).reward,
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
          if (s.missions.length === count) followupsTick(s);
          if (s.missions.length === count) {
            generate(s);
            if (s.missions.length > count) {
              attachIncident(s, s.missions.at(-1)!);
              attachDynamics(s, s.missions.at(-1)!);
              attachOrganizations(s.missions.at(-1)!);
              maybeMajor(s, s.missions.at(-1)!);
            }
          }
          if (s.missions.length > count) recordIncidentCreated(s);
          else retryCallLater(s);
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
            buildings: other.buildings
              .filter((b) => visible.some((v) => v.home === b.id))
              .map((b) => ({ ...b, civilProtection: undefined })),
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
      save: publicSave({
        ...save,
        worldSituation: ensureWorldSituation(this.db.sql),
      }),
      network: {
        friends,
        support,
        requests: aidView(saves, user),
        alarms: [...saves.values()]
          .filter((p) => deskOwner(this.db, p.player.id, mode) === p.player.id)
          .flatMap((p) => {
            const active = p.buildings.filter(
              (b) =>
                b.civilProtection && b.civilProtection.state !== "inactive",
            );
            return active.length
              ? [
                  {
                    id: p.player.id,
                    name: p.player.station,
                    phase: active.some(
                      (b) => b.civilProtection!.state === "mobilizing",
                    )
                      ? ("mobilizing" as const)
                      : ("ready" as const),
                    started: Math.min(
                      ...active.map(
                        (b) => b.civilProtection!.started ?? p.time,
                      ),
                    ),
                    stations: active.length,
                  },
                ]
              : [];
          }),
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
