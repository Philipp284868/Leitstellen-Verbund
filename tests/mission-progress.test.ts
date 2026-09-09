import { describe, expect, it } from "vitest";
import { mt } from "../src/catalog";
import type { Mission } from "../src/model";
import { missionProgress } from "../src/mission-presentation";

function mission(): Mission {
  return {
    template: "bin",
    progress: mt("bin").seconds,
    control: {
      briefed: true,
      legacy: false,
      reportedTemplate: "reported-fire",
    },
    tasks: {
      version: 1,
      initializedAt: 100,
      entries: ["fire", "water", "ladder"].map((skill, index) => ({
        id: `base:${skill}`,
        skill,
        required: 1,
        progress: 100,
        seconds: 100,
        done: index < 2,
        completedAt: index < 2 ? 200 : 0,
      })),
    },
  } as Mission;
}

describe("öffentlicher Einsatzaufgabenfortschritt", () => {
  it("zeigt bei vollem altem Timer und offener Leiteraufgabe nur 2 von 3 erledigten Aufgaben", () => {
    const m = mission(),
      before = JSON.stringify(m),
      progress = missionProgress(m)!;
    expect(progress).toEqual({
      value: 2,
      max: 3,
      label: "Erledigte Einsatzaufgaben · 2/3",
    });
    expect(progress.value / progress.max).toBeLessThan(1);
    expect(JSON.stringify(m)).toBe(before);
    m.tasks!.entries[2].done = true;
    expect(missionProgress(m)).toEqual({
      value: 3,
      max: 3,
      label: "Erledigte Einsatzaufgaben · 3/3",
    });
  });
  it("verrät vor Erkundung weder vorhandene Aufgaben noch den internen Timer", () => {
    const m = mission();
    m.control!.briefed = false;
    expect(missionProgress(m)).toBeNull();
    delete m.tasks;
    expect(missionProgress(m)).toBeNull();
  });
  it("behält für bestätigte Altmissionen ohne Aufgaben den bisherigen Fortschritt", () => {
    const m = mission();
    delete m.tasks;
    expect(missionProgress(m)).toEqual({
      value: mt("bin").seconds,
      max: mt("bin").seconds,
      label: "Einsatzfortschritt",
    });
    m.control!.legacy = true;
    m.control!.briefed = false;
    expect(missionProgress(m)?.label).toBe("Einsatzfortschritt");
    delete m.control;
    expect(missionProgress(m)?.label).toBe("Einsatzfortschritt");
  });
  it("behauptet bei einem noch leeren Aufgabenstand keine erledigte Arbeit", () => {
    const m = mission();
    m.tasks!.entries = [];
    expect(missionProgress(m)).toEqual({
      value: 0,
      max: 1,
      label: "Erledigte Einsatzaufgaben · 0/0",
    });
  });
});
