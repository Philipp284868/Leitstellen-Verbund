import { expect, it } from "vitest";
import { apply, tick } from "../src/shared/engine";
import { validate } from "../src/shared/model";
import {
  equipmentPrice,
  equipmentProfile,
  configuredSkills,
} from "../src/simulation/vehicle-equipment";
import {
  waterSupplyTick,
  ensureWaterSupply,
  waterTripTick,
} from "../src/simulation/water-supply";
import { attachDynamics } from "../src/simulation/dynamics";
import {
  maintenanceTick,
  serviceVehicle,
  wear,
} from "../src/simulation/vehicle-maintenance";
import {
  newOperatingBill,
  operatingCostTick,
} from "../src/simulation/operating-costs";
import { phaseFixture } from "./dispatch-fixture";
import { addUnit, atScene } from "./incident-dynamics-fixture";

it("prüft einen gemischten Warenkorb atomar inklusive Ausrüstung und wiederhergestellter Fähigkeiten", () => {
  const s = phaseFixture("buyer");
  const home = s.buildings[0];
  home.level = 10;
  const before = structuredClone(s);
  expect(() =>
    apply(s, {
      type: "buy-batch",
      items: [
        { kind: "lf", home: home.id, equipment: ["hose"] },
        { kind: "rtw", home: home.id },
      ],
    }),
  ).toThrow();
  expect(s).toEqual(before);
  const ems = addUnit(s, "rtw").home;
  const money = s.money;
  apply(s, {
    type: "buy-batch",
    items: [
      { kind: "lf", home: home.id, equipment: ["hose", "generator"] },
      { kind: "rtw", home: ems },
    ],
  });
  expect(s.money).toBe(
    money - equipmentPrice("lf", ["hose", "generator"]) - equipmentPrice("rtw"),
  );
  const purchased = s.vehicles.at(-2)!;
  expect(equipmentProfile(purchased).hoseB).toBe(500);
  expect(configuredSkills(purchased).power).toBe(1);
  expect(
    validate(JSON.parse(JSON.stringify(s))).vehicles.at(-2)!.equipment,
  ).toEqual(["hose", "generator"]);
  const unchanged = structuredClone(s);
  expect(() =>
    apply(s, { type: "buy", kind: "rtw", home: ems, equipment: ["water"] }),
  ).toThrow();
  expect(s).toEqual(unchanged);
});

it("verbraucht echte Tankmengen und verlangt 500 m B statt 300 m für die Leitung", () => {
  const s = phaseFixture("water", "field"),
    m = s.missions[0];
  attachDynamics(s, m);
  s.vehicles = [];
  s.people = [];
  const v = addUnit(s, "lf");
  atScene(s, v);
  m.control!.briefed = true;
  const w = ensureWaterSupply(s, m)!;
  w.hoseB = 500;
  w.hoseC = 240;
  w.source = "tank";
  const first = { fire: 2, water: 2 };
  waterSupplyTick(s, m, first, 5);
  expect(first.fire).toBe(0);
  expect(w.shortage).toContain("200 m");
  expect(v.supplies!.water).toBe(2000);
  v.equipment = ["hose"];
  const next = { fire: 2, water: 2 };
  waterSupplyTick(s, m, next, 5);
  expect(next.fire).toBe(2);
  expect(v.supplies!.water).toBe(1940);
  expect(w.consumed).toBe(60);
  v.supplies!.water = 10;
  const dry = { fire: 2, water: 2 };
  waterSupplyTick(s, m, dry, 5);
  expect(dry.fire).toBeCloseTo(1 / 3);
  expect(v.supplies!.water).toBe(0);
  const saved = validate(JSON.parse(JSON.stringify(s)));
  expect(saved.missions[0].waterSupply).toEqual(w);
});

it("führt Tanker auf wirklichen Routen zur Nachfüllstelle und zurück, auch nach Wiederherstellung", () => {
  const s = phaseFixture("shuttle", "field"),
    m = s.missions[0];
  attachDynamics(s, m);
  const v = s.vehicles.find((v) => v.type === "tlf")!;
  atScene(s, v);
  v.supplies = { water: 0, refilledAt: s.time };
  const w = ensureWaterSupply(s, m)!;
  w.source = "shuttle";
  waterSupplyTick(s, m, { fire: 1, water: 4 }, 5);
  expect(v.waterTrip?.stage).toBe("queued");
  waterTripTick(s, v);
  expect(v.waterTrip?.stage).toBe("outbound");
  expect(v.path.length).toBeGreaterThan(1);
  expect(v.mission).toBe(m.id);
  const clone = validate(JSON.parse(JSON.stringify(s)));
  for (const state of [s, clone]) {
    const unit = state.vehicles.find((unit) => unit.id === v.id)!;
    state.time = unit.arrive;
    waterTripTick(state, unit);
    expect(unit.waterTrip?.stage).toBe("refilling");
    expect(unit.supplies!.water).toBe(0);
    state.time = unit.waterTrip!.readyAt;
    waterTripTick(state, unit);
    expect(unit.waterTrip?.stage).toBe("inbound");
    expect(unit.supplies!.water).toBe(4000);
    state.time = unit.arrive;
    waterTripTick(state, unit);
    expect(unit.waterTrip).toBeUndefined();
    expect(unit.status).toBe("scene");
  }
  expect(clone).toEqual(s);
});

it("sperrt gewartete Fahrzeuge, bucht einmal und setzt Verschleiß erst beim Abschluss zurück", () => {
  const s = phaseFixture("maintenance"),
    v = s.vehicles[0];
  maintenanceTick(s, v);
  v.odometer = 1e6;
  expect(wear(v)).toBe(50);
  const money = s.money;
  serviceVehicle(s, v.id);
  const paid = s.money;
  expect(paid).toBeLessThan(money);
  serviceVehicle(s, v.id);
  expect(s.money).toBe(paid);
  expect(() =>
    apply(s, { type: "dispatch", mission: s.missions[0].id, vehicles: [v.id] }),
  ).toThrow();
  expect(() => apply(s, { type: "sell", id: v.id })).toThrow();
  tick(s, v.maintenance!.until, {}, false, false);
  expect(wear(v)).toBe(0);
  expect(v.maintenance!.services).toBe(1);
});

it("rechnet Bereitschaft zeitanteilig, neustartfest und ohne doppeltes Abbuchen oder negatives Guthaben ab", () => {
  const s = phaseFixture("cost");
  const bill = newOperatingBill(s.time);
  const base = s.money;
  const start = s.time;
  for (let i = 1; i <= 1800; i++) {
    s.time = start + i;
    operatingCostTick(s, bill, 90000, true, "test", "Bereitschaft");
  }
  expect(base - s.money).toBe(90000);
  expect(bill.paid).toBe(90000);
  operatingCostTick(s, bill, 90000, true, "test", "Bereitschaft");
  expect(base - s.money).toBe(90000);
  const again = JSON.parse(JSON.stringify(bill));
  s.time += 900;
  operatingCostTick(s, again, 90000, true, "test", "Bereitschaft");
  operatingCostTick(s, again, 90000, false, "test", "Bereitschaft");
  expect(base - s.money).toBe(135000);
  s.money = 1;
  s.time += 1800;
  operatingCostTick(s, again, 90000, true, "test", "Bereitschaft");
  expect(s.money).toBe(0);
  expect(again.due).toBe(89999);
});
