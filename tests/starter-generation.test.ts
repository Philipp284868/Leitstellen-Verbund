import { fixturePurchase } from "./fixtures/germany/facilities";
import { describe, expect, it } from "vitest";
import { Database } from "../src/server/database";
import { Game } from "../src/server/game";
import { apply, tick } from "../src/shared/engine";
import { fresh, validate } from "../src/shared/model";
import {
  callLoad,
  pacedDelay,
  prepareCallPacing,
  recordIncidentCreated,
} from "../src/simulation/pacing";
import {
  advanceSituation,
  createSituation,
} from "../src/simulation/world-situation";
import { sites } from "./fixtures/germany/locations";
import { fixtureMission } from "./fixtures/germany/mission";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function starter() {
  const s = fresh("Neustart", "Feuerwache", Date.UTC(2026, 8, 10, 12) / 1000);
  s.seed = 123;
  s.generation = "11111111-2222-4333-8444-555555555555";
  s.player.id = "starter";
  apply(s, fixturePurchase("fire", sites[0]));
  tick(s, s.time + 30, {}, false, false);
  apply(s, { type: "buy", kind: "tsf", home: s.buildings[0].id });
  return s;
}

describe("Notrufstart mit einer neuen Feuerwache und einem TSF-W", () => {
  it("variiert Last und Wetter innerhalb spielbarer Intervallgrenzen", () => {
    const s = starter();
    expect(callLoad(s).available).toBe(1);
    for (const hour of [0, 12, 23]) {
      s.time = Date.UTC(2026, 8, 10, hour) / 1000;
      s.buildings[0].ready = s.time;
      for (const profile of ["quiet", "normal", "storm"] as const) {
        for (const elapsed of [0, 2000, 4500]) {
          s.worldSituation = advanceSituation(
            createSituation(s.time, 123, profile),
            elapsed,
          );
          for (let seed = 1; seed <= 100; seed++) {
            const delay = pacedDelay(seed, s);
            expect(delay).toBeGreaterThanOrEqual(20);
            expect(delay).toBeLessThanOrEqual(360);
          }
        }
      }
    }
  });

  it("speichert nach dem ersten Notruf kein zwanzigminütiges Folgeintervall", () => {
    const s = starter();
    s.worldSituation = createSituation(s.time, 123, "quiet");
    prepareCallPacing(s, 0);
    s.missions.push(fixtureMission(s, "bin"));
    recordIncidentCreated(s);
    expect(s.missionWait).toBeGreaterThanOrEqual(20);
    expect(s.missionWait).toBeLessThanOrEqual(360);
  });

  it("liefert echte Notrufe und begrenzt eine neue Wache nicht auf einen Einsatz", () => {
    const s = starter();
    const db = new Database("", { memory: true });
    try {
      db.sql
        .prepare(
          "INSERT INTO users(id,username,password,role,created) VALUES (?,?,?,?,?)",
        )
        .run(s.player.id, "starter", "unused", "player", 0);
      db.save(s.player.id, s);
      const game = new Game(db, () => true);
      game.step(1);
      const start = db.all().get(s.player.id)!.time;
      for (
        let i = 0;
        i < 360 && !db.all().get(s.player.id)!.missions.length;
        i++
      )
        game.step(1);
      const generated = db.all().get(s.player.id)!;
      expect(generated.missions).toHaveLength(1);
      const mission = generated.missions[0];
      expect(mission.created - start).toBeGreaterThanOrEqual(20);
      expect(mission.created - start).toBeLessThanOrEqual(360);
      expect(mission.location?.state).toBe("verified");
      expect(mission.control?.calls[0].state).toBe("ringing");
      for (let i = 0; i < 30; i++) game.step(60);
      expect(db.all().get(s.player.id)!.missions.length).toBeGreaterThan(2);
      expect(db.all().get(s.player.id)!.callPacing!.sequence).toBeGreaterThan(
        2,
      );
    } finally {
      db.close();
    }
  });

  it("verkürzt alte überlange Fristen einmalig und erhält Zufall, Fortschritt und kurze Fristen", () => {
    const s = starter();
    s.callPacing = {
      version: 1,
      notBefore: s.time + 1200,
      lastCreated: 0,
      sequence: 0,
    };
    s.missionWait = 1200;
    s.worldSituation = createSituation(s.time, 123, "quiet");
    const original = structuredClone(s);
    prepareCallPacing(s, 1);
    expect(s.callPacing.version).toBe(3);
    expect(s.missionWait).toBeGreaterThanOrEqual(20);
    expect(s.missionWait).toBeLessThanOrEqual(360);
    const resumed = validate(JSON.parse(JSON.stringify(s)));
    for (let i = 0; i < 10; i++) prepareCallPacing(resumed, 0);
    expect(resumed.callPacing).toEqual(s.callPacing);
    for (const key of [
      "seed",
      "money",
      "xp",
      "buildings",
      "vehicles",
      "missions",
      "archive",
    ] as const)
      expect(s[key]).toEqual(original[key]);
    resumed.callPacing = {
      ...resumed.callPacing!,
      version: 1,
      notBefore: resumed.time + 20,
    };
    prepareCallPacing(resumed, 1);
    expect(resumed.callPacing.notBefore).toBe(resumed.time + 20);
  });

  it("liefert nach SQLite-Neustart und wiederholten Ansichten denselben ersten Einsatz wie ohne Unterbrechung", () => {
    const directory = mkdtempSync(join(tmpdir(), "lv-starter-restart-"));
    let db = new Database(directory);
    const continuous = new Database("", { memory: true });
    const s = starter();
    try {
      for (const database of [db, continuous]) {
        database.sql
          .prepare(
            "INSERT INTO users(id,username,password,role,created) VALUES (?,?,?,?,?)",
          )
          .run(s.player.id, "starter", "unused", "player", 0);
        database.save(s.player.id, s);
      }
      for (const database of [db, continuous]) {
        const game = new Game(database, () => true);
        // Five-second server slices retain the same simulated interval without
        // hundreds of redundant durable commits in the disk-backed restart test.
        for (let i = 0; i < 24; i++) game.step(5);
      }
      const deadline = db.all().get(s.player.id)!.callPacing!.notBefore;
      db.close();
      db = new Database(directory);
      const resumed = new Game(db, () => true);
      for (let i = 0; i < 10; i++)
        resumed.view(s.player.id, new Set([s.player.id]));
      expect(db.all().get(s.player.id)!.callPacing!.notBefore).toBe(deadline);
      for (const game of [resumed, new Game(continuous, () => true)])
        for (let i = 0; i < 96; i++) game.step(5);
      const after = db.all().get(s.player.id)!;
      expect(after.missions.length).toBeGreaterThanOrEqual(1);
      expect(after.missions).toEqual(
        continuous.all().get(s.player.id)!.missions,
      );
      expect(after.callPacing).toEqual(
        continuous.all().get(s.player.id)!.callPacing,
      );
      expect(after.seed).toBe(continuous.all().get(s.player.id)!.seed);
    } finally {
      db.close();
      continuous.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
