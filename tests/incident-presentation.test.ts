import { describe, expect, it } from "vitest";
import { mt } from "../src/catalog";
import {
  missionPresentation,
  incidentColors,
} from "../src/mission-presentation";
import type { Mission } from "../src/model";
import { groupGameMarkers, type MarkerData } from "../src/germany/game-markers";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IncidentIcon } from "../src/HudIcons";
import { FireLiveStatus } from "../src/FireLiveStatus";

describe("öffentliche Notrufdarstellung", () => {
  it("ein ungeklärter Notruf erbt keine Brandkategorie aus der ersten Katalogvorlage", () => {
    const incoming = mt("incoming");
    expect(incoming.org).toBe("Unbekannt");
    expect(incoming.requirements).toEqual({});
    expect(incoming.profile).toBeUndefined();
  });
  it("gibt selbst aus einer internen Brandmission nur den erarbeiteten Wissensstand aus", () => {
    const m = {
      template: "bin",
      control: { briefed: false, legacy: false, reportedTemplate: "" },
    } as Mission;
    expect(missionPresentation(m)).toMatchObject({
      category: "unknown",
      org: "Unbekannt",
      known: false,
      color: incidentColors.unknown,
    });
    m.control!.reportedTemplate = "reported-medical";
    m.control!.priority = "NOTFALL";
    expect(missionPresentation(m)).toMatchObject({
      category: "medical",
      color: incidentColors.medical,
      confirmed: false,
    });
    m.control!.reportedTemplate = "reported-fire";
    expect(missionPresentation(m)).toMatchObject({
      category: "fire",
      name: "Brandverdacht gemeldet",
    });
  });
  it("ein bestätigter Brand mit Patienten bleibt Brand mit zusätzlicher medizinischer Kategorie", () => {
    const m = {
      template: "bin",
      control: { briefed: true },
      dynamics: { patients: [{ condition: "critical" }] },
    } as Mission;
    expect(missionPresentation(m)).toMatchObject({
      category: "fire",
      categories: ["fire", "medical"],
      color: incidentColors.fire,
    });
  });
  it("medizinische Cluster bleiben grün, auch bei Dringlichkeit und Auswahl; gemischte zeigen alle Kategorien", () => {
    const item = (id: string, category: "medical" | "fire"): MarkerData => ({
      id,
      name: id,
      pos: { x: 100, y: 100 },
      kind: "mission",
      org: category === "medical" ? "Rettungsdienst" : "Feuerwehr",
      category,
      categories: [category],
      color: incidentColors[category],
      urgent: true,
    });
    const medical = [item("m1", "medical"), item("m2", "medical")];
    expect(
      groupGameMarkers(medical, (p) => p, 500, 500, 10, "")[0],
    ).toMatchObject({
      category: "medical",
      color: incidentColors.medical,
      urgent: true,
      count: 2,
    });
    expect(
      groupGameMarkers(medical, (p) => p, 500, 500, 10, "m1").every(
        (g) => g.color === incidentColors.medical,
      ),
    ).toBe(true);
    expect(
      groupGameMarkers(
        [...medical, item("f1", "fire")],
        (p) => p,
        500,
        500,
        10,
        "",
      )[0],
    ).toMatchObject({
      category: "mixed",
      categories: ["medical", "fire"],
      color: incidentColors.mixed,
      count: 3,
    });
  });
  it("unbekannte Lage hat Telefonsymbol und keine Brandanzeige; Verdacht zeigt keine Messwerte", () => {
    const m = {
      template: "bin",
      control: { briefed: false, reportedTemplate: "" },
      dynamics: { active: true, fire: { intensity: 73, suppression: 12 } },
    } as Mission;
    const icon = renderToStaticMarkup(
      createElement(IncidentIcon, {
        category: missionPresentation(m).category,
      }),
    );
    expect(icon).toContain("lucide-phone");
    expect(icon).not.toContain("lucide-flame");
    expect(
      renderToStaticMarkup(createElement(FireLiveStatus, { m, reduced: true })),
    ).toBe("");
    m.control!.reportedTemplate = "reported-fire";
    const html = renderToStaticMarkup(
      createElement(FireLiveStatus, { m, reduced: true }),
    );
    expect(html).toContain("Erkundung ausstehend");
    expect(html).not.toContain("<progress");
  });
  it("ein bestätigter Fehlalarm ohne Branddynamik fordert keine erneute Erkundung", () => {
    const m = {template:"bma-false",control:{briefed:true},dynamics:{active:true,patients:[]}} as unknown as Mission;
    expect(renderToStaticMarkup(createElement(FireLiveStatus,{m,reduced:true}))).toBe("");
  });
});
