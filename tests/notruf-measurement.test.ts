import { it, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../server/database";
import { Game } from "../server/game";
import { phaseFixture } from "./phase-fixture";
import { type Save } from "../src/model";
import { mt, vt } from "../src/catalog";
import { callAction } from "../src/simulation/calls";
import { radioAction } from "../src/simulation/incidents";
import { alarm } from "../src/simulation/dispatch";
import { readiness } from "../src/engine";
import { requirements } from "../src/simulation/hazards";

export function callFixture(seed = 123, expanded = false): Save {
  const s = phaseFixture("measure-desk", "bin");
  s.seed = seed;
  s.time = 43200;
  s.xp = expanded ? 3000 : 0;
  s.vehicles = expanded ? s.vehicles : s.vehicles.slice(0, 1);
  if (!expanded) s.vehicles[0].type = "tsf";
  if (!expanded)
    s.people = s.people
      .filter((p) => p.vehicle === s.vehicles[0].id)
      .slice(0, 6);
  s.missions = [];
  s.archive = [];
  s.missionWait = 0;
  s.nextMission = s.time;
  s.journal = [];
  s.completed = 0;
  for (const v of s.vehicles) {
    v.depart = 0;
    v.arrive = 0;
  }
  return s;
}

/** Reproducible ideal single dispatcher, using the real call, alarm and report
 * operations. No position, journey duration or completed mission is fabricated. */
function operate(s: Save) {
  const ordered = [...s.missions].sort((a, b) => a.created - b.created);
  const conversation = ordered.flatMap((m) =>
    (m.control?.calls || []).map((call) => ({ m, call })),
  );
  const active = conversation.find(({ call }) => call.state === "active");
  const next =
    active || conversation.find(({ call }) => call.state === "ringing");
  if (next) {
    const { m, call } = next;
    if (call.state === "ringing")
      callAction(s, m, call.id, "accept", s.player.id);
    else if (s.time >= call.nextAnswer) {
      const q = (
        ["calm", "report", "address", "people", "hazard"] as const
      ).find((q) => !call.asked.includes(q));
      if (q) callAction(s, m, call.id, "ask", s.player.id, q);
      else callAction(s, m, call.id, "end", s.player.id);
    }
  }
  for (const m of ordered) {
    const c = m.control;
    if (!c?.locationKnown || !c.reportedTemplate) continue;
    for (const r of c.radio.filter((r) => r.state === "open"))
      radioAction(
        s,
        m,
        r.id,
        r.reason === "arrival" ? "report" : "request",
        s.player.id,
      );
    const required = {
      ...(c.briefed ? requirements(m) : mt(c.reportedTemplate).requirements),
    };
    for (const v of s.vehicles.filter((v) => v.mission === m.id))
      for (const [k, n] of Object.entries(vt(v.type).skills))
        required[k] = Math.max(0, (required[k] || 0) - n);
    const chosen: string[] = [];
    for (const v of s.vehicles.filter((v) => !readiness(s, v))) {
      if (
        !Object.entries(vt(v.type).skills).some(
          ([k, n]) => n > 0 && required[k] > 0,
        )
      )
        continue;
      chosen.push(v.id);
      for (const [k, n] of Object.entries(vt(v.type).skills))
        required[k] = Math.max(0, (required[k] || 0) - n);
    }
    if (chosen.length) alarm(s, m, chosen, s.player.id);
  }
}

it("erfasst reproduzierbares Aufkommen mit tatsächlichen Fahrten und einem idealen Disponenten", () => {
  const results = [];
  for (const expanded of [false, true])
    for (const seed of [123, 987, 4071]) {
      const s = callFixture(seed, expanded);
      const db = new Database(
        mkdtempSync(resolve(tmpdir(), "lv-call-measure-")),
      );
      db.sql
        .prepare(
          "INSERT INTO users(id,username,password,role,created) VALUES (?,?,?,?,?)",
        )
        .run(s.player.id, "measure", "unused-test-account", "player", 0);
      db.save(s.player.id, s);
      const game = new Game(db);
      let maxOpen = 0,
        openSum = 0,
        busySum = 0;
      try {
        for (let i = 0; i < 720; i++) {
          const current = db.all().get(s.player.id)!;
          operate(current);
          db.save(s.player.id, current);
          game.step(5, (s.time + (i + 1) * 5) * 1000);
          const after = db.all().get(s.player.id)!;
          maxOpen = Math.max(maxOpen, after.missions.length);
          openSum += after.missions.length;
          busySum +=
            after.vehicles.filter((v) => v.status !== "ready").length /
            after.vehicles.length;
        }
        const end = db.all().get(s.player.id)!;
        const all = [...end.missions, ...end.archive];
        const calls = all.flatMap((m) => m.control?.calls || []);
        const waits = calls
          .filter((c) => c.started)
          .map((c) => c.started - c.created)
          .sort((a, b) => a - b);
        const alarmWaits = all
          .map((m) => ({
            created: m.created ?? NaN,
            alarmed: (m.telemetry?.units || []).reduce(
              (first, unit) =>
                typeof unit.alarmed === "number" &&
                Number.isFinite(unit.alarmed)
                  ? Math.min(first, unit.alarmed)
                  : first,
              Infinity,
            ),
          }))
          .filter(
            (m) => Number.isFinite(m.alarmed) && Number.isFinite(m.created),
          )
          .map((m) => m.alarmed - m.created)
          .sort((a, b) => a - b);
        const unassigned = end.missions.filter(
          (m) =>
            !m.telemetry?.units.some((unit) => Number.isFinite(unit.alarmed)),
        );
        results.push({
          stage: expanded ? "expanded-fire-desk" : "initial-tsf",
          seed,
          incidentsPerHour: all.length,
          callsPerHour: calls.length,
          maxOpen,
          meanOpen: Math.round((openSum / 720) * 100) / 100,
          medianAnsweredWait: waits[Math.floor(waits.length / 2)] ?? null,
          medianAlarmWait:
            alarmWaits[Math.floor(alarmWaits.length / 2)] ?? null,
          p95AlarmWait:
            alarmWaits[
              Math.min(
                alarmWaits.length - 1,
                Math.floor(alarmWaits.length * 0.95),
              )
            ] ?? null,
          unassignedAtEnd: unassigned.length,
          oldestUnassignedSeconds: unassigned.reduce(
            (oldest, m) => Math.max(oldest, end.time - m.created),
            0,
          ),
          busyPercent: Math.round((busySum / 720) * 1000) / 10,
          completed: end.completed,
          xpEarned: end.xp - s.xp,
        });
      } finally {
        db.close();
      }
    }
  if (process.env.LV_CALL_MEASURE_OUT)
    writeFileSync(
      resolve(process.env.LV_CALL_MEASURE_OUT),
      JSON.stringify(results, null, 2),
    );
  expect(results).toHaveLength(6);
}, 120000);
