import type { Save, Vehicle } from "../model";
import { withdraw } from "./withdrawal";
import { vt, capabilities } from "../catalog";
import { callAction } from "./calls";
import { propose } from "./dispatch";
import { radioAction } from "./incidents";
import { setFms } from "./fms";
import { repairVehicle } from "./faults";
import { record } from "./events";
import { writable } from "./events";
import type { DeskAction } from "./actions";
export function deskCommand(
  s: Save,
  a: DeskAction,
  actor: string,
  remote: Record<string, number> = {},
  remoteUnits: readonly Vehicle[] = [],
) {
  if ("mission" in a) {
    const m = s.missions.find((m) => m.id === a.mission);
    if (!m?.control) throw Error("Eigener laufender Einsatz fehlt.");
    writable(m);
    if (a.type === "withdraw") {
      withdraw(s, m, a.vehicles, actor, remote, remoteUnits);
      return;
    }
    if (a.type === "tactic" || a.type === "patient-care") {
      if (!m.dynamics?.active || !m.control.briefed)
        throw Error("Lagemeldung zuerst aufnehmen.");
      if (a.type === "tactic") {
        if (m.dynamics.tactic === a.tactic) return;
        m.dynamics.tactic = a.tactic;
        record(s, m, "TACTIC_CHANGED", `Taktik geändert: ${a.tactic}.`, actor);
      } else {
        const p = m.dynamics.patients.find((p) => p.id === a.patient);
        if (!p || p.condition === "dead" || p.transport === "delivered")
          throw Error("Kein behandelbarer Patient.");
        if (p.care === a.care && p.priority === a.priority) return;
        p.care = a.care;
        p.priority = a.priority;
        record(
          s,
          m,
          "PATIENT_CARE_ORDERED",
          `Patient ${p.id.slice(-6)}: ${a.care}, ${a.priority}.`,
          actor,
        );
      }
    }
    if (a.type === "mission-note") {
      if (!m.control.locationKnown || !m.control.reportedTemplate)
        throw Error("Zuerst Ort und Meldebild erfragen.");
      record(s, m, "SITUATION_NOTE", a.text, actor);
    }
    if (a.type === "call") callAction(s, m, a.call, a.op, actor, a.question);
    if (a.type === "radio") radioAction(s, m, a.id, a.op, actor, remote);
    if (a.type === "aao-propose") {
      const aa = s.desk.aaos.find((x) => x.id === a.aao);
      if (!aa) throw Error("AAO fehlt.");
      propose(s, m, aa, actor, remote);
    }
  } else if (a.type === "repair") {
    const v = s.vehicles.find((v) => v.id === a.vehicle);
    if (!v) throw Error("Eigenes Fahrzeug fehlt.");
    repairVehicle(s, v, actor);
  } else if (a.type === "aao-save") {
    if (!a.aao.types.length && !Object.values(a.aao.skills).some((n) => n > 0))
      throw Error(
        "Mindestens eine Fähigkeit oder einen bevorzugten Fahrzeugtyp angeben.",
      );
    a.aao.types.forEach(vt);
    if (Object.keys(a.aao.skills).some((k) => !Object.hasOwn(capabilities, k)))
      throw Error("Unbekanntes Sondermittel.");
    const index = s.desk.aaos.findIndex((x) => x.id === a.aao.id);
    if (index < 0) {
      if (s.desk.aaos.length >= 30) throw Error("Maximal 30 AAO.");
      s.desk.aaos.push(a.aao);
    } else s.desk.aaos[index] = a.aao;
  } else if (a.type === "aao-delete")
    s.desk.aaos = s.desk.aaos.filter((x) => x.id !== a.id);
  else if (a.type === "alarm-profile") {
    if (!s.buildings.some((b) => b.id === a.home))
      throw Error("Eigene Wache fehlt.");
    s.desk.alarms[a.home] = a.profile;
  } else if (a.type === "fms-definitions") s.desk.definitions[a.org] = a.labels;
  else if (a.type === "fms") {
    const v = s.vehicles.find((v) => v.id === a.vehicle);
    if (!v) throw Error("Eigenes Fahrzeug fehlt.");
    const m = s.missions.find((m) => m.id === v.mission);
    if (m) writable(m);
    setFms(s, v, a.code, actor, a.reason);
  }
}
