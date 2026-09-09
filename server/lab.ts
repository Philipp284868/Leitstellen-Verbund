import { xpForLevel } from "../src/progression";
// Offline developer sandbox. Never imported by the HTTP server or client.
import { z } from "zod";
import { createHash } from "node:crypto";
import { fresh, validate, saveSchema, type Save } from "../src/model";
import { apply, tick, readiness } from "../src/engine";
import { nodes, nearest } from "../src/world";
import { mt } from "../src/catalog";
import { simId, record } from "../src/simulation/events";
import { attachIncident, callAction } from "../src/simulation/calls";
import { attachDynamics } from "../src/simulation/dynamics";
import { attachOrganizations } from "../src/simulation/organizations";
import { alarm } from "../src/simulation/dispatch";
import { radioAction } from "../src/simulation/incidents";
import { environmentAt } from "../src/simulation/weather";
import { weatherKinds } from "../src/simulation/dynamics-schema";
import { breakVehicle, repairVehicle } from "../src/simulation/faults";
import { setFms } from "../src/simulation/fms";
import { personDuty } from "../src/simulation/staffing";
import { forceVolunteerAvailability } from "../src/simulation/volunteers";
import { newPatient } from "../src/simulation/patients";
import { declareMajor } from "../src/simulation/major-incidents";
import { aidCommand } from "./aid";
import { stepLaboratoryWorlds } from "./lab-worlds";
const id = z.string().min(1).max(100);
export const labActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("generate"), template: id }).strict(),
  z
    .object({
      type: z.literal("advance"),
      seconds: z.number().int().min(1).max(14400),
    })
    .strict(),
  z
    .object({ type: z.literal("clock"), hour: z.number().int().min(0).max(23) })
    .strict(),
  z.object({ type: z.literal("weather"), kind: z.enum(weatherKinds) }).strict(),
  z.object({ type: z.literal("escalate"), mission: id }).strict(),
  z.object({ type: z.literal("interview"), mission: id }).strict(),
  z
    .object({
      type: z.literal("dispatch"),
      mission: id,
      vehicles: z.array(id).min(1).max(30),
    })
    .strict(),
  z.object({ type: z.literal("brief"), mission: id }).strict(),
  z.object({ type: z.literal("damage"), vehicle: id }).strict(),
  z.object({ type: z.literal("repair"), vehicle: id }).strict(),
  z
    .object({
      type: z.literal("fms"),
      vehicle: id,
      code: z.number().int().min(0).max(9),
    })
    .strict(),
  z
    .object({
      type: z.literal("patient"),
      mission: id,
      patient: id,
      health: z.number().min(0).max(100),
    })
    .strict(),
  z.object({ type: z.literal("crew-ready") }).strict(),
  z
    .object({
      type: z.literal("volunteers"),
      available: z.boolean(),
      seconds: z.number().int().min(1).max(14400),
    })
    .strict(),
  z
    .object({
      type: z.literal("new-patient"),
      mission: id,
      injury: z.string().min(1).max(120),
    })
    .strict(),
  z.object({ type: z.literal("major"), mission: id }).strict(),
  z
    .object({
      type: z.literal("neighbor"),
      seed: z.number().int().min(0).max(4294967295),
    })
    .strict(),
  z
    .object({
      type: z.literal("neighbor-response"),
      mission: id,
      neighbor: id,
      accept: z.boolean(),
    })
    .strict(),
]);
export type LabAction = z.infer<typeof labActionSchema>;
export const labSchema = z
  .object({
    format: z.literal("leitstellen-dev-sandbox"),
    version: z.literal(1),
    seed: z.number().int().min(0).max(4294967295),
    commands: z.array(labActionSchema).max(2000),
    hashes: z.array(z.string().length(64)).max(2000),
    save: saveSchema,
    neighbors: z.array(saveSchema).max(4).default([]),
  })
  .strict();
export type Lab = z.infer<typeof labSchema>;
export const stateHash = (s: Save) =>
  createHash("sha256")
    .update(JSON.stringify(validate(s)))
    .digest("hex");
const laboratoryHash = (lab: Lab) =>
  lab.neighbors.length
    ? createHash("sha256")
        .update(
          [stateHash(lab.save), ...lab.neighbors.map(stateHash)].join(":"),
        )
        .digest("hex")
    : stateHash(lab.save);
