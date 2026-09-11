import { configuredSkills } from "./vehicle-equipment";
import type { Building, Save } from "../model";
import type { CivilProtectionAction } from "./civil-protection-schema";
import { isVolunteerStation, personDuty } from "./staffing";
import { volunteerArrival } from "./volunteers";
import { presentAtStation } from "./staging";
import { sample } from "./random";
import { mt } from "../catalog";
import { fleetReadiness } from "../fleet-view";
import {
  newOperatingBill,
  operatingCostTick,
  readinessHalfHour,
} from "./operating-costs";

export const civilStationTypes = ["fire", "ems", "thw", "kats"];
export const READINESS_POLICY = {
  minimum: 600,
  cooldown: 300,
  release: 180,
} as const;

export function civilReadinessReason(s: Save, b: Building) {
  const c = b.civilProtection;
  if (!c || c.state === "inactive")
    return "Reguläre Alarmierung mit üblicher Anreise";
  const staged = c.staging ?? [];
  const arrived = staged.filter((a) => a.available && a.at <= s.time).length;
  return c.state === "ready"
    ? `Bereitschaft: ${arrived} Kräfte eingetroffen`
    : `Bereitschaft wird gesammelt: ${arrived}/${staged.filter((a) => a.available).length} Kräfte eingetroffen`;
}
function entry(b: Building, at: number, actor: string, text: string) {
  b.civilProtection!.history.push({ at, actor, text });
  b.civilProtection!.history = b.civilProtection!.history.slice(-200);
}
function bound(s: Save, person: Save["people"][number]) {
  return (
    !!person.vehicle &&
    s.vehicles.some(
      (v) =>
        v.id === person.vehicle &&
        (v.status !== "ready" || v.patients > 0 || v.postIncident),
    )
  );
}
function gather(s: Save, b: Building) {
  const c = b.civilProtection!;
  if (!isVolunteerStation(b)) {
    c.readyAt = c.started ?? s.time;
    c.staging = [];
    return;
  }
  c.staging ??= [];
  const ids = new Set(c.staging.map((a) => a.person));
  for (const p of s.people.filter(
    (p) => p.home === b.id && !p.professional && !bound(s, p),
  )) {
    if (ids.has(p.id)) continue;
    p.duty = personDuty(s, p);
    const arrival = volunteerArrival(s, p, p.duty, b);
    c.staging.push(arrival);
  }
  c.readyAt = Math.max(
    c.started ?? s.time,
    ...c.staging.filter((a) => a.available).map((a) => a.at),
  );
  if (c.readyAt > s.time) c.state = "mobilizing";
}
/** Legacy readiness was only a timer. Keep its audit trail and order, but require
 * real journeys before claiming people are at the station. Never unbind a crew. */
