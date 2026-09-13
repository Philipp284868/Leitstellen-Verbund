import type { Save } from "../../shared/model";
import { germanyProvider } from "../../shared/germany/world";
import {
  migratePatientTransports,
  validatePatientTransports,
} from "../../simulation/patient-transport";
import { patientBedRequest } from "../../simulation/clinic-capacity";

type Conflict = { owner: string; building: string; reason: string };
type Place = {
  patient: string;
  clinic: string;
  owner: string;
  mission: string;
  transport: string;
  departments: string[];
  state: "reserved" | "occupied";
  created: number;
  admitted: number | null;
  discharge: number | null;
};
/** Works on detached saved snapshots. Cross-dispatch references are resolved together,
 * before any refund or ownership change; patient evidence is never guessed from row order. */
export function prepareLegacyClinics(saves: Save[]) {
  const references = new Map<string, string>(),
    conflicts: Conflict[] = [],
    places = new Map<string, Place>();
  const catalog = germanyProvider().facilities;
  const fail = (owner: string, building: string, reason: string) =>
    conflicts.push({ owner, building, reason });
  for (const s of saves)
    for (const b of s.buildings)
      if (b.type === "hospital" && b.facility) {
        const f = catalog?.get(b.facility.id);
        if (!f || f.kind !== "hospital") continue;
        const target = `public:${f.id}`;
        for (const id of [
          b.id,
          `public:${b.facility.id}`,
          ...b.facility.sources.map((x) => `public:${x}`),
          target,
          ...f.sources.map((x) => `public:${x}`),
        ]) {
          if (references.has(id) && references.get(id) !== target)
            fail(s.player.id, b.id, `Mehrdeutiger Klinikverweis ${id}.`);
          else references.set(id, target);
        }
      }
  const canonical = (id: string) =>
    references.get(id) ??
    (id.startsWith("public:") && catalog?.get(id.slice(7))?.kind === "hospital"
      ? `public:${catalog.get(id.slice(7))!.id}`
      : id);
  const add = (place: Place) => {
    if (
      !place.clinic.startsWith("public:") ||
      catalog?.get(place.clinic.slice(7))?.kind !== "hospital"
    ) {
      fail(
        place.owner,
        place.transport,
        `Klinikziel ${place.clinic} nicht eindeutig zugeordnet; Patientenbestand erhalten.`,
      );
      return;
    }
    const prior = places.get(place.patient);
    if (prior) {
      if (
        prior.clinic !== place.clinic ||
        prior.owner !== place.owner ||
        prior.transport !== place.transport ||
        prior.state !== place.state ||
        JSON.stringify(prior.departments) !== JSON.stringify(place.departments)
      )
        fail(
          place.owner,
          place.transport,
          `Widersprüchliche Klinik-/Transportbelege für Patient ${place.patient}.`,
        );
      return;
    }
    places.set(place.patient, place);
  };
  for (const s of saves) {
    for (const bed of s.beds) bed.home = canonical(bed.home);
    for (const v of s.vehicles)
      if (v.destination) v.destination = canonical(v.destination);
    for (const t of s.transfers)
      if (t.hospital) t.hospital = canonical(t.hospital);
    for (const m of [...s.missions, ...s.archive]) {
      if (m.organization?.hospital)
        m.organization.hospital = canonical(m.organization.hospital);
      for (const t of m.transports)
        if (t.hospital) t.hospital = canonical(t.hospital);
      for (const p of m.dynamics?.patients ?? [])
        if (p.hospital) p.hospital = canonical(p.hospital);
      migratePatientTransports(m);
      try {
        validatePatientTransports(m);
      } catch (error) {
        fail(
          s.player.id,
          m.id,
          error instanceof Error
            ? error.message
            : "Widersprüchlicher Patiententransport.",
        );
      }
    }
  }
  for (const s of saves) {
    for (const m of [...s.missions, ...s.archive])
      for (const t of m.transports) {
        if (t.status !== "ordered") continue;
        const carrier = saves
          .find((other) => other.player.id === t.owner)
          ?.vehicles.find(
            (v) => v.id === t.vehicle && v.assignment === t.assignment,
          );
        if (
          !carrier ||
          carrier.status !== "transport" ||
          carrier.patients !== t.patients
        ) {
          fail(
            s.player.id,
            m.id,
            "Angeordneter Kliniktransport ohne übereinstimmendes beladenes Fahrzeug.",
          );
          continue;
        }
        t.hospital ??= carrier.destination;
        if (carrier.destination && carrier.destination !== t.hospital) {
          fail(
            s.player.id,
            m.id,
            "Fahrzeug und Transportauftrag haben unterschiedliche Klinikziele.",
          );
          continue;
        }
        if (t.hospital) carrier.destination = t.hospital;
        if (m.dynamics?.active && t.patientIds?.length !== t.patients) {
          fail(
            s.player.id,
            m.id,
            "Beladene Patienten nicht vollständig einem Transportauftrag zugeordnet.",
          );
          continue;
        }
        for (let i = 0; i < t.patients; i++) {
          const p = m.dynamics?.patients.find(
            (p) => p.id === t.patientIds?.[i],
          );
          const request = p
            ? patientBedRequest(m, p)
            : {
                patient: `${m.id}:${t.assignment}:${i}`,
                departments: ["general"],
              };
          add({
            ...request,
            clinic: t.hospital ?? "unbekannt",
            owner: t.owner,
            mission: m.id,
            transport: t.assignment,
            state: "reserved",
            created: s.time,
            admitted: null,
            discharge: null,
          });
        }
      }
    // Old beds did not store a patient ID. Keep each original admission once,
    // including any inherited overload; never fabricate a clinical association.
    for (const bed of s.beds)
      add({
        patient: `legacy:${s.player.id}:${bed.id}`,
        clinic: bed.home,
        owner: s.player.id,
        mission: "legacy",
        transport: bed.id,
        departments: ["general"],
        state: "occupied",
        created: s.time,
        admitted: s.time,
        discharge: bed.until,
      });
  }
  for (const s of saves)
    for (const v of s.vehicles)
      if (
        v.status === "transport" &&
        v.patients > 0 &&
        !Array.from(places.values()).some(
          (p) =>
            p.owner === s.player.id &&
            p.transport === v.assignment &&
            p.state === "reserved",
        )
      )
        fail(
          s.player.id,
          v.id,
          "Beladenes Fahrzeug ohne belegbare Klinikreservierung; Standortprüfung erforderlich.",
        );
  return { saves, places: [...places.values()], conflicts };
}
