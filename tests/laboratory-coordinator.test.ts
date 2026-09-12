import { expect, it } from "vitest";
import { createLab, runLab, verifyLab } from "../src/server/lab";
import { stepLaboratoryWorlds } from "../src/server/lab-worlds";
import { historyFixture } from "./history-fixture";

it("keeps every laboratory world on the same clock while interviewing after a neighbor joined", () => {
  let lab = runLab(createLab(418), { type: "neighbor", seed: 419 });
  lab = runLab(lab, { type: "generate", template: "bin" });
  lab = runLab(lab, { type: "interview", mission: lab.save.missions[0].id });
  expect(lab.neighbors[0].time).toBe(lab.save.time);
  lab = runLab(lab, { type: "advance", seconds: 10 });
  expect(lab.neighbors[0].time).toBe(lab.save.time);
  expect(verifyLab(lab).verified).toBe(true);
});

it("does not allow one seed to create colliding identities across independent laboratory worlds", () => {
  const source = createLab(418);
  expect(() => runLab(source, { type: "neighbor", seed: 418 })).toThrow(
    /Seed.*eigen/,
  );
  const neighbor = runLab(source, { type: "neighbor", seed: 419 });
  expect(() => runLab(neighbor, { type: "neighbor", seed: 419 })).toThrow(
    /Seed.*bereits/,
  );
});

it("laboratory coordinator preserves complete archives and does not mutate input worlds", () => {
  const sources = [
    historyFixture("lab-archive-own", 137),
    historyFixture("lab-archive-neighbor", 115),
  ];
  const before = JSON.stringify(sources);
  const advanced = stepLaboratoryWorlds(sources, 5);
  expect(JSON.stringify(sources)).toBe(before);
  expect(advanced[0].archive.map((m) => m.id)).toEqual(
    sources[0].archive.map((m) => m.id),
  );
  expect(advanced[1].archive.map((m) => m.id)).toEqual(
    sources[1].archive.map((m) => m.id),
  );
  expect(advanced.every((s) => s.missions.length === 0)).toBe(true);
  expect(advanced[0].time).toBe(sources[0].time + 5);
  expect(stepLaboratoryWorlds(sources, 5)).toEqual(advanced);
});

it("lets a busy laboratory neighbor decline another request without releasing already assigned units", () => {
  let lab = runLab(createLab(418), { type: "neighbor", seed: 419 });
  const neighbor = lab.neighbors[0].player.id;
  lab = runLab(lab, { type: "generate", template: "field" });
  const first = lab.save.missions[0].id;
  lab = runLab(lab, { type: "interview", mission: first });
  lab = runLab(lab, {
    type: "neighbor-response",
    mission: first,
    neighbor,
    accept: true,
  });
  lab = runLab(lab, { type: "generate", template: "bin" });
  const second = lab.save.missions[1].id;
  lab = runLab(lab, { type: "interview", mission: second });
  const assignments = lab.neighbors[0].vehicles.map((v) => v.assignment);
  expect(lab.neighbors[0].vehicles.every((v) => v.status !== "ready")).toBe(
    true,
  );
  lab = runLab(lab, {
    type: "neighbor-response",
    mission: second,
    neighbor,
    accept: false,
  });
  expect(lab.save.aid.at(-1)!.state).toBe("DECLINED");
  expect(lab.neighbors[0].vehicles.map((v) => v.assignment)).toEqual(
    assignments,
  );
  expect(verifyLab(lab).verified).toBe(true);
});