export function migrateCivilProtection(s: Save) {
  let count = 0;
  for (const b of s.buildings) {
    const c = b.civilProtection;
    if (!c || c.version === 2) continue;
    c.version = 2;
    c.staging = [];
    if (c.state !== "inactive") {
      c.started = s.time;
      c.actor = "server";
      c.reason = "Übernahme bestehender Bereitschaft";
      c.minimumUntil = s.time + READINESS_POLICY.minimum;
      c.state = "mobilizing";
      gather(s, b);
      entry(
        b,
        s.time,
        "server",
        "Bereitschaft übernommen. Tatsächliche Anreise ersetzt den früheren Vorbereitungstimer.",
      );
    }
    count++;
  }
  return count;
}
export function civilProtectionTick(s: Save) {
  migrateCivilProtection(s);
  for (const b of s.buildings) {
    const c = b.civilProtection;
    if (!c) continue;
    if (c.state !== "inactive") c.billing ??= newOperatingBill(s.time);
    if (c.billing)
      operatingCostTick(
        s,
        c.billing,
        readinessHalfHour(s, b),
        c.state !== "inactive",
        b.id,
        `Katastrophenbereitschaft: ${b.name}`,
      );
    if (c.state !== "inactive") {
      gather(s, b);
      if (c.state === "mobilizing" && s.time >= c.readyAt) {
        c.state = "ready";
        entry(
          b,
          s.time,
          "server",
          "Erreichbare Kräfte eingetroffen. Besatzung, Qualifikation und Fahrzeugzustand gelten weiterhin.",
        );
      }
    } else if (c.staging) {
      for (const a of c.staging) {
        const p = s.people.find((p) => p.id === a.person);
        if (p && bound(s, p)) {
          // Returning units retain their people; release starts only at home.
          a.returnAt = s.time + READINESS_POLICY.release;
        }
      }
      c.staging = c.staging.filter(
        (a) => a.returnAt !== undefined && a.returnAt > s.time,
      );
    }
  }
}
export function civilProtectionCommand(
  s: Save,
  a: CivilProtectionAction,
  actor: string,
) {
  if (actor !== s.player.id)
    throw Error(
      "Katastrophenbereitschaft darf nur die Leitstellenleitung ändern.",
    );
  const ids = a.type === "civil-station" ? [a.home] : a.homes;
  if (new Set(ids).size !== ids.length)
    throw Error("Jede Wache nur einmal auswählen.");
  const homes = ids.map((id) => {
    const b = s.buildings.find((b) => b.id === id && b.owner === s.player.id);
    if (!b || !civilStationTypes.includes(b.type))
      throw Error(
        "Eigene Feuerwehr-, Rettungsdienst-, THW- oder KatS-Wache erforderlich.",
      );
    if (b.ready > s.time) throw Error("Bauarbeiten zuerst abschließen.");
    return b;
  });
  for (const b of homes) {
    const c = b.civilProtection;
    if (a.type === "civil-station" && c && c.state !== "inactive")
      throw Error("Katastrophenbereitschaft zuerst beenden.");
    if (a.type === "civil-readiness") {
      if (a.op === "mobilize" && (c?.cooldownUntil ?? 0) > s.time)
        throw Error("Bereitschaft befindet sich noch in der Abklingzeit.");
      if (a.op === "stand-down" && (c?.minimumUntil ?? 0) > s.time)
        throw Error("Mindestlaufzeit der Bereitschaft: zehn Minuten.");
    }
  }
  for (const b of homes) {
    b.civilProtection ??= {
      version: 2,
      enabled: true,
      preparation: 600,
      state: "inactive",
      readyAt: 0,
      staging: [],
      history: [],
    };
    const c = b.civilProtection;
    if (a.type === "civil-station") {
      c.enabled = a.enabled;
      c.preparation = a.preparation;
      entry(
        b,
        s.time,
        actor,
        a.enabled
          ? "Standort für Katastrophenbereitschaft ausgewählt. Reguläre Alarmierung bleibt möglich."
          : "Vorauswahl aufgehoben. Reguläre Alarmierung bleibt möglich.",
      );
      continue;
    }
    if (a.op === "mobilize") {
      if (c.state !== "inactive") continue;
      c.version = 2;
      c.enabled = true;
      c.state = "mobilizing";
      c.started = s.time;
      c.billing ??= newOperatingBill(s.time);
      c.billing.lastAt = s.time;
      c.billing.nextAt = s.time + 1800;
      c.actor = actor;
      c.reason = a.reason ?? "Erhöhtes Einsatzaufkommen";
      c.minimumUntil = s.time + READINESS_POLICY.minimum;
      // A reactivated reserve retains already arrived people until their release.
      c.staging = (c.staging ?? []).filter((a) => (a.returnAt ?? 0) > s.time);
      for (const a of c.staging) delete a.returnAt;
      gather(s, b);
      entry(
        b,
        s.time,
        actor,
        `Katastrophenbereitschaft angeordnet: ${c.reason}`,
      );
    } else {
      if (c.state === "inactive") continue;
      if (c.billing) {
        operatingCostTick(
          s,
          c.billing,
          readinessHalfHour(s, b),
          true,
          b.id,
          `Katastrophenbereitschaft: ${b.name}`,
        );
        operatingCostTick(
          s,
          c.billing,
          readinessHalfHour(s, b),
          false,
          b.id,
          `Katastrophenbereitschaft: ${b.name}`,
        );
      }
      c.state = "inactive";
      c.readyAt = 0;
      c.ended = s.time;
      c.cooldownUntil = s.time + READINESS_POLICY.cooldown;
      for (const a of c.staging ?? [])
        a.returnAt =
          Math.max(s.time, a.at) +
          READINESS_POLICY.release +
          Math.floor(
            sample(s.seed, `reserve-release:${a.person}:${c.started}`) *
              READINESS_POLICY.release,
          );
      entry(
        b,
        s.time,
        actor,
        "Bereitschaft beendet. Freie Reserve kehrt gestaffelt zurück; laufende Einsätze und Anreisen bleiben erhalten.",
      );
    }
  }
}
export function readinessRecommendation(s: Save) {
  const open = s.missions.filter((m) => m.phase !== "done").length;
  const waiting = s.missions
    .flatMap((m) => m.control?.calls ?? [])
    .filter((c) => c.state === "ringing").length;
  const fleet = s.vehicles;
  const boundCount = fleet.filter((v) => v.status !== "ready").length;
  const oldest = Math.max(
    0,
    ...s.missions.flatMap((m) =>
      (m.control?.calls ?? [])
        .filter((c) => c.state === "ringing")
        .map((c) => s.time - c.created),
    ),
  );
  const urgent = s.missions.filter(
    (m) =>
      m.control?.briefed &&
      ["DRINGEND", "NOTFALL"].includes(m.control.priority),
  ).length;
  const ready = fleetReadiness(s),
    skills: Record<string, number> = {};
  for (const v of fleet.filter((v) => !ready(v)))
    for (const [k, n] of Object.entries(configuredSkills(v)))
      skills[k] = (skills[k] ?? 0) + n;
  const gaps = s.missions.filter(
    (m) =>
      m.control?.reportedTemplate &&
      Object.entries(mt(m.control.reportedTemplate).requirements).some(
        ([k, n]) => (skills[k] ?? 0) < n,
      ),
  ).length;
  const score =
    Number(open >= 2) +
    Number(waiting > 0) +
    Number(oldest >= 120) +
    Math.min(2, urgent) +
    Number(boundCount >= Math.max(1, fleet.length * 0.6)) +
    Number(gaps > 0);
  const active = s.buildings.some(
    (b) => b.civilProtection && b.civilProtection.state !== "inactive",
  );
  const recommended = score >= (active ? 2 : 4);
  return {
    recommended,
    reason: recommended
      ? `${open} offene Einsätze, ${waiting} wartende Notrufe (ältester ${Math.floor(oldest)} s), ${urgent} dringende Lagen, ${gaps} Vorgänge mit fehlender freier Fähigkeit, ${boundCount}/${fleet.length} Fahrzeuge gebunden`
      : "Reguläre Bereitschaft derzeit ausreichend",
    present: s.people.filter((p) => !bound(s, p) && presentAtStation(s, p))
      .length,
  };
}
export function validateCivilProtection(s: Save) {
  for (const b of s.buildings) {
    const c = b.civilProtection;
    if (!c) continue;
    if (
      !civilStationTypes.includes(b.type) ||
      (!c.enabled && c.state !== "inactive") ||
      (c.state === "inactive" ? c.readyAt !== 0 : c.readyAt <= 0) ||
      (c.state === "ready" && c.readyAt > s.time)
    )
      throw Error("Ungültige KatS-Wache oder Bereitschaftszeit.");
    const seen = new Set<string>();
    for (const a of c.staging ?? []) {
      if (
        seen.has(a.person) ||
        !s.people.some((p) => p.id === a.person && p.home === b.id)
      )
        throw Error("Ungültige oder doppelte Bereitschaftsperson.");
      seen.add(a.person);
    }
  }
}
