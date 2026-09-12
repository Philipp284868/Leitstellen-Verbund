import type { Mission, Save } from "../src/shared/model";
import { priorities } from "../src/simulation/priority";
import { organizationFixture } from "./mutual-aid-fixture";

/** Complete archived records, with private simulation state intentionally retained on disk. */
export function historyFixture(owner: string, count = 537): Save {
  const s = organizationFixture(owner);
  const original = s.missions[0];
  s.missions = [];
  s.archive = Array.from({ length: count }, (_, index): Mission => {
    const m = structuredClone(original);
    m.id = `history-${owner}-${String(index).padStart(4, "0")}`;
    m.template = index % 2 ? "sick" : "field";
    m.created = 100;
    m.completed = 200 + index;
    m.phase = "done";
    m.control!.stage = "closed";
    m.control!.briefed = true;
    m.control!.locationKnown = true;
    m.control!.priority = priorities[index % priorities.length];
    m.control!.calls.forEach((c) => {
      c.state = "ended";
      c.ended = m.completed;
    });
    m.control!.events = [
      {
        id: `event-${index}`,
        at: m.completed,
        type: "MISSION_COMPLETED",
        text: "Einsatz abgeschlossen",
        actor: "server",
        vehicle: "",
      },
    ];
    m.telemetry = {
      since: 100,
      partial: true,
      meters: index,
      credits: null,
      xp: null,
      aaos: [],
      units: [
        {
          id: `unit-${index}`,
          name: index % 10 === 0 ? "Archiv-Sonderfahrzeug" : "Florian",
          type: "hlf",
          meters: index,
        },
      ],
    };
    if (index % 11 === 0)
      m.major = {
        kind: "fire",
        declared: 120,
        level: 1,
        sections: [],
        placements: [],
        transports: false,
        evacuated: 0,
        evacuees: 0,
        water: 0,
        demand: 0,
        shortage: "",
        campaign: "",
        pending: { next: 200, remaining: 1, batch: 0 },
      };
    return m;
  }).reverse();
  s.completed = count;
  return s;
}

export function activeMissionsFixture(owner: string, count = 73): Save {
  const s = organizationFixture(owner);
  const original = s.missions[0];
  s.missions = Array.from({ length: count }, (_, index) => {
    const m = structuredClone(original);
    m.id = `active-${String(index).padStart(4, "0")}`;
    m.control!.priority = priorities[index % priorities.length];
    m.control!.briefed = true;
    m.control!.stage = "disposition";
    m.control!.calls = [];
    m.control!.secret!.secondaryAt = 0;
    m.control!.secret!.dropAt = 0;
    return m;
  });
  return s;
}
