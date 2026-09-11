import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import type { Database } from "./database";
import { fresh, validate, type Save, type Mission } from "../src/model";
import { apply, tick, type Action } from "../src/engine";
import { commandSchema } from "./actions";
import { deskActions, type DeskAction } from "../src/simulation/actions";
import { deskCommand } from "../src/simulation/commands";
import { alarm } from "../src/simulation/dispatch";
import { attachIncident } from "../src/simulation/calls";
import { attachDynamics } from "../src/simulation/dynamics";
import { attachOrganizations } from "../src/simulation/organizations";
import { publicSave } from "../src/simulation/incidents";
import { syncFms } from "../src/simulation/fms";
import { simId } from "../src/simulation/events";
import { mt, vt } from "../src/catalog";
import { xpForLevel } from "../src/progression";
import { nearest, nodes, distance, METERS_PER_UNIT } from "../src/world";
import { withAutomaticRouting } from "../src/simulation/routing-context";
import {
  tutorialChapters,
  tutorialProgressSchema,
  tutorialReady,
  newTutorial,
  type TutorialProgress,
} from "../src/tutorial-model";

const controlSchema = z
  .object({
    op: z.enum(["start", "resume", "skip", "next", "ui"]),
    chapter: z
      .number()
      .int()
      .min(0)
      .max(tutorialChapters.length - 1)
      .optional(),
    kind: tutorialProgressSchema.shape.ui.element.optional(),
  })
  .strict();
const trainingControlSchema = z.discriminatedUnion("op", [
  z
    .object({
      id: z.uuid(),
      op: z.literal("start"),
      reset: z.boolean().optional(),
    })
    .strict(),
  z.object({ id: z.uuid(), op: z.literal("stop") }).strict(),
  z
    .object({
      id: z.uuid(),
      op: z.literal("scenario"),
      kind: z.enum(["technical", "fire"]),
      session: z.uuid(),
    })
    .strict(),
]);
const fingerprints = z.record(z.uuid(), z.string().regex(/^[a-f0-9]{64}$/));
const trainingStateSchema = z
  .object({
    version: z.literal(1),
    active: z.boolean(),
    session: z.uuid(),
    save: z.unknown().transform((value) => validate(value)),
    commands: fingerprints.refine((v) => Object.keys(v).length <= 5000),
    scenarios: z.array(z.enum(["technical", "fire"])).max(2),
    contextRevision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .default(0),
    controlCommands: fingerprints
      .refine((v) => Object.keys(v).length <= 256)
      .default({}),
  })
  .strict();
type TrainingState = z.infer<typeof trainingStateSchema>;
export type TutorialView = { progress: TutorialProgress; ready: boolean };
export type TrainingView = { session: string; active: true } | null;

