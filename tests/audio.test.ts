import { xpForLevel, progress } from "../src/shared/progression";
import { it, expect } from "vitest";
import { AudioEvents } from "../src/client/audio/events";
import { fresh, type Save } from "../src/shared/model";
import { phaseFixture } from "./dispatch-fixture";
import { fixtureMission } from "./fixtures/germany/mission";
import { parseSound, defaultSound } from "../src/client/audio/controller";
// Audio observes accepted snapshots. Generator selection is covered separately;
// this fixture supplies current staffed vehicles without generating an incident.
const audioSnapshot = () => {
  const save = phaseFixture("Test");
  save.missions = [];
  save.xp = 0;
  return save;
};
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
    s = audioSnapshot();
  s.revision = 10;
  expect(events.observe(s, "multi", true)).toBeNull();
  const next = update(s);
  next.missions.push(fixtureMission(next, "bin"));
  expect(events.observe(next, "multi", true)).toBe("mission");
  expect(events.observe(next, "multi", true)).toBeNull();
  expect(events.observe(s, "multi", true)).toBeNull();
  expect(events.observe(update(next), "multi", true)).toBeNull();
  events.reset();
  expect(events.observe(next, "multi", true)).toBeNull();
});
it("isoliert Konto, Spielgeneration und Offline-Wiederverbindung", () => {
  const events = new AudioEvents(),
    s = audioSnapshot();
  events.observe(s, "multi", true);
  const next = update(s);
  next.missions.push(fixtureMission(next, "bin"));
  expect(events.observe(next, "multi", true)).toBe("mission");
  expect(
    events.observe(
      { ...next, player: { ...next.player, id: "anderes-konto" } },
      "multi",
      true,
    ),
  ).toBeNull();
  expect(
    events.observe({ ...next, generation: "neu" }, "multi", true),
  ).toBeNull();
  expect(events.observe(next, "multi", false)).toBeNull();
  expect(events.observe(next, "multi", true)).toBeNull();
});
it("unterscheidet Alarmierung, Ankunft, Rückkehr, Bau und Erfolg, ohne Sammelmeldungen zu stapeln", () => {
  const events = new AudioEvents();
  let s = audioSnapshot();
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
  next.missions.push(fixtureMission(next, "bin"));
  expect(events.observe(next, "multi", true)).toBe("complete");
  s = next;
  next = update(s);
  next.xp = xpForLevel(progress(s.xp).level + 1);
  expect(events.observe(next, "multi", true)).toBe("level");
  const capped = update(next);
  capped.xp = xpForLevel(10);
  events.observe(capped, "multi", true);
  const more = update(capped);
  more.xp = xpForLevel(11);
  expect(events.observe(more, "multi", true)).toBe("level");
  expect(
    events.observe(fresh("Neu", "Neue Leitstelle", 100), "multi", true),
  ).toBeNull();
});