export function createLab(seed: number): Lab {
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295)
    throw Error("Seed muss eine 32-Bit-Ganzzahl sein.");
  let s = fresh("Entwicklung", "Lokale Simulation", 1000);
  s.player.id = "developer";
  s.generation = `lab-${seed}`;
  s.seed = seed;
  s.tutorial = 6;
  s.xp = xpForLevel(6);
  apply(s, { type: "build", kind: "fire", pos: nodes[0] });
  tick(s, s.time + 30, {}, false, false);
  for (const [kind, count] of [
    ["tsf", 6],
    ["tlf", 3],
  ] as const) {
    apply(s, { type: "buy", kind, home: s.buildings[0].id });
    apply(s, { type: "hire", count, home: s.buildings[0].id });
    apply(s, { type: "assign", vehicle: s.vehicles.at(-1)!.id });
  }
  const objects = [...s.buildings, ...s.vehicles, ...s.people, ...s.journal];
  const ids = new Map(objects.map((o, i) => [o.id, `lab-${seed}-object-${i}`]));
  s = validate(
    JSON.parse(
      JSON.stringify(s, (_key, value) =>
        typeof value === "string" ? (ids.get(value) ?? value) : value,
      ),
    ),
  );
  return {
    format: "leitstellen-dev-sandbox",
    version: 1,
    seed,
    commands: [],
    hashes: [],
    save: s,
    neighbors: [],
  };
}
export function runLab(source: Lab, input: unknown): Lab {
  const lab = structuredClone(labSchema.parse(source)),
    action = labActionSchema.parse(input),
    s = lab.save;
  if (lab.commands.length >= 2000)
    throw Error("Maximal 2000 Entwickleraktionen je Datei.");
  const mission =
    "mission" in action
      ? s.missions.find((m) => m.id === action.mission)
      : undefined;
  const vehicle =
    "vehicle" in action
      ? s.vehicles.find((v) => v.id === action.vehicle)
      : undefined;
  if ("mission" in action && !mission) throw Error("Einsatz fehlt.");
  if ("vehicle" in action && !vehicle) throw Error("Fahrzeug fehlt.");
  if (action.type === "generate") {
    mt(action.template);
    const m = {
      id: simId(s),
      template: action.template,
      pos: nodes[2],
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
  } else if (action.type === "advance") {
    const [own, ...neighbors] = stepLaboratoryWorlds(
      [s, ...lab.neighbors],
      action.seconds,
    );
    Object.assign(s, own);
    lab.neighbors = neighbors;
  } else if (action.type === "clock") {
    let seconds = (action.hour * 3600 - (s.time % 86400) + 86400) % 86400;
    while (seconds > 0) {
      const step = Math.min(seconds, 14400);
      const [own, ...neighbors] = stepLaboratoryWorlds(
        [s, ...lab.neighbors],
        step,
      );
      Object.assign(s, own);
      lab.neighbors = neighbors;
      seconds -= step;
    }
  } else if (action.type === "weather") {
    s.environment ??= environmentAt(s.time);
    s.environment.kind = action.kind;
    s.environment.wind =
      action.kind === "hurricane" ? 125 : action.kind === "gale" ? 80 : 15;
    s.environment.rain = ["rain", "heavy-rain", "storm"].includes(action.kind)
      ? 75
      : 0;
    s.environment.visibility = action.kind === "fog" ? 150 : 15000;
    for (const m of s.missions)
      record(
        s,
        m,
        "DEBUG_WEATHER",
        `Entwicklerwetter: ${action.kind}.`,
        "developer",
      );
  } else if (action.type === "escalate") {
    if (!mission!.dynamics?.active) throw Error("Keine dynamische Lage.");
    for (const h of mission!.dynamics.hazards) {
      h.value = Math.max(h.value, 85);
      h.resolved = false;
    }
    record(
      s,
      mission!,
      "DEBUG_ESCALATION",
      "Gefahren für die lokale Prüfung erhöht.",
      "developer",
    );
  } else if (action.type === "interview") {
    let m = mission!;
    const c = m.control?.calls[0];
    if (!c) throw Error("Notruf fehlt.");
    callAction(s, m, c.id, "accept", "developer");
    for (const question of ["address", "report"] as const) {
      const [own, ...neighbors] = stepLaboratoryWorlds(
        [s, ...lab.neighbors],
        5,
      );
      Object.assign(s, own);
      lab.neighbors = neighbors;
      m = s.missions.find((current) => current.id === action.mission)!;
      if (!m) throw Error("Einsatz während der Gesprächszeit abgeschlossen.");
      callAction(s, m, c.id, "ask", "developer", question);
    }
    callAction(s, m, c.id, "end", "developer");
  } else if (action.type === "dispatch")
    alarm(s, mission!, action.vehicles, "developer");
  else if (action.type === "brief") {
    const r = mission!.control?.radio.find(
      (r) => r.state === "open" && r.reason === "arrival",
    );
    if (!r) throw Error("Keine erste Lagemeldung vorhanden.");
    radioAction(s, mission!, r.id, "report", "developer");
  } else if (action.type === "damage") {
    if (!["travel", "scene", "transport"].includes(vehicle!.status))
      throw Error("Fahrzeug muss im Einsatz sein.");
    breakVehicle(s, vehicle!, "engine");
  } else if (action.type === "repair") repairVehicle(s, vehicle!, "developer");
  else if (action.type === "fms")
    setFms(s, vehicle!, action.code, "developer", "Lokale Entwicklerprüfung");
  else if (action.type === "patient") {
    const p = mission!.dynamics?.patients.find((p) => p.id === action.patient);
    if (!p) throw Error("Patient fehlt.");
    p.health = action.health;
    p.condition = !p.health
      ? "dead"
      : p.health < 25
        ? "critical"
        : p.health < 60
          ? "deteriorating"
          : "stable";
    record(
      s,
      mission!,
      "DEBUG_PATIENT",
      `Patient ${p.id}: Gesundheitswert ${p.health}.`,
      "developer",
    );
  } else if (action.type === "new-patient") {
    if (!mission!.dynamics?.active || mission!.dynamics.patients.length >= 30)
      throw Error("Keine freie Patientenposition in dieser Lage.");
    mission!.dynamics.patients.push(newPatient(s, mission!, action.injury));
    mission!.dynamics.aftermath = 0;
  } else if (action.type === "major") declareMajor(s, mission!, "developer");
  else if (action.type === "volunteers") {
    for (const p of s.people) p.duty = personDuty(s, p);
    forceVolunteerAvailability(s, action.available, action.seconds);
  } else if (action.type === "neighbor") {
    if (lab.neighbors.length >= 4)
      throw Error("Vier Nachbarleitstellen sind im Labor bereits vorhanden.");
    if (action.seed === lab.seed)
      throw Error(
        "Seed der Nachbarleitstelle darf nicht dem eigenen Seed gleichen.",
      );
    if (lab.neighbors.some((n) => n.player.id === `neighbor-${action.seed}`))
      throw Error(
        "Seed einer vorhandenen Nachbarleitstelle ist bereits in Verwendung.",
      );
    const neighbor = createLab(action.seed).save;
    neighbor.player.id = `neighbor-${action.seed}`;
    neighbor.player.station = `Labor-Nachbar ${action.seed}`;
    for (const b of neighbor.buildings) b.owner = neighbor.player.id;
    for (const v of neighbor.vehicles) v.owner = neighbor.player.id;
    neighbor.time = s.time;
    for (const p of neighbor.people) p.duty = personDuty(neighbor, p);
    forceVolunteerAvailability(neighbor, true, 14400);
    lab.neighbors.push(validate(neighbor));
  } else if (action.type === "neighbor-response") {
    const neighbor = lab.neighbors.find((n) => n.player.id === action.neighbor);
    if (!neighbor) throw Error("Labor-Nachbarleitstelle fehlt.");
    const saves = new Map([s, ...lab.neighbors].map((n) => [n.player.id, n]));
    const eligible = new Set(saves.keys()),
      units = action.accept
        ? neighbor.vehicles.filter((v) => !readiness(neighbor, v))
        : neighbor.vehicles;
    if (!units.length)
      throw Error("Nachbarleitstelle hat keine alarmierbaren Kräfte.");
    aidCommand(
      saves,
      s,
      {
        type: "aid-draft",
        mission: mission!.id,
        peer: neighbor.player.id,
        types: units.map((v) => v.type),
        priority: "DRINGEND",
        message: "Reproduzierbare Unterstützungsprüfung im lokalen Labor.",
      },
      "developer",
      eligible,
    );
    const request = s.aid.at(-1)!;
    aidCommand(
      saves,
      s,
      { type: "aid-send", id: request.id },
      "developer",
      eligible,
    );
    aidCommand(
      saves,
      neighbor,
      action.accept
        ? {
            type: "aid-accept",
            owner: s.player.id,
            id: request.id,
            vehicles: units.map((v) => v.id),
          }
        : {
            type: "aid-close",
            owner: s.player.id,
            id: request.id,
            op: "decline",
          },
      "developer",
      eligible,
    );
  } else if (action.type === "crew-ready") {
    for (const p of s.people) {
      p.duty = personDuty(s, p);
      p.duty.standby = true;
      p.duty.reachability = 100;
      p.duty.absence = "none";
      // Explicit lab preset: ready crews are already at their station.
      p.duty.homeNode = p.duty.workNode = nearest(
        s.buildings.find((b) => b.id === p.home)!.pos,
      );
    }
    forceVolunteerAvailability(s, true, 14400);
  }
  lab.save = validate(s);
  lab.commands.push(action);
  lab.hashes.push(laboratoryHash(lab));
  return lab;
}
export function verifyLab(lab: Lab) {
  if (lab.hashes.length !== lab.commands.length)
    throw Error("Aktions- und Prüfsummenanzahl unterscheiden sich.");
  let replay = createLab(lab.seed);
  for (const [index, action] of lab.commands.entries()) {
    replay = runLab(replay, action);
    if (replay.hashes[index] !== lab.hashes[index])
      throw Error(`Abweichung nach Aktion ${index + 1}.`);
  }
  if (laboratoryHash(replay) !== laboratoryHash(lab))
    throw Error("Endzustand weicht vom Replay ab.");
  return {
    verified: true,
    actions: lab.commands.length,
    hash: laboratoryHash(replay),
  };
}
