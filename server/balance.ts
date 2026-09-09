import { createLab, runLab, verifyLab, type LabAction } from "./lab";
import { missions, vehicles } from "../src/catalog";

/** Reproducible playable smoke scenarios, using the same dispatch and simulation as the server. */
export function balanceAudit(seeds = [124, 2026, 73]) {
  const scenarios = seeds.flatMap((seed) =>
    ["bin", "car", "field"].map((template) => {
      let lab = createLab(seed);
      const step = (action: LabAction) => {
        lab = runLab(lab, action);
      };
      step({ type: "crew-ready" });
      step({ type: "generate", template });
      const id = lab.save.missions[0].id,
        start = lab.save.time;
      step({ type: "interview", mission: id });
      step({
        type: "dispatch",
        mission: id,
        vehicles: lab.save.vehicles.map((v) => v.id),
      });
      let repairs = 0;
      for (
        let i = 0;
        i < 240 && lab.save.missions.some((m) => m.id === id);
        i++
      ) {
        const m = lab.save.missions.find((m) => m.id === id)!;
        if (
          m.control?.radio.some(
            (r) => r.reason === "arrival" && r.state === "open",
          )
        )
          step({ type: "brief", mission: id });
        for (const v of lab.save.vehicles)
          if (v.fault?.state === "awaiting") {
            step({ type: "repair", vehicle: v.id });
            repairs++;
          }
        step({ type: "advance", seconds: 30 });
      }
      const m = lab.save.archive.find((m) => m.id === id);
      if (!m?.report)
        throw Error(
          `Balancing: ${template}, Seed ${seed} wurde nicht innerhalb von zwei Spielstunden abgeschlossen.`,
        );
      verifyLab(lab);
      return {
        seed,
        template,
        seconds: m.completed - start,
        meters: m.report.meters,
        credits: m.report.credits,
        repairs,
        hash: lab.hashes.at(-1),
      };
    }),
  );
  const impossible = missions
    .filter((m) =>
      Object.entries(m.requirements).some(
        ([skill, n]) =>
          n > 0 && !vehicles.some((v) => (v.skills[skill] ?? 0) > 0),
      ),
    )
    .map((m) => m.id);
  if (impossible.length)
    throw Error(
      `Fähigkeiten ohne passende Fahrzeuge: ${impossible.join(", ")}`,
    );
  return {
    format: "leitstellen-balance-audit",
    version: 1,
    seeds,
    activeLimit: null,
    scenarios,
    catalog: {
      missions: missions.length,
      vehicles: vehicles.length,
      impossible,
    },
  };
}
