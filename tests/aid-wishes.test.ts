import { expect, it } from "vitest";
import { commandSchema, type ServerAction } from "../server/actions";
import { Auth } from "../server/auth";
import { Database } from "../server/database";
import { Game } from "../server/game";
import { validate } from "../src/model";
import { matchingAidType } from "../src/simulation/aid-matching";
import { organizationFixture } from "./mutual-aid-fixture";

it("freie Wünsche bleiben privat, werden übertragen und historisiert; geeignete Alternative bindet nur eigene stabile IDs", async () => {
  const db = new Database("memory", { memory: true });
  try {
    const auth = new Auth(db),
      ids = [] as string[];
    for (const username of ["wisher", "helper", "outsider"])
      ids.push(
        await auth.create(
          username,
          "Aid-wishes-test-password-123!",
          username,
          username,
        ),
      );
    const [owner, helper, other] = ids;
    db.save(owner, organizationFixture(owner, "field", "wishes-owner"));
    db.save(helper, organizationFixture(helper, "field", "wishes-helper"));
    const game = new Game(db);
    const command = (
      user: string,
      action: ServerAction,
      id = crypto.randomUUID(),
    ) => game.command(user, { id, action });
    const m = db.all().get(owner)!.missions[0],
      wishes = ["KatS-GW-SAN01", "Unbekannter Funkrufname <Test>"];
    command(owner, {
      type: "aid-draft",
      peer: helper,
      mission: m.id,
      types: ["tsf"],
      priority: "DRINGEND",
      message: "Bitte Löschunterstützung",
      vehicleWishes: wishes,
    });
    const r = db.all().get(owner)!.aid[0];
    expect(r.version).toBe(2);
    expect(r.vehicleWishes).toEqual(wishes);
    expect(game.view(helper, new Set()).network.requests).toHaveLength(0);
    expect(game.view(other, new Set()).network.requests).toHaveLength(0);
    command(owner, { type: "aid-send", id: r.id });
    expect(
      game.view(helper, new Set()).network.requests[0].vehicleWishes,
    ).toEqual(wishes);
    expect(
      db
        .all()
        .get(owner)!
        .missions[0].control!.events.filter(
          (e) => e.type === "AID_VEHICLE_WISH",
        )
        .map((e) => e.text),
    ).toEqual(
      wishes.map((w) => `Anfrage ${r.id} · Original-Fahrzeugwunsch: ${w}`),
    );
    const v = db.all().get(helper)!.vehicles[0];
    expect(v.type).toBe("hlf");
    const before = JSON.stringify(db.all().get(owner));
    expect(() =>
      command(other, { type: "aid-accept", owner, id: r.id, vehicles: [v.id] }),
    ).toThrow();
    expect(JSON.stringify(db.all().get(owner))).toBe(before);
    expect(() =>
      command(helper, {
        type: "aid-accept",
        owner,
        id: r.id,
        vehicles: [db.all().get(owner)!.vehicles[0].id],
      }),
    ).toThrow("Eigenes Fahrzeug");
    const action = {
        type: "aid-accept" as const,
        owner,
        id: r.id,
        vehicles: [v.id],
      },
      requestId = crypto.randomUUID();
    command(helper, action, requestId);
    command(helper, action, requestId);
    const assigned = db.all().get(owner)!.aid[0];
    expect(assigned.assignments).toHaveLength(1);
    expect(assigned.assignments[0]).toMatchObject({
      vehicle: v.id,
      type: "hlf",
      requestedType: "tsf",
      name: v.name,
    });
    command(helper, { type: "rename", id: v.id, name: "Neuer Funkrufname" });
    const restored = validate(JSON.parse(JSON.stringify(db.all().get(owner))));
    expect(restored.aid[0].vehicleWishes).toEqual(wishes);
    expect(restored.aid[0].assignments[0].name).toBe(v.name);
    expect(game.view(other, new Set()).network.requests).toHaveLength(0);
  } finally {
    db.close();
  }
});
it("Wunschfeld akzeptiert höchstens 20 Texte mit 80 Zeichen und keine Kontrollzeichen", () => {
  const base = {
    id: crypto.randomUUID(),
    action: {
      type: "aid-draft",
      peer: "helper",
      mission: "mission",
      types: ["ktwb"],
      priority: "NORMAL",
      message: "Hilfe",
    },
  };
  for (const wishes of [
    ["x".repeat(81)],
    Array(21).fill("NKTW"),
    ["Wunsch\u0000Befehl"],
    [""],
  ])
    expect(
      commandSchema.safeParse({
        ...base,
        action: { ...base.action, vehicleWishes: wishes },
      }).success,
    ).toBe(false);
  expect(
    commandSchema.safeParse({
      ...base,
      action: { ...base.action, vehicleWishes: ["KatS-NKTW01"] },
    }).success,
  ).toBe(true);
  expect(matchingAidType(["rtw"], "gwsan")).toBe(-1);
  expect(matchingAidType(["rtw"], "ktwb")).toBe(-1);
  expect(matchingAidType(["tsf"], "hlf")).toBe(0);
});
