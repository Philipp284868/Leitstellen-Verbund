import { it, expect } from "vitest";
import { fresh, type Mission, type Vehicle } from "../src/shared/model";
import { attachIncident } from "../src/simulation/calls";
import { attachDynamics } from "../src/simulation/dynamics";
import { missionStatus } from "../src/simulation/mission-status";

function fixture(template = "bin") {
  const s = fresh("Status", "Statusprüfung", Date.UTC(2026, 5, 15, 12) / 1000);
  const m: Mission = {
    id: "incident",
    template,
    pos: { x: 100, y: 100 },
    created: s.time,
    completed: 0,
    phase: "offered",
    progress: 0,
    shared: false,
    round: "round",
    contributors: [],
    transports: [],
  };
  s.missions = [m];
  attachIncident(s, m);
  m.control!.reportedTemplate = template;
  const v: Vehicle = {
    id: "vehicle",
    owner: s.player.id,
    home: "station",
    type: "tsf",
    name: "TSF",
    favorite: false,
    status: "ready",
    mission: null,
    assignment: null,
    path: [m.pos],
    depart: 0,
    arrive: 0,
    patients: 0,
  };
  s.vehicles = [v];
  const assign = (state: Vehicle["status"]) => {
    v.mission = m.id;
    v.assignment = "assignment";
    v.status = state;
  };
  return { s, m, v, assign };
}
it("zeigt unbekannte neue Notrufe ohne disponierte Kräfte und kennt keine verborgene Lage", () => {
  const { s, m } = fixture();
  m.control!.reportedTemplate = "";
  const before = missionStatus(s, m);
  expect(before.code).toBe("unassigned");
  expect(before.detail).toContain("Notruf");
  m.template = "rail";
  m.control!.secret!.hazard = "Verborgener Chemieunfall";
  attachDynamics(s, m);
  m.dynamics!.state = "aftermath";
  expect(missionStatus(s, m)).toEqual(before);
});
it("ein bloßer AAO-Vorschlag alarmiert noch keine Fahrzeuge", () => {
  const { s, m, v } = fixture();
  m.control!.proposal = {
    id: "proposal",
    aao: "aao",
    vehicles: [v.id],
    missing: [],
    at: s.time,
  };
  expect(missionStatus(s, m)).toMatchObject({
    code: "unassigned",
    attention: true,
  });
  expect(missionStatus(s, m).detail).toContain("noch nicht alarmiert");
});
it("unterscheidet teilweise disponierte Kräfte anhand des bekannten Meldebildes", () => {
  const { s, m, assign } = fixture("flat");
  assign("alarmed");
  expect(missionStatus(s, m)).toMatchObject({
    code: "partial",
    label: "Teilweise disponiert",
  });
});
it.each(["alarmed", "travel", "scene"] as const)(
  "stellt die echte Fahrzeugphase %s dar, unabhängig von manuellem FMS",
  (state) => {
    const { s, m, v, assign } = fixture();
    assign(state);
    m.control!.briefed = state === "scene";
    s.desk.fleet[v.id] = {
      code: 2,
      changed: s.time,
      operative: state,
      channel: "Feuerwehr",
      history: [],
    };
    const expected = { alarmed: "alarmed", travel: "enroute", scene: "scene" };
    expect(missionStatus(s, m).code).toBe(expected[state]);
  },
);
it("erkennt ausstehende erste Lagemeldungen vor normaler Einsatzstellenanzeige", () => {
  const { s, m, assign } = fixture();
  assign("scene");
  m.control!.stage = "recon";
  expect(missionStatus(s, m)).toMatchObject({
    code: "report",
    attention: true,
  });
});
it("zeigt offene Nachforderungen vorrangig, erledigte Anfragen aber nicht", () => {
  const { s, m, assign } = fixture();
  assign("scene");
  m.control!.briefed = true;
  m.control!.radio = [
    {
      id: "request",
      vehicle: "vehicle",
      reason: "request",
      priority: "DRINGEND",
      state: "open",
      created: s.time,
      answered: 0,
      details: "Weitere Kräfte erforderlich.",
    },
  ];
  expect(missionStatus(s, m).code).toBe("reinforcement");
  m.control!.radio[0].state = "handled";
  expect(missionStatus(s, m).code).toBe("scene");
});
it("zeigt Stabilisierung erst nach sichtbarer Erkundung und beherrschter Lage", () => {
  const { s, m, assign } = fixture();
  assign("scene");
  attachDynamics(s, m);
  m.dynamics!.state = "aftermath";
  expect(missionStatus(s, m).code).not.toBe("stable");
  m.control!.briefed = true;
  expect(missionStatus(s, m).code).toBe("stable");
  m.dynamics!.state = "stabilizing";
  expect(missionStatus(s, m).code).not.toBe("stable");
});
it("behält den tatsächlichen Patiententransport als sichtbaren Folgezustand", () => {
  const { s, m, assign } = fixture();
  assign("transport");
  m.phase = "transport";
  expect(missionStatus(s, m).code).toBe("transport");
});
it("abgeschlossene Einsätze haben Vorrang vor alten offenen Funkmeldungen", () => {
  const { s, m } = fixture();
  m.phase = "done";
  m.control!.stage = "recon";
  expect(missionStatus(s, m).code).toBe("completed");
});
it("zurückgenommene oder ausgefallene Fahrzeuge gelten nicht als verfügbare Kräfte", () => {
  const { s, m, v, assign } = fixture();
  assign("return");
  expect(missionStatus(s, m).code).toBe("unassigned");
  assign("alarmed");
  v.fault = {
    kind: "engine",
    state: "awaiting",
    since: s.time,
    repairAt: 0,
    mission: m.id,
    assignment: v.assignment!,
    position: m.pos,
  };
  expect(missionStatus(s, m)).toMatchObject({
    code: "unassigned",
    attention: true,
  });
  expect(missionStatus(s, m).detail).toContain("ausgefallen");
});
it("berechtigte Unterstützung zählt nur für diesen Einsatz und seine aktuelle Runde", () => {
  const { s, m, v } = fixture();
  const remote = {
    ...v,
    id: "remote",
    status: "travel" as const,
    mission: "remote:incident",
  };
  const support = [{ mission: m.id, round: m.round, vehicle: remote }];
  expect(missionStatus(s, m, support).code).toBe("enroute");
  expect(missionStatus(s, m, [{ ...support[0], round: "old" }]).code).toBe(
    "unassigned",
  );
  expect(missionStatus(s, m, [{ ...support[0], mission: "other" }]).code).toBe(
    "unassigned",
  );
});
it("liest nur sichtbare Fakten und verändert weder Spielstand noch Einsatz", () => {
  const { s, m, assign } = fixture();
  assign("travel");
  const before = structuredClone(s);
  missionStatus(s, m);
  missionStatus(s, m);
  expect(s).toEqual(before);
});
