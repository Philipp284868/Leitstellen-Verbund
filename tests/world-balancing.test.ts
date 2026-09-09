import { expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "../server/database";
import { Game } from "../server/game";
import { writeWorldSituation } from "../server/world-situation";
import {
  createSituation,
  type SituationProfile,
} from "../src/simulation/world-situation";
import { incidentCategory } from "../src/simulation/incident-selection";
import { mt } from "../src/catalog";
import { phaseFixture } from "./phase-fixture";
import { addUnit } from "./phase-four-fixture";
import { operate } from "./helpers/ideal-dispatcher";
import { callLoad } from "../src/simulation/pacing";
import { apply } from "../src/engine";
import { nodes } from "../src/world";

it("misst ruhigen Einstieg, Normalbetrieb, steigenden Sturm, Hauptphase und Rückstauabbau mit festen Seeds", () => {
  const results = [];
  const step = 15;
  for (const expanded of [false, true])
    for (const seed of process.env.LV_WORLD_MEASURE_SEED
      ? [Number(process.env.LV_WORLD_MEASURE_SEED)]
      : [123, 987, 4071]) {
      const s = phaseFixture("measure-desk", "bin");
      s.seed = seed;
      s.time = 43200;
      s.missions = [];
      s.archive = [];
      s.missionWait = 0;
      s.nextMission = s.time;
      s.journal = [];
      s.completed = expanded ? 3 : 0;
      if (expanded) {
        for (const kind of ["hlf", "lf", "rtw", "rtw", "nef", "gkw"])
          addUnit(s, kind);
        apply(s, { type: "build", kind: "hospital", pos: nodes[10] });
        s.buildings.find((b) => b.type === "hospital")!.ready = s.time;
      } else {
        s.vehicles = s.vehicles.slice(0, 1);
        s.vehicles[0].type = "tsf";
        s.people = s.people
          .filter((p) => p.vehicle === s.vehicles[0].id)
          .slice(0, 6);
      }
      const db = new Database("", { memory: true });
      try {
        db.sql
          .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
          .run(s.player.id, "measure", "unused-test-account", "player", 0);
        db.save(s.player.id, s);
        const game = new Game(db);
        for (const segment of [
          { profile: "quiet", seconds: 3600 },
          { profile: "normal", seconds: 3600 },
          { profile: "storm", seconds: 6000 },
        ] as { profile: SituationProfile; seconds: number }[]) {
          const current = db.all().get(s.player.id)!;
          if (process.env.LV_WORLD_MEASURE_OUT)
            writeFileSync(
              resolve(
                `${process.env.LV_WORLD_MEASURE_OUT}.${expanded}-${seed}-${segment.profile}.snapshot.json`,
              ),
              JSON.stringify(current),
            );
          writeWorldSituation(
            db.sql,
            createSituation(current.time, seed, segment.profile),
          );
          const buckets = new Map<
            string,
            {
              seconds: number;
              calls: number;
              mix: Record<string, number>;
              maxOpen: number;
              busy: number;
              credits: number;
              xp: number;
              firstBacklogClear: number | null;
              backlog: Set<string>;
              patients: number;
            }
          >();
          let previousPhase = "",
            lastMoney = current.money,
            lastXp = current.xp;
          const seenCalls = new Set(
            [...current.missions, ...current.archive].flatMap((m) =>
              (m.control?.calls ?? []).map((c) => c.id),
            ),
          );
          const seenMissions = new Set(
            [...current.missions, ...current.archive].map((m) => m.id),
          );
          for (let n = 0; n < segment.seconds / step; n++) {
            const before = db.all().get(s.player.id)!;
            operate(before);
            db.save(s.player.id, before);
            game.step(step);
            const after = db.all().get(s.player.id)!,
              phase =
                segment.profile === "storm"
                  ? n === 0
                    ? "announcement"
                    : before.worldSituation!.phase
                  : segment.profile;
            const b = buckets.get(phase) ?? {
              seconds: 0,
              calls: 0,
              mix: {},
              maxOpen: 0,
              busy: 0,
              credits: 0,
              xp: 0,
              firstBacklogClear: null,
              backlog: new Set<string>(),
              patients: 0,
            };
            if (phase !== previousPhase) {
              b.backlog = new Set(after.missions.map((m) => m.id));
              previousPhase = phase;
            }
            b.seconds += step;
            b.maxOpen = Math.max(b.maxOpen, after.missions.length);
            b.busy +=
              after.vehicles.filter((v) => v.status !== "ready").length /
              after.vehicles.length;
            expect(after.missions.length).toBeLessThanOrEqual(
              callLoad(after).maxOpen,
            );
            b.credits += after.money - lastMoney;
            b.xp += after.xp - lastXp;
            lastMoney = after.money;
            lastXp = after.xp;
            for (const m of [...after.missions, ...after.archive]) {
              if (!seenMissions.has(m.id)) {
                seenMissions.add(m.id);
                const k = incidentCategory(mt(m.template));
                b.mix[k] = (b.mix[k] ?? 0) + 1;
                b.patients += m.dynamics?.patients.length ?? 0;
              }
              for (const c of m.control?.calls ?? [])
                if (!seenCalls.has(c.id)) {
                  seenCalls.add(c.id);
                  b.calls++;
                }
            }
            if (
              b.firstBacklogClear === null &&
              [...b.backlog].every(
                (id) => !after.missions.some((m) => m.id === id),
              )
            )
              b.firstBacklogClear = b.seconds;
            buckets.set(phase, b);
          }
          if (process.env.LV_WORLD_MEASURE_OUT)
            writeFileSync(
              resolve(
                `${process.env.LV_WORLD_MEASURE_OUT}.${expanded}-${seed}-${segment.profile}.end.json`,
              ),
              JSON.stringify(db.all().get(s.player.id)!),
            );
          for (const [phase, b] of buckets)
            results.push({
              fleet: expanded ? "expanded-8" : "initial-tsf",
              seed,
              profile: segment.profile,
              phase,
              seconds: b.seconds,
              calls: b.calls,
              callsPerHour: Math.round((b.calls / b.seconds) * 36000) / 10,
              mix: b.mix,
              patients: b.patients,
              maxOpen: b.maxOpen,
              busyPercent:
                Math.round((b.busy / (b.seconds / step)) * 1000) / 10,
              backlogAtStart: b.backlog.size,
              backlogClearSeconds: b.firstBacklogClear,
              euros: b.credits / 100,
              xp: b.xp,
            });
        }
      } finally {
        db.close();
      }
    }
  if (process.env.LV_WORLD_MEASURE_OUT)
    writeFileSync(
      resolve(process.env.LV_WORLD_MEASURE_OUT),
      JSON.stringify(results, null, 2),
    );
  expect(
    results.some(
      (r) => r.profile === "storm" && r.phase === "peak" && r.calls > 0,
    ),
  ).toBe(true);
  expect(
    results
      .filter((r) => r.fleet === "initial-tsf" && r.profile === "quiet")
      .every((r) => r.maxOpen <= 1),
  ).toBe(true);
  expect(results.some((r) => r.fleet === "expanded-8" && r.patients > 0)).toBe(
    true,
  );
  expect(
    results
      .filter((r) => r.fleet === "expanded-8" && r.phase === "recovery")
      .every((r) => r.backlogClearSeconds !== null),
  ).toBe(true);
  expect(
    results.some(
      (r) =>
        r.fleet === "expanded-8" &&
        r.phase === "peak" &&
        (r.mix.technical ?? 0) > 0,
    ),
  ).toBe(true);
}, 240000);
