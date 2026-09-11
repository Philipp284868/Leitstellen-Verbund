import { afterEach, expect, it } from "vitest";
import { Database } from "../server/database";
import { Auth } from "../server/auth";
import { AccountLifecycle } from "../server/account-lifecycle";
import { fresh } from "../src/model";
import { phaseFixture } from "./dispatch-fixture";
import { Game } from "../server/game";
const resources: Database[] = [];
afterEach(() => {
  for (const db of resources.splice(0)) db.close();
});
async function setup() {
  const db = new Database("", { memory: true });
  resources.push(db);
  const auth = new Auth(db);
  const owner = await auth.create(
    "lifecycle",
    "account-password-123",
    "Player",
    "Leitstelle",
  );
  const other = await auth.create(
    "unaffected",
    "account-password-456",
    "Other",
    "Andere",
  );
  db.save(owner, phaseFixture(owner));
  return { db, owner, other, lifecycle: new AccountLifecycle(db) };
}
it.each(["reset", "delete"] as const)(
  "führt %s erst nach Passwort, gebundener Vorschau und exakter Bestätigung aus",
  async (operation) => {
    const { db, owner, other, lifecycle } = await setup();
    const original = db.all().get(other)!;
    await expect(
      lifecycle.prepare(owner, { operation, password: "wrong-password-123" }),
    ).rejects.toThrow();
    const p = await lifecycle.prepare(
      owner,
      { operation, password: "account-password-123" },
      1000,
    );
    expect(p.vehicles).toBe(2);
    const confirmation = {
      challenge: p.challenge,
      phrase: p.phrase,
      acknowledged: true,
    };
    expect(() => lifecycle.confirm(other, confirmation, 1001)).toThrow();
    expect(() =>
      lifecycle.confirm(owner, { ...confirmation, phrase: "ja" }, 1001),
    ).toThrow();
    expect(() =>
      lifecycle.confirm(owner, { ...confirmation, acknowledged: false }, 1001),
    ).toThrow();
    expect(lifecycle.confirm(owner, confirmation, 1002)).toEqual({
      ok: true,
      operation,
    });
    expect(() => lifecycle.confirm(owner, confirmation, 1003)).toThrow();
    expect(db.all().get(other)).toEqual(original);
    const remaining = db.all().get(owner);
    if (operation === "reset") {
      expect(remaining!.vehicles).toEqual([]);
      expect(remaining!.buildings).toEqual([]);
      expect(remaining!.missions).toEqual([]);
      expect(remaining!.money).toBe(fresh("a", "b", 1).money);
      expect(remaining!.xp).toBe(0);
      expect(
        db.sql.prepare("SELECT id FROM users WHERE id=?").get(owner),
      ).toBeDefined();
    } else
      expect(
        db.sql.prepare("SELECT id FROM users WHERE id=?").get(owner),
      ).toBeUndefined();
  },
);
it("verwirft abgelaufene und vor Neustart erteilte Bestätigungen", async () => {
  const { db, owner, lifecycle } = await setup();
  const p = await lifecycle.prepare(
    owner,
    { operation: "delete", password: "account-password-123" },
    0,
  );
  const input = {
    challenge: p.challenge,
    phrase: p.phrase,
    acknowledged: true,
  };
  expect(() => lifecycle.confirm(owner, input, 300001)).toThrow();
  expect(() => new AccountLifecycle(db).confirm(owner, input, 10)).toThrow();
  expect(db.all().has(owner)).toBe(true);
});
it("prüft gemeinsame Bindungen nochmals unmittelbar vor dem Löschen", async () => {
  const { db, owner, other, lifecycle } = await setup();
  const p = await lifecycle.prepare(owner, {
    operation: "delete",
    password: "account-password-123",
  });
  const s = db.all().get(owner)!;
  s.missions[0].contributors = [other];
  db.save(owner, s);
  expect(() =>
    lifecycle.confirm(owner, {
      challenge: p.challenge,
      phrase: p.phrase,
      acknowledged: true,
    }),
  ).toThrow(/gemeinsame/);
  expect(db.all().has(owner)).toBe(true);
});

it("beendet unbestätigte fremde Anfragen atomar und erhält deren Leitstelle", async () => {
  const { db, owner, other, lifecycle } = await setup();
  const neighbor = phaseFixture(other);
  neighbor.aid.push({
    version: 2,
    id: "pending-request",
    owner: other,
    peer: owner,
    mission: neighbor.missions[0].id,
    round: neighbor.missions[0].round,
    state: "SENT",
    priority: "NORMAL",
    types: ["lf"],
    vehicleWishes: [],
    message: "Hilfe",
    created: neighbor.time,
    updated: neighbor.time,
    assignments: [],
    messages: [],
  });
  db.save(other, neighbor);
  const before = db.all().get(other)!;
  const confirmation = await lifecycle.prepare(owner, {
    operation: "delete",
    password: "account-password-123",
  });
  lifecycle.confirm(owner, {
    challenge: confirmation.challenge,
    phrase: confirmation.phrase,
    acknowledged: true,
  });
  const after = db.all().get(other)!;
  expect(after).toEqual({
    ...before,
    aid: [{ ...before.aid[0], state: "CANCELLED" }],
  });
});

it("bucht einen Warenkorb per Server-UUID genau einmal und verwirft fremde Wachen vollständig", async () => {
  const { db, owner, other } = await setup(),
    game = new Game(db);
  const s = db.all().get(owner)!;
  s.buildings[0].level = 10;
  db.save(owner, s);
  const order = {
    id: crypto.randomUUID(),
    action: {
      type: "buy-batch",
      items: [{ kind: "lf", home: s.buildings[0].id, equipment: ["hose"] }],
    },
  };
  const foreign = db.all().get(other)!;
  expect(() => game.command(other, order)).toThrow();
  expect(db.all().get(other)).toEqual(foreign);
  game.command(owner, order);
  const bought = db.all().get(owner)!;
  game.command(owner, order);
  expect(db.all().get(owner)).toEqual(bought);
  expect(bought.vehicles.length).toBe(s.vehicles.length + 1);
  expect(bought.money).toBeLessThan(s.money);
});
