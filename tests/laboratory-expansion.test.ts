import { expect, it } from "vitest";
import { createLab, runLab, verifyLab, type LabAction } from "../server/lab";
import { commandSchema } from "../server/actions";

it("keeps all laboratory actions unavailable to normal server commands", () => {
  for (const action of [
    { type: "neighbor", seed: 22 },
    { type: "volunteers", available: true, seconds: 500 },
    { type: "new-patient", mission: "m", injury: "Prüfung" },
    { type: "major", mission: "m" },
  ])
    expect(
      commandSchema.safeParse({
        id: "11111111-2222-4333-8444-555555555555",
        action,
      }).success,
    ).toBe(false);
});
it("creates patients, availability overrides and MANV through persisted deterministic lab commands", () => {
  let lab = createLab(66);
  const step = (action: LabAction) => {
    lab = runLab(lab, action);
  };
  step({ type: "volunteers", available: false, seconds: 500 });
  expect(
    lab.save.people.every(
      (p) => p.duty?.simulationOverride?.available === false,
    ),
  ).toBe(true);
  step({ type: "generate", template: "bus" });
  const m = lab.save.missions[0],
    initial = m.dynamics!.patients.length;
  step({ type: "new-patient", mission: m.id, injury: "Nacherkundung" });
  expect(lab.save.missions[0].dynamics!.patients).toHaveLength(initial + 1);
  step({ type: "major", mission: m.id });
  expect(lab.save.missions[0].major?.kind).toBe("manv");
  expect(verifyLab(lab).verified).toBe(true);
});
it("a real laboratory neighbor accepts aid and reaches the incident through the production coordinator", () => {
  let lab = createLab(124);
  const step = (action: LabAction) => {
    lab = runLab(lab, action);
  };
  step({ type: "generate", template: "bin" });
  const mission = lab.save.missions[0].id;
  step({ type: "interview", mission });
  step({ type: "neighbor", seed: 72 });
  const neighbor = lab.neighbors[0].player.id;
  step({ type: "neighbor-response", mission, neighbor, accept: true });
  expect(lab.save.aid[0].state).toBe("ACCEPTED");
  expect(lab.neighbors[0].vehicles.every((v) => v.status === "alarmed")).toBe(
    true,
  );
  for (let i = 0; i < 100 && !lab.save.missions[0]?.control?.firstArrival; i++)
    step({ type: "advance", seconds: 10 });
  expect(lab.save.missions[0].control!.firstArrival).not.toBe("");
  expect(lab.neighbors[0].vehicles.some((v) => v.status === "scene")).toBe(
    true,
  );
  expect(verifyLab(lab).verified).toBe(true);
}, 20000);
it("a laboratory neighbor can decline without assigning vehicles", () => {
  let lab = runLab(createLab(124), { type: "generate", template: "bin" });
  const mission = lab.save.missions[0].id;
  lab = runLab(lab, { type: "interview", mission });
  lab = runLab(lab, { type: "neighbor", seed: 72 });
  lab = runLab(lab, {
    type: "neighbor-response",
    mission,
    neighbor: lab.neighbors[0].player.id,
    accept: false,
  });
  expect(lab.save.aid[0].state).toBe("DECLINED");
  expect(lab.neighbors[0].vehicles.every((v) => v.status === "ready")).toBe(
    true,
  );
});
