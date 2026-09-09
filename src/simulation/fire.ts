import type { Mission, Save } from "../model";
import { mt, type Skills } from "../catalog";
import type { Dynamics } from "./dynamics-schema";
import { clamp } from "./random";
// Gameplay coefficients, not a physical fire model. Data keeps scenarios extensible.
export const fuels: Record<
  string,
  { spread: number; smoke: number; explosion: number }
> = {
  Papier: { spread: 1.2, smoke: 0.6, explosion: 0 },
  Holz: { spread: 1, smoke: 0.8, explosion: 0 },
  Kunststoff: { spread: 1.1, smoke: 1.4, explosion: 0.1 },
  Textilien: { spread: 1.1, smoke: 0.9, explosion: 0 },
  Öl: { spread: 0.8, smoke: 1.5, explosion: 0.4 },
  Kraftstoff: { spread: 1.5, smoke: 1.3, explosion: 0.8 },
  Gas: { spread: 1.8, smoke: 0.2, explosion: 1 },
  Elektrokabel: { spread: 0.7, smoke: 1.4, explosion: 0.1 },
  Dämmstoff: { spread: 1.6, smoke: 1.5, explosion: 0.1 },
  Möbel: { spread: 1.1, smoke: 1, explosion: 0 },
  Fahrzeuge: { spread: 1, smoke: 1.3, explosion: 0.4 },
  Reifen: { spread: 0.6, smoke: 1.8, explosion: 0.2 },
  Müll: { spread: 0.9, smoke: 1.1, explosion: 0.1 },
  Vegetation: { spread: 1.4, smoke: 0.8, explosion: 0 },
  Stroh: { spread: 1.5, smoke: 0.8, explosion: 0.2 },
  Chemikalien: { spread: 1.1, smoke: 1.5, explosion: 0.9 },
};
export function initialFire(m: Mission): Dynamics["fire"] {
  if (!mt(m.template).requirements.fire || m.template === "bma-false") return;
  const profile = mt(m.template).profile;
  if (profile?.fire) {
    const source = profile.fire,
      initial = profile.hazards.find((h) => h.kind === "fire")?.initial ?? 24;
    return {
      fuel: source.fuel,
      area: source.area,
      temperature: 20 + initial * 12,
      smoke: 15,
      intensity: initial,
      spread: fuels[source.fuel].spread,
      explosion: fuels[source.fuel].explosion * 10,
      suppression: 0,
      sections: source.sections.map((name, i) => ({
        name,
        burning: i ? 0 : initial,
        damage: 0,
        smoke: i ? 0 : 15,
      })),
    };
  }
  const fuel =
    (
      {
        bin: "Müll",
        car: "Fahrzeuge",
        shed: "Holz",
        field: "Vegetation",
        forest: "Vegetation",
        flat: "Möbel",
        roof: "Dämmstoff",
        factory: "Chemikalien",
        silo: "Stroh",
      } as Record<string, string>
    )[m.template] || "Holz";
  const indoor = ["flat", "roof", "factory", "silo", "smoke"].includes(
    m.template,
  );
  const sections = (
    indoor
      ? ["Brandraum", "Nebenraum", "Treppenraum", "Obergeschoss", "Dach"]
      : ["Ausgangsbereich", "Angrenzende Fläche", "Fassade", "Nachbarbereich"]
  ).map((name, i) => ({
    name,
    burning: i ? 0 : 24,
    damage: 0,
    smoke: i ? 0 : 15,
  }));
  return {
    fuel,
    area: 4,
    temperature: 350,
    smoke: 15,
    intensity: 24,
    spread: fuels[fuel].spread,
    explosion: fuels[fuel].explosion * 10,
    suppression: 0,
    sections,
  };
}
export function fireTick(s: Save, m: Mission, skills: Skills, dt: number) {
  const d = m.dynamics!,
    f = d.fire;
  if (!f) return;
  const h = d.hazards.find((h) => h.kind === "fire")!;
  f.intensity = h.value;
  const fuel = fuels[f.fuel] || fuels.Holz;
  const water = Math.min(
    1,
    (skills.water || 0) /
      Math.max(
        1,
        (d.scenario?.requirements ?? mt(m.template).requirements).water || 1,
      ),
  );
  f.spread =
    fuel.spread *
    (1 + (s.environment?.wind || 0) / 120) *
    (1 - (s.environment?.rain || 0) / 150);
  f.smoke = clamp(
    f.smoke +
      dt *
        (f.intensity * 0.002 * fuel.smoke -
          (skills.fire || 0) * 0.35 -
          (skills.air || 0) * 0.6),
  );
  f.temperature = 20 + f.intensity * 12;
  f.area = clamp(
    f.area +
      dt *
        (f.intensity > 50
          ? f.spread * 0.08
          : -(skills.fire || 0) * water * 0.1),
    100000,
  );
  f.explosion = clamp(f.intensity * fuel.explosion);
  f.suppression = clamp(100 - (f.intensity / Math.max(24, h.initial)) * 100);
  for (const area of f.sections) {
    if (!area.burning) continue;
    area.damage = clamp(area.damage + area.burning * dt * 0.0005);
    area.burning = h.resolved
      ? 0
      : Math.min(
          100,
          Math.max(
            0,
            area.burning + dt * (0.04 * f.spread - (skills.fire || 0) * 0.65),
          ),
        );
    area.smoke = f.smoke;
  }
  const smoke = d.hazards.find((h) => h.kind === "smoke");
  if (smoke && f.intensity > 30) {
    smoke.value = Math.max(smoke.value, f.smoke);
    smoke.resolved = false;
  }
}