/** Personal progress and isolated saves are separate from ownership, rewards and public history. */
export class TutorialService {
  constructor(private db: Database) {}
  private atomic<T>(work: () => T): T {
    return this.db.sql.isTransaction ? work() : this.db.transaction(work);
  }
  context(user: string) {
    return this.training(user)?.contextRevision ?? 0;
  }
  /** The context is captured when a request starts, never inferred on retry. */
  assertContext(user: string, expected: unknown, expectedSession?: unknown) {
    const value = expected === undefined ? "0" : expected;
    if (
      (typeof value !== "string" && typeof value !== "number") ||
      !/^(0|[1-9][0-9]*)$/.test(String(value)) ||
      !Number.isSafeInteger(Number(value))
    )
      throw Error("Ungültiger Spielkontext. Bitte neu verbinden.");
    const training = this.training(user);
    if (Number(value) !== (training?.contextRevision ?? 0))
      throw Error(
        "Spielkontext hat sich geändert. Diese Aktion wurde nicht ausgeführt.",
      );
    if (
      training?.active
        ? expectedSession !== training.session
        : !!expectedSession
    )
      throw Error(
        "Übungssitzung hat sich geändert. Diese Aktion wurde nicht auf einen anderen Spielstand angewendet.",
      );
  }
  private nextContext(value: number) {
    if (value >= Number.MAX_SAFE_INTEGER)
      throw Error("Spielkontext kann nicht weiter erhöht werden.");
    return value + 1;
  }
  progress(user: string): TutorialProgress {
    const row = this.db.sql
      .prepare("SELECT payload FROM tutorial_progress WHERE user_id=?")
      .get(user);
    return row
      ? tutorialProgressSchema.parse(JSON.parse(String(row.payload)))
      : newTutorial();
  }
  private writeProgress(user: string, progress: TutorialProgress) {
    this.db.sql
      .prepare(
        "INSERT INTO tutorial_progress VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload",
      )
      .run(user, JSON.stringify(tutorialProgressSchema.parse(progress)));
  }
  view(user: string, save: Save): TutorialView {
    const progress = this.progress(user);
    return { progress, ready: tutorialReady(progress, save) };
  }
  control(user: string, input: unknown, save: Save) {
    const action = controlSchema.parse(input);
    this.atomic(() => {
      let progress = this.progress(user);
      if (action.op === "start" && progress.state === "complete")
        progress = newTutorial();
      if (action.op === "start" || action.op === "resume")
        progress.state = "active";
      if (action.op === "skip") progress.state = "skipped";
      if (action.op === "ui") {
        if (!action.kind || progress.state !== "active") return;
        const kind = tutorialChapters[progress.chapter].kind;
        if (
          (kind === "orientation" &&
            ["pan", "zoom", "search"].includes(action.kind)) ||
          kind === action.kind
        ) {
          if (!progress.ui.includes(action.kind)) progress.ui.push(action.kind);
        }
      }
      if (action.op === "next") {
        if (progress.state !== "active" || action.chapter !== progress.chapter)
          throw Error(
            "Tutorialschritt hat sich geändert. Aktuellen Stand abwarten.",
          );
        if (!tutorialReady(progress, save))
          throw Error(
            "Dieser Schritt ist noch nicht durch den Spielstand bestätigt.",
          );
        if (!progress.completed.includes(progress.chapter))
          progress.completed.push(progress.chapter);
        if (progress.chapter + 1 === tutorialChapters.length)
          progress.state = "complete";
        else progress.chapter++;
      }
      progress.updatedAt = Date.now();
      this.writeProgress(user, progress);
    });
  }
  private training(user: string): TrainingState | null {
    const row = this.db.sql
      .prepare("SELECT payload FROM training_worlds WHERE user_id=?")
      .get(user);
    if (!row) return null;
    const value = trainingStateSchema.parse(JSON.parse(String(row.payload)));
    if (value.save.player.id !== user)
      throw Error("Ungültiger persönlicher Übungsstand.");
    return value;
  }
  active(user: string) {
    return this.training(user)?.active === true;
  }
  trainingSave(user: string) {
    const t = this.training(user);
    return t?.active ? t.save : null;
  }
  private writeTraining(user: string, training: TrainingState, now?: number) {
    const at =
      now ??
      Number(
        this.db.sql
          .prepare("SELECT updated_at FROM training_worlds WHERE user_id=?")
          .get(user)?.updated_at ?? Date.now(),
      );
    training.save = validate(training.save);
    this.db.sql
      .prepare(
        "INSERT INTO training_worlds VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
      )
      .run(user, JSON.stringify(training), at);
  }
  startTraining(user: string, source: Save, reset = false) {
    this.atomic(() => {
      let training = this.training(user);
      const previous = training;
      if (!training || reset) {
        const save = fresh(
          source.player.name,
          "Übung · " + source.player.station.slice(0, 39),
          Date.UTC(2026, 8, 1, 12) / 1000,
        );
        save.player.id = user;
        save.generation = "practice-" + randomUUID();
        save.seed = 20260921;
        save.xp = xpForLevel(2);
        save.progression = {
          version: 1,
          compensation: 0,
          previousXp: save.xp,
          previousLevel: 2,
        };
        training = {
          version: 1,
          active: true,
          session: randomUUID(),
          save,
          commands: {},
          scenarios: [],
          contextRevision: this.nextContext(previous?.contextRevision ?? 0),
          controlCommands: previous?.controlCommands ?? {},
        };
        this.writeProgress(user, {
          ...newTutorial(),
          state: "active",
          updatedAt: Date.now(),
        });
      } else if (!training.active) {
        training.active = true;
        training.contextRevision = this.nextContext(training.contextRevision);
      }
      this.writeTraining(user, training, Date.now());
    });
  }
  stopTraining(user: string) {
    this.atomic(() => {
      const training = this.training(user);
      if (!training?.active) return;
      training.active = false;
      training.contextRevision = this.nextContext(training.contextRevision);
      this.writeTraining(user, training);
    });
  }
  /** Control receipts survive reset; a replay returns the current view without repeating a switch. */
  trainingControl(
    user: string,
    input: unknown,
    source: Save,
    expectedContext: unknown,
    expectedSession?: unknown,
  ) {
    const action = trainingControlSchema.parse(input);
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          action,
          context: expectedContext ?? "0",
          session: expectedSession ?? "",
        }),
      )
      .digest("hex");
    this.atomic(() => {
      const previous = this.training(user);
      const receipt = previous?.controlCommands[action.id];
      if (receipt) {
        if (receipt !== fingerprint)
          throw Error(
            "Aktions-ID bereits für eine andere Übungssteuerung benutzt.",
          );
        return;
      }
      this.assertContext(user, expectedContext, expectedSession);
      if (action.op === "start")
        this.startTraining(user, source, action.reset ?? false);
      else if (action.op === "stop") this.stopTraining(user);
      else this.scenario(user, { kind: action.kind, session: action.session });
      const training = this.training(user);
      if (!training) return; // A stop before the first practice is an inert no-op.
      training.controlCommands[action.id] = fingerprint;
      const ids = Object.keys(training.controlCommands);
      for (const id of ids.slice(0, Math.max(0, ids.length - 256)))
        delete training.controlCommands[id];
      this.writeTraining(user, training);
    });
  }
  decorate<
    T extends {
      save: Save;
      workspace: {
        owner: string;
        canManage: boolean;
        members: unknown[];
        invitations: unknown[];
        outgoing: unknown[];
      };
      network: object;
    },
  >(user: string, view: T) {
    const training = this.training(user);
    const save = training?.active ? publicSave(training.save) : view.save;
    return {
      ...view,
      save,
      playContext: training?.contextRevision ?? 0,
      tutorial: this.view(user, save),
      training: training?.active
        ? { session: training.session, active: true as const }
        : null,
      ...(training?.active
        ? {
            workspace: {
              ...view.workspace,
              owner: user,
              canManage: true,
              members: [],
              invitations: [],
              outgoing: [],
            },
            network: {
              ...view.network,
              friends: [],
              support: [],
              requests: [],
              neighbors: [],
            },
          }
        : {}),
    };
  }
  command(user: string, input: unknown, expectedSession: string) {
    const { id, action } = commandSchema.parse(input);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(action))
      .digest("hex");
    this.atomic(() => {
      const training = this.training(user);
      if (!training?.active || training.session !== expectedSession)
        throw Error("Übungssitzung ist nicht mehr aktiv. Bitte neu verbinden.");
      if (training.commands[id]) {
        if (training.commands[id] !== fingerprint)
          throw Error(
            "Aktions-ID bereits für eine andere Übungsaktion benutzt.",
          );
        return;
      }
      if (Object.keys(training.commands).length >= 5000)
        throw Error(
          "Diese Übung enthält bereits 5000 Aktionen. Eine neue Übung starten.",
        );
      const save = training.save;
      if (action.type === "dispatch") {
        const mission = save.missions.find((m) => m.id === action.mission);
        if (!mission) throw Error("Eigener Übungseinsatz fehlt.");
        alarm(
          save,
          mission,
          action.vehicles,
          user,
          action.priority,
          action.alarm,
          action.travel,
        );
      } else if (
        deskActions.some((schema) => schema.shape.type.value === action.type) &&
        !action.type.startsWith("member-")
      ) {
        deskCommand(save, action as DeskAction, user);
      } else if (
        [
          "purchase-facility",
          "buy",
          "buy-batch",
          "water-source",
          "vehicle-service",
          "upgrade",
          "extension",
          "rename",
          "sell",
          "move",
          "favorite",
          "recall",
        ].includes(action.type)
      ) {
        apply(save, action as Action);
      } else
        throw Error(
          "Diese Aktion gehört zur echten Leitstellenverwaltung und ist in der isolierten Übung gesperrt.",
        );
      save.revision++;
      syncFms(save);
      training.commands[id] = fingerprint;
      this.writeTraining(user, training);
    });
  }
  scenario(user: string, input: unknown) {
    const { kind, session } = z
      .object({ kind: z.enum(["technical", "fire"]), session: z.uuid() })
      .strict()
      .parse(input);
    this.atomic(() => {
      const training = this.training(user);
      if (!training?.active || training.session !== session)
        throw Error("Keine aktive persönliche Übung.");
      const s = training.save;
      if (training.scenarios.includes(kind)) {
        // Earlier practice envelopes used a bin fire without a force deficit.
        // Keep that incident intact and allow one real field-fire follow-up
        // after it closes, without resetting the user's world or progression.
        if (
          kind !== "fire" ||
          [...s.missions, ...s.archive].some((m) => m.template === "field")
        )
          return;
      }
      if (s.missions.length)
        throw Error("Zuerst den laufenden Übungseinsatz abschließen.");
      const home = s.buildings.find(
        (b) =>
          b.type === "fire" &&
          b.ready <= s.time &&
          s.vehicles.some(
            (v) =>
              v.home === b.id &&
              (kind === "technical"
                ? (vt(v.type).skills.pump ?? 0) >= 1
                : (vt(v.type).skills.fire ?? 0) >= 1),
          ),
      );
      if (!home)
        throw Error(
          "Für die Übung zuerst eine fertige Feuerwache mit einem geeigneten Fahrzeug bereitstellen (technische Hilfe: Pumpe; Brand: Löschfähigkeit).",
        );
      if (kind === "fire" && !training.scenarios.includes("technical"))
        throw Error("Zuerst die technische Übung abschließen.");
      const scale = kind === "fire" ? 1 / METERS_PER_UNIT : 1;
      const anchor =
        nodes[
          nearest({ x: home.pos.x + 350 * scale, y: home.pos.y + 200 * scale })
        ];
      if (!anchor || distance(anchor, home.pos) > 2500 * scale)
        throw Error(
          "Am Standort ist kein naher Straßenpunkt für die Übung verfügbar.",
        );
      const template = mt(kind === "technical" ? "cellar" : "field");
      const mission: Mission = {
        id: simId(s),
        round: simId(s),
        template: template.id,
        paymentCents: template.reward,
        pos: { x: anchor.x, y: anchor.y },
        progress: 0,
        phase: "offered",
        created: s.time,
        completed: 0,
        shared: false,
        contributors: [],
        transports: [],
      };
      s.missions.push(mission);
      attachIncident(s, mission);
      attachDynamics(s, mission);
      attachOrganizations(mission);
      if (!training.scenarios.includes(kind)) training.scenarios.push(kind);
      s.revision++;
      this.writeTraining(user, training);
    });
  }
  step(now = Date.now()) {
    withAutomaticRouting(() =>
      this.atomic(() => {
        for (const row of this.db.sql
          .prepare("SELECT user_id,payload,updated_at FROM training_worlds")
          .all()) {
          const training = trainingStateSchema.parse(
            JSON.parse(String(row.payload)),
          );
          if (training.save.player.id !== String(row.user_id))
            throw Error("Fremder persönlicher Übungsstand.");
          if (!training.active) continue;
          const seconds = Math.max(
            0,
            Math.min(14400, (now - Number(row.updated_at)) / 1000),
          );
          if (!seconds) continue;
          tick(
            training.save,
            training.save.time + seconds,
            {},
            false,
            false,
            {},
            new Set(),
            {},
            true,
          );
          training.save.revision++;
          this.writeTraining(String(row.user_id), training, now);
        }
      }),
    );
  }
}
