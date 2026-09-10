import { fixturePurchase } from "./fixtures/germany/facilities";
import { describe, expect, it } from "vitest";
import { Auth } from "../server/auth";
import { Database } from "../server/database";
import { TutorialService } from "../server/tutorial";
import { vehicleAvailability } from "../src/simulation/availability";
import { sites as nodes } from "./fixtures/germany/locations";

import type { ServerAction } from "../server/actions";
import { ledgerBalance } from "../src/economy/ledger";
import { publicSave } from "../src/simulation/incidents";
import { newTutorial, tutorialReady } from "../src/tutorial-model";

async function setup() {
  const db = new Database("", { memory: true }),
    auth = new Auth(db);
  const user = await auth.create(
    "tutorial-owner",
    "Tutorial-password-123!",
    "Mara",
    "Nord",
  );
  const other = await auth.create(
    "tutorial-other",
    "Tutorial-password-123!",
    "Kai",
    "West",
  );
  const tutorial = new TutorialService(db),
    source = db.all().get(user)!;
  tutorial.startTraining(user, source);
  const session = String(
    JSON.parse(
      String(
        db.sql
          .prepare("SELECT payload FROM training_worlds WHERE user_id=?")
          .get(user)!.payload,
      ),
    ).session,
  );
  const command = (action: ServerAction, id = crypto.randomUUID()) =>
    tutorial.command(user, { id, action }, session);
  const advance = (seconds: number) =>
    tutorial.step(
      Number(
        db.sql
          .prepare("SELECT updated_at FROM training_worlds WHERE user_id=?")
          .get(user)!.updated_at,
      ) +
        seconds * 1000,
    );
  return { db, user, other, tutorial, source, session, command, advance };
}
describe("personal tutorial and authoritative practice", () => {
  it("restarts completed chapters without resetting the world, while skip and resume keep progress", async () => {
    const f = await setup();
    try {
      // A persisted, previously completed personal introduction.
      const completed = {
        ...newTutorial(),
        state: "complete" as const,
        chapter: 15,
        completed: Array.from({ length: 16 }, (_, i) => i),
        ui: ["pan", "zoom", "search", "finish"],
        updatedAt: 1,
      };
      const persist = () =>
        f.db.sql
          .prepare("UPDATE tutorial_progress SET payload=? WHERE user_id=?")
          .run(JSON.stringify(completed), f.user);
      persist();
      const beforeWorld = JSON.stringify([...f.db.all()]),
        beforePractice = JSON.stringify(f.tutorial.trainingSave(f.user));
      f.tutorial.control(f.user, { op: "skip" }, f.source);
      expect(f.tutorial.progress(f.user)).toMatchObject({
        state: "skipped",
        chapter: 15,
        completed: completed.completed,
        ui: completed.ui,
      });
      f.tutorial.control(f.user, { op: "resume" }, f.source);
      expect(f.tutorial.progress(f.user)).toMatchObject({
        state: "active",
        chapter: 15,
        completed: completed.completed,
        ui: completed.ui,
      });
      persist();
      f.tutorial.control(f.user, { op: "start" }, f.source);
      expect(f.tutorial.progress(f.user)).toMatchObject({
        state: "active",
        chapter: 0,
        completed: [],
        ui: [],
      });
      expect(JSON.stringify([...f.db.all()])).toBe(beforeWorld);
      expect(JSON.stringify(f.tutorial.trainingSave(f.user))).toBe(
        beforePractice,
      );
      f.tutorial.control(f.user, { op: "ui", kind: "pan" }, f.source);
      f.tutorial.control(f.user, { op: "start" }, f.source);
      expect(f.tutorial.progress(f.user).ui).toEqual(["pan"]);
    } finally {
      f.db.close();
    }
  });
  it("isolates purchases, duplicate actions, currency and experience from both real accounts", async () => {
    const f = await setup();
    try {
      const before = JSON.stringify([...f.db.all()]);
      const id = crypto.randomUUID(),
        build: ServerAction = fixturePurchase("fire", nodes[0]);
      f.command(build, id);
      f.command(build, id);
      expect(f.tutorial.trainingSave(f.user)!.buildings).toHaveLength(1);
      expect(() => f.command(fixturePurchase("ems", nodes[2]), id)).toThrow(
        /Aktions-ID/,
      );
      f.advance(40);
      const home = f.tutorial.trainingSave(f.user)!.buildings[0].id;
      f.command({ type: "buy", kind: "lf", home });
      const practice = f.tutorial.trainingSave(f.user)!;
      expect(practice.vehicles).toHaveLength(1);
      expect(ledgerBalance(practice)).toBe(practice.money);
      expect(
        vehicleAvailability(practice, practice.vehicles[0]).alarmable,
      ).toBe(true);
      expect(JSON.stringify([...f.db.all()])).toBe(before);
      expect(
        f.db.sql.prepare("SELECT COUNT(*) AS n FROM rewards").get()!.n,
      ).toBe(0);
      expect(
        f.db.sql.prepare("SELECT COUNT(*) AS n FROM mission_history").get()!.n,
      ).toBe(0);
      expect(() =>
        f.tutorial.command(
          f.other,
          {
            id: crypto.randomUUID(),
            action: { type: "buy", kind: "lf", home },
          },
          f.session,
        ),
      ).toThrow(/Übungssitzung/);
      expect(() =>
        f.command({ type: "member-invite", username: "tutorial-other" }),
      ).toThrow(/gesperrt/);
      expect(() => f.command({ type: "share", id: "foreign-mission" })).toThrow(
        /gesperrt/,
      );
    } finally {
      f.db.close();
    }
  });
  it("records personal steps only after actual evidence and rejects stale repeated advancement", async () => {
    const f = await setup();
    try {
      let s = f.tutorial.trainingSave(f.user)!;
      expect(tutorialReady(newTutorial(), s)).toBe(false);
      expect(() =>
        f.tutorial.control(f.user, { op: "next", chapter: 0 }, s),
      ).toThrow(/noch nicht/);
      for (const kind of ["pan", "zoom", "search"])
        f.tutorial.control(f.user, { op: "ui", kind }, s);
      f.tutorial.control(f.user, { op: "next", chapter: 0 }, s);
      expect(() =>
        f.tutorial.control(f.user, { op: "next", chapter: 0 }, s),
      ).toThrow(/geändert/);
      f.tutorial.control(f.user, { op: "ui", kind: "budget" }, s);
      f.tutorial.control(f.user, { op: "next", chapter: 1 }, s);
      expect(() =>
        f.tutorial.control(f.user, { op: "next", chapter: 2 }, s),
      ).toThrow(/noch nicht/);
      f.command(fixturePurchase("fire", nodes[0]));
      s = f.tutorial.trainingSave(f.user)!;
      f.tutorial.control(f.user, { op: "next", chapter: 2 }, s);
      expect(f.tutorial.progress(f.user).chapter).toBe(3);
      expect(f.tutorial.progress(f.other)).toEqual(newTutorial());
      f.tutorial.control(f.user, { op: "skip" }, s);
      const resumed = new TutorialService(f.db);
      expect(resumed.progress(f.user).state).toBe("skipped");
      resumed.control(f.user, { op: "resume" }, s);
      expect(resumed.progress(f.user).chapter).toBe(3);
    } finally {
      f.db.close();
    }
  });
  it("uses real calls, dispatch, FMS, radio, completion and private financial receipts", async () => {
    const f = await setup();
    try {
      const before = JSON.stringify([...f.db.all()]);
      f.command(fixturePurchase("fire", nodes[0]));
      f.advance(40);
      let s = f.tutorial.trainingSave(f.user)!;
      f.command({ type: "buy", kind: "lf", home: s.buildings[0].id });
      f.tutorial.scenario(f.user, { kind: "technical", session: f.session });
      f.tutorial.scenario(f.user, { kind: "technical", session: f.session });
      s = f.tutorial.trainingSave(f.user)!;
      expect(s.missions).toHaveLength(1);
      expect(publicSave(s).missions[0].paymentCents).toBeUndefined();
      const m = s.missions[0],
        call = m.control!.calls[0];
      expect(publicSave(s).missions[0].control!.secret).toBeUndefined();
      f.command({ type: "call", mission: m.id, call: call.id, op: "accept" });
      for (const question of [
        "address",
        "report",
        "people",
        "hazard",
      ] as const) {
        f.advance(12);
        f.command({
          type: "call",
          mission: m.id,
          call: call.id,
          op: "ask",
          question,
        });
      }
      f.command({ type: "call", mission: m.id, call: call.id, op: "end" });
      f.command({
        type: "dispatch",
        mission: m.id,
        vehicles: [s.vehicles[0].id],
        alarm: "dme",
        priority: "NORMAL",
        travel: "priority",
      });
      for (let i = 0; i < 120; i++) {
        f.advance(10);
        s = f.tutorial.trainingSave(f.user)!;
        const active = s.missions[0];
        if (!active) break;
        for (const request of active.control!.radio.filter(
          (r) => r.state === "open",
        )) {
          f.command({
            type: "radio",
            mission: active.id,
            id: request.id,
            op: "report",
          });
          f.command({
            type: "radio",
            mission: active.id,
            id: request.id,
            op: "close",
          });
        }
      }
      s = f.tutorial.trainingSave(f.user)!;
      expect(s.archive).toHaveLength(1);
      expect(s.archive[0].telemetry!.credits).toBeGreaterThan(0);
      expect(s.archive[0].telemetry!.xp).toBeGreaterThan(0);
      expect(s.economy!.fundingPaidCents).toBe(0);
      expect(ledgerBalance(s)).toBe(s.money);
      expect(JSON.stringify([...f.db.all()])).toBe(before);
      f.tutorial.stopTraining(f.user);
      expect(f.tutorial.trainingSave(f.user)).toBeNull();
      expect(() => f.command({ type: "sell", id: s.vehicles[0].id })).toThrow(
        /nicht mehr aktiv/,
      );
      const restored = new TutorialService(f.db);
      restored.startTraining(f.user, f.source);
      expect(restored.trainingSave(f.user)!.archive).toHaveLength(1);
    } finally {
      f.db.close();
    }
  });
});
