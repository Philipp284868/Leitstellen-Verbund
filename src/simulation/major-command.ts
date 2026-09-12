import { configuredSkills } from "./vehicle-equipment";
import { hospitalOptions } from "./hospitals";
import type { Save, Vehicle } from "../shared/model";
import { declareMajor } from "./major-incidents";
import { sectionNames, type MajorAction } from "./major-schema";
import { sectionSkills, effectiveSkills, placement } from "./major-resources";
import { writable, record } from "./events";
export function majorCommand(
  s: Save,
  a: MajorAction,
  actor: string,
  foreign: Vehicle[] = [],
) {
  const m = s.missions.find((m) => m.id === a.mission);
  if (!m?.control) throw Error("Eigener laufender Einsatz fehlt.");
  writable(m);
  if (a.type === "mission-priority") {
    if (!m.control.locationKnown)
      throw Error("Zuerst den Einsatzort erfragen.");
    m.control.priority = a.priority;
    record(
      s,
      m,
      "DISPATCH_PRIORITY",
      `Dispositionspriorität: ${a.priority}.`,
      actor,
    );
    return;
  }
  if (!m.control.briefed) throw Error("Zuerst Lagemeldung aufnehmen.");
  if (a.type === "major-declare") {
    declareMajor(s, m, actor);
    return;
  }
  const g = m.major;
  if (!g) throw Error("Keine ausgerufene Großlage.");
  const units = [...s.vehicles.filter((v) => v.mission === m.id), ...foreign];
  const active = units.filter(
    (v) => v.status === "scene" && (!v.fault || v.fault.state === "repaired"),
  );
  if (a.type === "major-leader") {
    const section = g.sections.find((x) => x.kind === a.section);
    if (!section) throw Error("Einsatzabschnitt fehlt.");
    if (!a.vehicle) delete section.leader;
    else {
      const v = units.find((v) => v.id === a.vehicle);
      if (
        !v?.assignment ||
        !["scene", "travel", "alarmed"].includes(v.status) ||
        ![a.section, "command"].includes(placement(m, v))
      )
        throw Error(
          "Leitungsfahrzeug muss dem Abschnitt oder der Einsatzleitung zugeordnet sein.",
        );
      section.leader = { vehicle: v.id, assignment: v.assignment };
    }
    record(
      s,
      m,
      "MAJOR_SECTION_LEADER",
      `${sectionNames[a.section]}: ${a.vehicle ? units.find((v) => v.id === a.vehicle)!.name : "zentrale Einsatzleitung"} übernimmt Abschnittsleitung.`,
      actor,
    );
  } else if (a.type === "major-section") {
    const section = g.sections.find((x) => x.kind === a.section);
    if (!section) throw Error("Einsatzabschnitt fehlt.");
    section.ordered = true;
    section.priority = a.priority;
    record(
      s,
      m,
      "MAJOR_SECTION_ORDERED",
      `${sectionNames[a.section]} beauftragt, Priorität ${a.priority}.`,
      actor,
    );
  } else if (a.type === "major-assign") {
    const v = units.find((v) => v.id === a.vehicle);
    if (
      !v?.assignment ||
      !["scene", "travel", "alarmed"].includes(v.status) ||
      v.patients
    )
      throw Error("Keine frei zuweisbare, autorisierte Einsatzkraft.");
    if (
      a.section !== "staging" &&
      (!g.sections.some((s) => s.kind === a.section) ||
        !sectionSkills[a.section].some((k) => configuredSkills(v)[k]))
    )
      throw Error("Fahrzeug passt nicht zum Abschnitt.");
    g.placements = g.placements.filter((p) => p.vehicle !== v.id);
    if (g.placements.length >= 100)
      throw Error("Maximal 100 Abschnittszuweisungen.");
    g.placements.push({
      vehicle: v.id,
      assignment: v.assignment,
      section: a.section,
    });
    const event = record(
      s,
      m,
      "MAJOR_VEHICLE_ASSIGNED",
      `${v.name} → ${sectionNames[a.section]}.`,
      actor,
      v.id,
    );
    if (event) event.assignment = v.assignment;
  } else if (a.type === "major-transports") {
    if (a.enabled && !g.sections.some((x) => x.kind === "medical" && x.done))
      throw Error("Behandlungsabschnitt zuerst aufbauen.");
    g.transports = a.enabled;
    record(
      s,
      m,
      "MAJOR_TRANSPORT_RELEASE",
      a.enabled
        ? "Priorisierte Transporte freigegeben."
        : "Neue Transporte angehalten; laufende Fahrten bleiben bestehen.",
      actor,
    );
  } else if (a.type === "major-triage") {
    const p = m.dynamics?.patients.find((p) => p.id === a.patient);
    if (!p || p.transport !== "scene" || p.condition === "dead")
      throw Error("Kein sichtbarer Patient am Einsatzort.");
    if (
      !active.some((v) => effectiveSkills(m, v).medical) ||
      m.organization?.tasks.some((t) => t.kind === "secure" && !t.done)
    )
      throw Error(
        "Gesicherte Einsatzstelle und medizinische Kräfte im Behandlungsabschnitt erforderlich.",
      );
    if (
      a.hospital &&
      a.hospital !== "public" &&
      !hospitalOptions(s, m.pos, 0).some((h) => h.id === a.hospital)
    )
      throw Error(
        "Eigenes Krankenhaus oder bestätigte öffentliche Klinik fehlt.",
      );
    p.triage = a.category;
    p.priority = a.category === "I" ? "urgent" : "normal";
    p.hospital = a.hospital;
    record(
      s,
      m,
      "MAJOR_TRIAGE",
      `Patient ${p.id.slice(-6)}: Sichtung ${a.category}, Ziel ${a.hospital || "automatisch"}.`,
      actor,
    );
  }
}
