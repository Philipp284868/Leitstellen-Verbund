import type { DatabaseSync } from "node:sqlite";
import type {
  ClinicAuthority,
  BedRequest,
  ClinicSnapshot,
} from "../../simulation/clinic-capacity";
import type { HospitalOption } from "../../simulation/hospital-profiles";
import { BALANCE } from "../../shared/catalog";

export class SharedClinics implements ClinicAuthority {
  constructor(private sql: DatabaseSync) {}
  private transaction() {
    if (!this.sql.isTransaction)
      throw Error("Klinikänderung benötigt die Spieltransaktion.");
  }
  private revision() {
    return Number(
      this.sql
        .prepare("SELECT revision FROM infrastructure_state WHERE id=1")
        .get()!.revision,
    );
  }
  private changed() {
    this.sql.exec(
      "UPDATE infrastructure_state SET revision=revision+1 WHERE id=1",
    );
    return this.revision();
  }
  snapshot(h: HospitalOption): ClinicSnapshot {
    const rows = this.sql
      .prepare(
        "SELECT state,departments FROM clinic_places WHERE clinic=? AND state IN('reserved','occupied')",
      )
      .all(h.id);
    const occupied = rows.filter((r) => r.state === "occupied").length,
      reserved = rows.length - occupied;
    const departmentFree = Object.fromEntries(
      h.specialties.map((d) => [
        d,
        Math.max(
          0,
          (h.departmentCapacity?.[d] ?? h.capacity) -
            rows.filter((r) =>
              (JSON.parse(String(r.departments)) as string[]).includes(d),
            ).length,
        ),
      ]),
    );
    return {
      occupied,
      reserved,
      free: Math.max(0, h.capacity - rows.length),
      total: h.capacity,
      revision: this.revision(),
      departmentFree,
    };
  }
  reserve(
    h: HospitalOption,
    requests: BedRequest[],
    owner: string,
    mission: string,
    assignment: string,
    at: number,
  ) {
    this.transaction();
    if (
      !h.open ||
      !h.id.startsWith("public:") ||
      !requests.length ||
      new Set(requests.map((r) => r.patient)).size !== requests.length
    )
      return false;
    const lookup = this.sql.prepare(
      "SELECT * FROM clinic_places WHERE patient=?",
    );
    const changes: BedRequest[] = [];
    let returned = 0;
    const returnedDepartments: Record<string, number> = {};
    for (const request of requests) {
      if (request.departments.some((d) => !h.specialties.includes(d)))
        return false;
      const row = lookup.get(request.patient);
      if (row && row.owner !== owner)
        throw Error("Patient besitzt bereits eine andere Transportzuordnung.");
      if (row && ["occupied", "discharged"].includes(String(row.state)))
        return false;
      if (row?.state === "reserved") {
        if (row.transport !== assignment || row.mission !== mission)
          throw Error(
            "Patient ist bereits einem anderen Transport zugeordnet.",
          );
        if (
          row.clinic === h.id &&
          row.departments === JSON.stringify(request.departments)
        )
          continue;
        if (row.clinic === h.id) {
          returned++;
          for (const d of JSON.parse(String(row.departments)) as string[])
            returnedDepartments[d] = (returnedDepartments[d] ?? 0) + 1;
        }
      }
      changes.push(request);
    }
    if (!changes.length) return true;
    const snapshot = this.snapshot(h);
    if (snapshot.free + returned < changes.length) return false;
    for (const d of h.specialties)
      if (
        (snapshot.departmentFree[d] ?? 0) + (returnedDepartments[d] ?? 0) <
        changes.filter((r) => r.departments.includes(d)).length
      )
        return false;
    const revision = this.changed();
    for (const r of changes)
      this.sql
        .prepare(
          `INSERT INTO clinic_places VALUES(?,?,?,?,?,?,'reserved',?,NULL,NULL,?)
      ON CONFLICT(patient) DO UPDATE SET clinic=excluded.clinic,owner=excluded.owner,mission=excluded.mission,transport=excluded.transport,departments=excluded.departments,state='reserved',created=excluded.created,admitted=NULL,discharge=NULL,revision=excluded.revision`,
        )
        .run(
          r.patient,
          h.id,
          owner,
          mission,
          assignment,
          JSON.stringify(r.departments),
          at,
          revision,
        );
    return true;
  }
  admit(owner: string, assignment: string, clinic: string, at: number) {
    this.transaction();
    const rows = this.sql
      .prepare(
        "SELECT patient FROM clinic_places WHERE owner=? AND transport=? AND clinic=? AND state='reserved'",
      )
      .all(owner, assignment, clinic);
    if (!rows.length) {
      const prior = this.sql
        .prepare(
          "SELECT count(*) n FROM clinic_places WHERE owner=? AND transport=? AND clinic=? AND state IN('occupied','discharged')",
        )
        .get(owner, assignment, clinic);
      if (Number(prior?.n)) return 0;
      throw Error("Klinikübergabe ohne bestätigte Bettreservierung.");
    }
    const revision = this.changed();
    this.sql
      .prepare(
        "UPDATE clinic_places SET state='occupied',admitted=?,discharge=?,revision=? WHERE owner=? AND transport=? AND clinic=? AND state='reserved'",
      )
      .run(
        at,
        at + BALANCE.hospitalSeconds,
        revision,
        owner,
        assignment,
        clinic,
      );
    return rows.length;
  }
  cancel(owner: string, assignment: string, _at: number) {
    this.transaction();
    const result = this.sql
      .prepare(
        "UPDATE clinic_places SET state='cancelled' WHERE owner=? AND transport=? AND state='reserved'",
      )
      .run(owner, assignment);
    if (result.changes) this.changed();
  }
  advance(at: number) {
    this.transaction();
    const result = this.sql
      .prepare(
        "UPDATE clinic_places SET state='discharged' WHERE state='occupied' AND discharge<=?",
      )
      .run(at);
    if (result.changes) this.changed();
  }
}
