import type { Save, Mission, Vehicle } from "../shared/model";
import { matchingAidType } from "../simulation/aid-matching";
import { urgentPriority } from "../simulation/priority";
import type { AidAction, AidRequest } from "../simulation/organizations-schema";
import { vt, mt, type Skills } from "../shared/catalog";
import { effectiveSkills } from "../simulation/major-resources";
import { assessRemoteWithdrawal } from "../simulation/withdrawal";
import { beginTrip, readiness, recall } from "../shared/engine";
import { dispatchable } from "../simulation/dispatch";
import { planTurnout } from "../simulation/staffing";
import { record, simId, writable } from "../simulation/events";
import { setFms, operativeCode } from "../simulation/fms";
import { publicSave, request } from "../simulation/incidents";
export const aidActive = (r: AidRequest) =>
  r.state === "ACCEPTED" || r.state === "IN_PROGRESS";
export function authorizedHelper(
  owner: Save,
  m: Mission,
  helper: Save,
  v: Vehicle,
) {
  if (m.shared && (!m.control || m.control.legacy)) return true;
  return owner.aid.some(
    (r) =>
      r.mission === m.id &&
      r.round === m.round &&
      r.peer === helper.player.id &&
      aidActive(r) &&
      r.assignments.some(
        (a) => a.vehicle === v.id && a.assignment === v.assignment,
      ),
  );
}
export function aidCommand(
  saves: Map<string, Save>,
  s: Save,
  a: AidAction,
  actor: string,
  eligible: Set<string>,
) {
  if (a.type === "aid-draft") {
    const m = s.missions.find((m) => m.id === a.mission);
    if (!m || m.phase === "done") throw Error("Eigener offener Einsatz fehlt.");
    dispatchable(m);
    writable(m);
    if (a.peer === s.player.id || !eligible.has(a.peer) || !saves.has(a.peer))
      throw Error("Unabhängige Nachbarleitstelle fehlt.");
    a.types.forEach(vt);
    if (
      s.aid.filter((r) => !["DONE", "DECLINED", "CANCELLED"].includes(r.state))
        .length >= 30
    )
      throw Error("Maximal 30 offene Anfragen.");
    if (s.aid.length >= 500) {
      const index = s.aid.findIndex((r) =>
        ["DONE", "DECLINED", "CANCELLED"].includes(r.state),
      );
      if (index < 0) throw Error("Anfragearchiv voll.");
      s.aid.splice(index, 1);
    }
    s.aid.push({
      version: 2,
      vehicleWishes: a.vehicleWishes ?? [],
      id: simId(s),
      owner: s.player.id,
      peer: a.peer,
      mission: m.id,
      round: m.round,
      state: "DRAFT",
      priority: a.priority,
      types: a.types,
      message: a.message,
      created: s.time,
      updated: s.time,
      assignments: [],
      messages: [],
    });
    return;
  }
  const owner = a.type === "aid-send" ? s : saves.get(a.owner);
  const r = owner?.aid.find((r) => r.id === a.id);
  if (
    !owner ||
    !r ||
    (r.owner !== s.player.id && (r.peer !== s.player.id || r.state === "DRAFT"))
  )
    throw Error("Anfrage nicht zugänglich.");
  const m = owner.missions.find(
    (m) => m.id === r.mission && m.round === r.round,
  );
  const isOwner = owner === s;
  if (!m || ["DONE", "DECLINED", "CANCELLED"].includes(r.state))
    throw Error("Anfrage ist bereits beendet.");
  writable(m);
  if (a.type === "aid-send") {
    if (!isOwner || r.state !== "DRAFT" || !eligible.has(r.peer))
      throw Error("Entwurf kann nicht versendet werden.");
    if (
      [...saves.values()]
        .flatMap((s) => s.aid)
        .filter(
          (q) =>
            q.peer === r.peer &&
            ["SENT", "ACCEPTED", "IN_PROGRESS"].includes(q.state),
        ).length >= 30
    )
      throw Error("Nachbarleitstelle hat bereits 30 offene Anfragen.");
    r.state = "SENT";
    for (const wish of r.vehicleWishes ?? [])
      record(
        owner,
        m,
        "AID_VEHICLE_WISH",
        `Anfrage ${r.id} · Original-Fahrzeugwunsch: ${wish}`,
        actor,
      );
  } else if (a.type === "aid-message") {
    if (r.state === "DRAFT" || r.messages.length >= 100)
      throw Error("Nachricht derzeit nicht möglich.");
    r.messages.push({
      actor,
      name: s.player.station,
      at: owner.time,
      text: a.text,
    });
  } else if (a.type === "aid-accept") {
    if (isOwner || !["SENT", "ACCEPTED", "IN_PROGRESS"].includes(r.state))
      throw Error("Nur die angefragte Leitstelle kann Kräfte zusagen.");
    if (new Set(a.vehicles).size !== a.vehicles.length)
      throw Error("Fahrzeug doppelt ausgewählt.");
    const participants = new Set([
      ...m.contributors,
      ...owner.aid
        .filter((q) => q.mission === m.id && aidActive(q))
        .map((q) => q.peer),
    ]);
    if (participants.size >= 4 && !participants.has(s.player.id))
      throw Error("Maximal vier unterstützende Leitstellen.");
    const remaining = [...r.types];
    for (const assigned of r.assignments) {
      const n = remaining.indexOf(assigned.requestedType ?? assigned.type);
      if (n >= 0) remaining.splice(n, 1);
    }
    for (const id of a.vehicles) {
      const v = s.vehicles.find((v) => v.id === id);
      if (!v) throw Error("Eigenes Fahrzeug fehlt.");
      const index = matchingAidType(remaining, v.type);
      if (index < 0)
        throw Error("Dieser Fahrzeugtyp wurde nicht mehr angefordert.");
      const requestedType = remaining.splice(index, 1)[0];
      const reason = readiness(s, v);
      if (reason) throw Error(`${v.name}: ${reason}`);
      if (vt(v.type).mode === "water" && !mt(m.template).water)
        throw Error("Boot benötigt Gewässereinsatz.");
      v.assignment = simId(s);
      v.mission = `remote:${owner.player.id}:${m.id}`;
      const delay = planTurnout(s, v, 60);
      beginTrip(s, v, m.pos, "travel");
      v.depart += delay;
      v.arrive += delay;
      v.status = "alarmed";
      if (v.journey) v.journey.nextCheck = v.depart + 60;
      setFms(s, v, 9, actor, "Unterstützungsanfrage angenommen");
      const initialFms = s.desk.fleet[v.id].history.at(-1)!;
      const initialEvent = record(
        owner,
        m,
        "AID_FMS",
        `${s.player.station} · ${v.name}: ${initialFms.text}`,
        actor,
        v.id,
      );
      if (initialEvent) initialEvent.assignment = v.assignment;
      r.assignments.push({
        requestedType,
        name: v.name,
        vehicle: v.id,
        assignment: v.assignment,
        type: v.type,
        lastFms: initialFms.id,
      });
      s.contributions = s.contributions
        .filter((c) => c.status === "active")
        .slice(-499);
      s.contributions.push({
        assignment: v.assignment,
        peer: owner.player.id,
        mission: m.id,
        round: m.round,
        vehicle: v.id,
        maxReward: m.paymentCents ?? mt(m.template).reward,
        status: "active",
      });
    }
    r.state = r.state === "IN_PROGRESS" ? "IN_PROGRESS" : "ACCEPTED";
  } else {
    if (a.op === "decline" && (isOwner || r.state !== "SENT"))
      throw Error("Nur eine offene Anfrage kann abgelehnt werden.");
    if (a.op === "cancel" && !isOwner)
      throw Error("Nur die anfragende Leitstelle kann zurückziehen.");
    if (a.op === "done" && !aidActive(r))
      throw Error("Kein laufender Unterstützungsauftrag.");
    const helper = saves.get(r.peer)!;
    const vehicles = helper.vehicles.filter((v) =>
      r.assignments.some((x) => x.assignment === v.assignment),
    );
    if (vehicles.some((v) => v.patients))
      throw Error("Laufenden Patiententransport zuerst abschließen.");
    if (vehicles.some((v) => v.status === "scene")) {
      const units: Vehicle[] = [];
      const skills: Skills = {};
      for (const assisting of saves.values())
        for (const v of assisting.vehicles) {
          if (
            v.mission !== `remote:${owner.player.id}:${m.id}` ||
            !authorizedHelper(owner, m, assisting, v)
          )
            continue;
          units.push(v);
          if (v.status !== "scene" || v.arrive > owner.time) continue;
          for (const [key, amount] of Object.entries(effectiveSkills(m, v)))
            skills[key] = (skills[key] || 0) + amount;
        }
      const assessment = assessRemoteWithdrawal(
        owner,
        m,
        vehicles.map((v) => v.id),
        skills,
        units,
      );
      if (!assessment.allowed) throw Error(assessment.reasons.join(" "));
    }
    for (const v of vehicles) recall(helper, v);
    r.state =
      a.op === "decline"
        ? "DECLINED"
        : a.op === "cancel"
          ? "CANCELLED"
          : "DONE";
  }
  r.updated = owner.time;
  record(
    owner,
    m,
    "AID_UPDATED",
    `Anfrage ${r.id.slice(-6)}: ${r.state} · ${a.type === "aid-message" ? a.text : `${r.assignments.length}/${r.types.length} Fahrzeuge zugesagt`}.`,
    actor,
  );
}
import {
  aidHalfHour,
  newOperatingBill,
  operatingCostTick,
} from "../simulation/operating-costs";
export function aidTick(saves: Map<string, Save>) {
  for (const owner of saves.values())
    for (const r of owner.aid) {
      if (aidActive(r)) r.billing ??= newOperatingBill(owner.time);
      if (r.billing)
        operatingCostTick(
          owner,
          r.billing,
          aidHalfHour(r),
          aidActive(r),
          r.id,
          "Kosten externer Unterstützung",
        );
      if (["DONE", "DECLINED", "CANCELLED"].includes(r.state)) continue;
      const m = owner.missions.find(
        (m) => m.id === r.mission && m.round === r.round,
      );
      if (!m) {
        r.state = aidActive(r) ? "DONE" : "CANCELLED";
        r.updated = owner.time;
        continue;
      }
      if (!aidActive(r)) continue;
      const helper = saves.get(r.peer);
      if (!helper) continue;
      for (const v of helper.vehicles.filter((v) =>
        r.assignments.some((a) => a.assignment === v.assignment),
      )) {
        if (v.status !== "alarmed" && r.state === "ACCEPTED") {
          r.state = "IN_PROGRESS";
          r.updated = owner.time;
        }
        const fms = helper.desk.fleet[v.id],
          assigned = r.assignments.find((a) => a.assignment === v.assignment)!;
        const radio =
          m.control?.radio.filter(
            (x) => x.vehicle === v.id && x.state === "open",
          ) || [];
        if (radio.length) {
          assigned.radio = true;
          setFms(
            helper,
            v,
            radio.some((r) => urgentPriority(r.priority)) ? 0 : 5,
            "server",
            "Funk bei anfragender Leitstelle",
          );
        } else if (assigned.radio) {
          assigned.radio = false;
          setFms(
            helper,
            v,
            operativeCode(v),
            "server",
            "Funk bei anfragender Leitstelle beendet",
          );
        }
        const latest = fms?.history.at(-1);
        if (latest && assigned.lastFms !== latest.id) {
          const index = fms.history.findIndex((e) => e.id === assigned.lastFms);
          const changes = index >= 0 ? fms.history.slice(index + 1) : [latest];
          for (const entry of changes) {
            const event = record(
              owner,
              m,
              "AID_FMS",
              `${helper.player.station} · ${v.name}: ${entry.text}`,
              entry.actor,
              v.id,
            );
            if (event) event.assignment = v.assignment!;
            if (entry.text.startsWith("FMS 6:") && m.control)
              request(
                owner,
                m,
                v.id,
                "request",
                `${v.name} der Nachbarleitstelle ausgefallen. Ersatz anfragen.`,
                "DRINGEND",
              );
          }
          assigned.lastFms = latest.id;
        }
        if (
          v.status === "scene" &&
          (!v.fault || v.fault.state === "repaired") &&
          m.control &&
          !m.control.firstArrival
        ) {
          m.control.firstArrival = v.id;
          m.control.stage = "recon";
          request(
            owner,
            m,
            v.id,
            "arrival",
            `Erkundung durch ${helper.player.station}: Lagemeldung liegt vor.`,
            r.priority,
          );
        }
      }
    }
}
export function aidView(saves: Map<string, Save>, user: string) {
  return [...saves.values()]
    .flatMap((s) => {
      const requests = s.aid.filter(
        (r) => r.owner === user || (r.peer === user && r.state !== "DRAFT"),
      );
      if (!requests.length) return [];
      const projected = publicSave(s),
        missions = new Map(
          [...projected.missions, ...projected.archive].map((m) => [
            m.round,
            m,
          ]),
        );
      return requests.map((r) => {
        const m = missions.get(r.round);
        return {
          ...r,
          ownerName: s.player.station,
          peerName: saves.get(r.peer)?.player.station || "Leitstelle",
          incident: m
            ? { name: mt(m.template).name, pos: m.pos, phase: m.phase }
            : null,
        };
      });
    })
    .sort((a, b) => b.updated - a.updated || a.id.localeCompare(b.id))
    .slice(0, 500);
}
