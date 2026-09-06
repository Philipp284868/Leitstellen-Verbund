import { it, expect } from "vitest";
import { AudioEvents } from "../src/audio/events";
import { fresh, type Save } from "../src/model";
import { established } from "./e2e/fixtures";
import { generate } from "../src/engine";
import { parseSound, defaultSound } from "../src/audio/controller";
const update = (s: Save) => ({
  ...structuredClone(s),
  revision: s.revision + 1,
});
it("normalisiert beschädigte Lautstärken und behält explizite Stummschaltung", () => {
  expect(parseSound("broken")).toEqual(defaultSound);
  expect(parseSound("null")).toEqual(defaultSound);
  expect(
    parseSound(
      '{"musicVolume":-10,"effectsVolume":999,"muted":true,"effects":false}',
    ),
  ).toMatchObject({
    musicVolume: 0,
    effectsVolume: 100,
    muted: true,
    effects: false,
  });
});
it("meldet neue Einsätze einmal und spielt beim Einstieg, Reload oder alten Snapshots nichts nach", () => {
  const events = new AudioEvents(),
    s = established("Test");
  s.revision = 10;
  expect(events.observe(s, "multi", true)).toBeNull();
  const next = update(s);
  generate(next);
  expect(events.observe(next, "multi", true)).toBe("mission");
  expect(events.observe(next, "multi", true)).toBeNull();
  expect(events.observe(s, "multi", true)).toBeNull();
  expect(events.observe(update(next), "multi", true)).toBeNull();
  events.reset();
  expect(events.observe(next, "multi", true)).toBeNull();
});
it("isoliert Modus, Konto, Spielgeneration und Offline-Wiederverbindung", () => {
  const events = new AudioEvents(),
    s = established("Test");
  events.observe(s, "multi", true);
  const next = update(s);
  generate(next);
  expect(events.observe(next, "single", true)).toBeNull();
  expect(
    events.observe(
      { ...next, player: { ...next.player, id: "anderes-konto" } },
      "single",
      true,
    ),
  ).toBeNull();
  expect(
    events.observe({ ...next, generation: "neu" }, "single", true),
  ).toBeNull();
  expect(events.observe(next, "multi", false)).toBeNull();
  expect(events.observe(next, "multi", true)).toBeNull();
});
it("unterscheidet Alarmierung, Ankunft, Rückkehr, Bau und Erfolg, ohne Sammelmeldungen zu stapeln", () => {
  const events = new AudioEvents();
  let s = established("Test");
  events.observe(s, "multi", true);
  let next = update(s);
  next.vehicles[0].status = "travel";
  next.vehicles[0].assignment = "einsatz-1";
  expect(events.observe(next, "multi", true)).toBe("dispatch");
  s = next;
  next = update(s);
  next.vehicles[0].status = "scene";
  expect(events.observe(next, "multi", true)).toBe("arrival");
  s = next;
  next = update(s);
  next.vehicles[0].status = "return";
  expect(events.observe(next, "multi", true)).toBeNull();
  s = next;
  next = update(s);
  next.vehicles[0].status = "ready";
  expect(events.observe(next, "multi", true)).toBe("return");
  s = next;
  next = update(s);
  next.buildings.push({ ...next.buildings[0], id: "new-station" });
  expect(events.observe(next, "multi", true)).toBe("build");
  s = next;
  next = update(s);
  next.receipts.push("a", "b");
  generate(next);
  expect(events.observe(next, "multi", true)).toBe("complete");
  s = next;
  next = update(s);
  next.xp += 150;
  expect(events.observe(next, "multi", true)).toBe("level");
  expect(
    events.observe(fresh("Neu", "Neue Leitstelle", 100), "multi", true),
  ).toBeNull();
});
