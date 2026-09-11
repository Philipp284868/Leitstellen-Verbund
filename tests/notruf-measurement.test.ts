import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { Database } from "../server/database";
import { Game } from "../server/game";
import { type Save } from "../src/model";
import { phaseFixture } from "./dispatch-fixture";
import { operate } from "./helpers/ideal-dispatcher";

export function callFixture(seed = 123, expanded = false): Save {
  const s = phaseFixture("measure-desk", "bin");
  s.seed = seed;
  s.time = 43200;
  s.xp = expanded ? 3000 : 0;
  s.vehicles = expanded ? s.vehicles : s.vehicles.slice(0, 1);
  if (!expanded) s.vehicles[0].type = "tsf";
  delete s.vehicles[0].supplies;
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

function measure(seed: number, expanded: boolean) {
  const s = callFixture(seed, expanded);
  const db = new Database(mkdtempSync(resolve(tmpdir(), "lv-call-measure-")));
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
            typeof unit.alarmed === "number" && Number.isFinite(unit.alarmed)
              ? Math.min(first, unit.alarmed)
              : first,
          Infinity,
        ),
      }))
      .filter((m) => Number.isFinite(m.alarmed) && Number.isFinite(m.created))
      .map((m) => m.alarmed - m.created)
      .sort((a, b) => a - b);
    const unassigned = end.missions.filter(
      (m) => !m.telemetry?.units.some((unit) => Number.isFinite(unit.alarmed)),
    );
    return {
      stage: expanded ? "expanded-fire-desk" : "initial-tsf",
      seed,
      incidentsPerHour: all.length,
      callsPerHour: calls.length,
      maxOpen,
      meanOpen: Math.round((openSum / 720) * 100) / 100,
      medianAnsweredWait: waits[Math.floor(waits.length / 2)] ?? null,
      medianAlarmWait: alarmWaits[Math.floor(alarmWaits.length / 2)] ?? null,
      p95AlarmWait:
        alarmWaits[
          Math.min(alarmWaits.length - 1, Math.floor(alarmWaits.length * 0.95))
        ] ?? null,
      unassignedAtEnd: unassigned.length,
      oldestUnassignedSeconds: unassigned.reduce(
        (oldest, m) => Math.max(oldest, end.time - m.created),
        0,
      ),
      busyPercent: Math.round((busySum / 720) * 1000) / 10,
      completed: end.completed,
      xpEarned: end.xp - s.xp,
    };
  } finally {
    db.close();
  }
}
const results: ReturnType<typeof measure>[] = [];
it.each(
  [false, true].flatMap((expanded) =>
    [123, 987, 4071].map((seed) => ({ expanded, seed })),
  ),
)(
  "erfasst eine reale Simulationsstunde mit Fuhrpark expanded=$expanded und Seed $seed",
  ({ seed, expanded }) => {
    results.push(measure(seed, expanded));
  },
  120000,
);
it("prüft die sechs vollständigen Stundenmessungen", () => {
  if (process.env.LV_CALL_MEASURE_OUT)
    writeFileSync(
      resolve(process.env.LV_CALL_MEASURE_OUT),
      JSON.stringify(results, null, 2),
    );
  expect(results).toHaveLength(6);
});
