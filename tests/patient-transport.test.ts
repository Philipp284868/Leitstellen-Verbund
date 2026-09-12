import { describe, expect, it } from "vitest";
import { tick } from "../src/shared/engine";
import { validate } from "../src/shared/model";
import { prepared } from "./helpers/patient-transport";
import {
  migratePatientTransports,
  patientTransportsComplete,
} from "../src/simulation/patient-transport";

describe("Eindeutige Patiententransporte und Einsatzabschluss", () => {
  it.each([
    [1, 1],
    [3, 2],
  ])(
    "übergibt %i Patienten mit %i RTW und belohnt genau einmal",
    (patients, ambulances) => {
      const { s, m } = prepared(patients, ambulances);
      tick(s, s.time + 1, {}, false, false);
      expect(
        m.dynamics!.patients.filter((p) => p.transport === "aboard"),
      ).toHaveLength(ambulances);
      expect(
        m.dynamics!.patients.filter((p) => p.transport === "scene"),
      ).toHaveLength(patients - ambulances);
      expect(patientTransportsComplete(m)).toBe(false);
      expect(new Set(m.transports.flatMap((t) => t.patientIds!)).size).toBe(
        ambulances,
      );
      // Reload midway preserves the same identities and completion result.
      const resumed = validate(JSON.parse(JSON.stringify(s)));
      for (const state of [s, resumed]) {
        for (
          let i = 0;
          i < 600 && state.missions.some((x) => x.id === m.id);
          i++
        )
          tick(state, state.time + 5, {}, false, false);
        const archived = state.archive.find((x) => x.id === m.id)!;
        expect(archived, JSON.stringify(state.missions)).toBeDefined();
        expect(
          archived.dynamics!.patients.every(
            (p) => p.transport === "delivered" && !p.vehicle && !!p.deliveredAt,
          ),
        ).toBe(true);
        expect(archived.transports).toHaveLength(patients);
        expect(new Set(archived.transports.map((t) => t.id)).size).toBe(
          patients,
        );
        expect(
          new Set(archived.transports.flatMap((t) => t.patientIds!)).size,
        ).toBe(patients);
        const paid = state.money;
        tick(state, state.time + 30, {}, false, false);
        expect(state.money).toBe(paid);
        expect(state.archive.filter((x) => x.id === m.id)).toHaveLength(1);
        expect(validate(state)).toBeTruthy();
      }
      expect(resumed).toEqual(s);
    },
  );
  it("schließt nicht durch einen falschen Zählwert bei verbliebenem Patienten", () => {
    const { s, m } = prepared(1, 1);
    m.transports = [
      {
        assignment: "legacy",
        owner: s.player.id,
        vehicle: s.vehicles.at(-1)!.id,
        patients: 1,
        status: "delivered",
      },
    ];
    expect(patientTransportsComplete(m)).toBe(false);
    migratePatientTransports(m);
    expect(m.dynamics!.patients[0].transport).toBe("scene");
    expect(patientTransportsComplete(m)).toBe(false);
  });
  it("übernimmt eindeutige alte Übergaben ohne aktive Fahrzeugbindung", () => {
    const { s, m } = prepared(1, 1),
      p = m.dynamics!.patients[0],
      v = s.vehicles.at(-1)!;
    p.transport = "delivered";
    p.vehicle = v.id;
    m.transports = [
      {
        assignment: "legacy",
        owner: s.player.id,
        vehicle: v.id,
        patients: 1,
        status: "delivered",
      },
    ];
    migratePatientTransports(m);
    expect(m.transports[0].patientIds).toEqual([p.id]);
    expect(p.vehicle).toBe("");
    const original = structuredClone(m);
    migratePatientTransports(m);
    expect(m).toEqual(original);
  });
});
