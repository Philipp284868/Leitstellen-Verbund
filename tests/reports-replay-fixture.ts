import { createLab, runLab, type LabAction } from "../src/server/lab";
export function completedLab(seed = 124, template = "bin") {
  let lab = createLab(seed);
  const step = (a: LabAction) => {
    lab = runLab(lab, a);
  };
  step({ type: "crew-ready" });
  step({ type: "generate", template });
  const id = lab.save.missions[0].id;
  step({ type: "interview", mission: id });
  step({
    type: "dispatch",
    mission: id,
    vehicles: lab.save.vehicles.map((v) => v.id),
  });
  for (let i = 0; i < 100 && lab.save.missions.length; i++) {
    const m = lab.save.missions[0];
    if (
      m.control?.radio.some((r) => r.reason === "arrival" && r.state === "open")
    )
      step({ type: "brief", mission: id });
    step({ type: "advance", seconds: 10 });
  }
  if (!lab.save.archive.length)
    throw Error("Fixture konnte Einsatz nicht abschließen.");
  return lab;
}
export function completedSave(owner: string) {
  const s = completedLab().save;
  s.player.id = owner;
  for (const o of [...s.buildings, ...s.vehicles]) o.owner = owner;
  return s;
}
