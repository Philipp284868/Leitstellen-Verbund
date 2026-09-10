import { fixturePurchase } from "./fixtures/germany/facilities";
import { describe, expect, it } from "vitest";
import { Database } from "../server/database";
import { Game } from "../server/game";
import { fresh } from "../src/model";
import { sites as nodes } from "./fixtures/germany/locations";

import { bt, vt } from "../src/catalog";
import { bookMoney, ledgerBalance } from "../src/economy/ledger";
import { euro } from "../src/money";

function world() {
  const db = new Database("euro-test", { memory: true }),
    s = fresh("Euro", "Nord", 1000);
  s.player.id = "euro-owner";
  db.sql
    .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
    .run(s.player.id, "euro-owner", "unused", "player", 1);
  db.save(s.player.id, s);
  const game = new Game(db);
  const ids = new Map<string, string>();
  const run = (name: string, action: unknown) => {
    if (!ids.has(name)) ids.set(name, crypto.randomUUID());
    return game.command(s.player.id, { id: ids.get(name), action });
  };
  return {
    db,
    game,
    run,
    owner: s.player.id,
    read: () => db.all().get(s.player.id)!,
  };
}
describe("Serverautoritatives Euro-Budget", () => {
  it("verhindert doppelte Abbuchung und Doppelkäufe mehrerer Tabs mit einmaligen Aktionsbelegen", () => {
    const { db, game, run, read } = world();
    try {
      const start = read().money,
        action = fixturePurchase("fire", nodes[0]);
      run("build-once", action);
      run("build-once", action);
      expect(read().buildings).toHaveLength(1);
      expect(read().money).toBe(start - bt("fire").price);
      expect(read().buildings[0].purchasePriceCents).toBe(bt("fire").price);
      game.step(30);
      const s = read(),
        home = s.buildings[0].id;
      bookMoney(s, euro(180000) - s.money, "Testbudget für genau ein Fahrzeug");
      db.save(s.player.id, s);
      run("tab-a-buy", { type: "buy", kind: "tsf", home });
      expect(() =>
        run("tab-b-buy", { type: "buy", kind: "tsf", home }),
      ).toThrow(/Budget/);
      expect(read().vehicles).toHaveLength(1);
      expect(read().money).toBe(0);
      expect(read().vehicles[0].purchasePriceCents).toBe(vt("tsf").price);
      expect(ledgerBalance(read())).toBe(0);
      run("tab-a-buy", { type: "buy", kind: "tsf", home });
      expect(read().vehicles).toHaveLength(1);
      expect(() =>
        run("tab-a-buy", { type: "buy", kind: "tlf", home }),
      ).toThrow();
    } finally {
      db.close();
    }
  });
  it("gibt beim Verkauf 60 Prozent des gespeicherten Kaufwerts und keine Neubewertungsgewinne", () => {
    const { db, game, run, read } = world();
    try {
      run("build", fixturePurchase("fire", nodes[0]));
      game.step(30);
      run("buy", { type: "buy", kind: "tsf", home: read().buildings[0].id });
      const s = read(),
        v = s.vehicles[0];
      v.purchasePriceCents = euro(100000);
      db.save(s.player.id, s);
      const before = read().money;
      run("sell", { type: "sell", id: v.id });
      expect(read().money - before).toBe(euro(60000));
      expect(read().vehicles).toHaveLength(0);
      run("sell", { type: "sell", id: v.id });
      expect(read().money - before).toBe(euro(60000));
      expect(ledgerBalance(read())).toBe(read().money);
    } finally {
      db.close();
    }
  });
  it("behandelt gewöhnliche Finanzierung über mehrere Serverobjekte einmalig und erlaubt keine alten Förderklicks", () => {
    const { db, game, run, read } = world();
    try {
      const before = read().money;
      expect(() => run("manual-relief", { type: "relief" })).toThrow(
        /automatisch/,
      );
      game.step(900);
      expect(read().money - before).toBe(euro(30000));
      const next = read().economy!.fundingNextAt;
      const restarted = new Game(db);
      restarted.step(0);
      expect(read().money - before).toBe(euro(30000));
      expect(read().economy!.fundingNextAt).toBe(next);
      restarted.step(900);
      expect(read().money - before).toBe(euro(60000));
    } finally {
      db.close();
    }
  });
});
