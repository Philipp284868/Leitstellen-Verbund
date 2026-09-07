import type { Save } from "../model";
import { vt, capabilities } from "../catalog";
import { callAction } from "./calls";
import { propose } from "./dispatch";
import { radioAction } from "./incidents";
import { setFms } from "./fms";
import { writable } from "./events";
import type { DeskAction } from "./actions";
export function deskCommand(s: Save, a: DeskAction, actor: string) {
  if ("mission" in a) {
    const m = s.missions.find((m) => m.id === a.mission);
    if (!m?.control) throw Error("Eigener laufender Einsatz fehlt.");
    writable(m);
    if (a.type === "call") callAction(s, m, a.call, a.op, actor, a.question);
    if (a.type === "radio") radioAction(s, m, a.id, a.op, actor);
    if (a.type === "aao-propose") {
      const aa = s.desk.aaos.find((x) => x.id === a.aao);
      if (!aa) throw Error("AAO fehlt.");
      propose(s, m, aa, actor);
    }
  } else if (a.type === "aao-save") {
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
