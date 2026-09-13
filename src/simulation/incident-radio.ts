import type { Mission, Save } from "../shared/model";
import { radioNetwork, transmit } from "./transmissions";
import { priorityRank } from "./priority";

export const incidentRadioId = (s: Save, m: Mission) =>
  `incident:${m.id}:${s.player.id}`;
const trim = (text: string) =>
  text.length > 600
    ? text.slice(0, 560) + " … Weitere Anliegen in den Einsatzdetails."
    : text;
export function updateIncidentRadio(s: Save, m: Mission, silent = false) {
  const c = m.control;
  if (!c || (!c.firstArrival && !c.radio.length && !c.radioSummary)) return;
  const open = c.radio
    .filter(
      (r) =>
        m.phase !== "done" &&
        r.state === "open" &&
        (c.briefed || c.legacy || r.reason === "arrival"),
    )
    .sort(
      (a, b) =>
        priorityRank(b.priority) - priorityRank(a.priority) ||
        a.created - b.created ||
        a.id.localeCompare(b.id),
    );
  const local = s.vehicles
    .filter(
      (v) =>
        v.mission === m.id &&
        v.status === "scene" &&
        (!v.fault || v.fault.state === "repaired"),
    )
    .sort((a, b) => a.arrive - b.arrive || a.id.localeCompare(b.id));
  const old = c.radioSummary;
  const speaker =
    local.find((v) => v.id === old?.speaker)?.id ||
    local.find((v) => v.id === c.firstArrival)?.id ||
    local[0]?.id ||
    c.firstArrival ||
    open[0]?.vehicle ||
    "";
  const eligible = !!c.firstArrival || local.length > 0;
  const sender =
    s.vehicles.find((v) => v.id === speaker)?.name ??
    old?.sender ??
    "Einsatzführung";
  const recent = c.events
    .filter((e) =>
      /^(REPORT_RECEIVED|MISSION_(ESCALATED|DOWNGRADED|STABILIZED|CLOSED|COMPLETED)|PATIENT_|FAULT_|WATER_)/.test(
        e.type,
      ),
    )
    .at(-1);
  const text =
    !c.briefed && !c.legacy
      ? eligible
        ? "Erste Erkundung abgeschlossen. Lagemeldung liegt vor."
        : "Fahrzeughinweis liegt vor. Erkundung steht noch aus."
      : trim(
          [
            open.length
              ? `${open.length} offene Anliegen: ${open.map((r) => r.details).join(" · ")}`
              : "Keine offenen Funkanliegen.",
            recent?.text ?? "",
          ]
            .filter(Boolean)
            .join(" · "),
        );
  const priority = open.some((r) => r.priority === "NOTFALL")
    ? 100
    : open.length
      ? 80
      : 50;
  const unresolved = open.length > 0;
  if (
    old &&
    (old.notified || !eligible) &&
    old.text === text &&
    old.speaker === speaker &&
    old.priority === priority &&
    old.unresolved === unresolved &&
    s.radioNetwork?.entries.some((e) => e.id === old.id)
  )
    return;
  const summary = (c.radioSummary ??= {
    id: incidentRadioId(s, m),
    version: 0,
    at: s.time,
    updated: s.time,
    speaker,
    sender,
    text,
    priority,
    unresolved,
    notified: silent,
    history: [],
  });
  summary.version++;
  summary.updated = s.time;
  Object.assign(summary, { text, speaker, sender, priority, unresolved });
  if (summary.history.at(-1)?.text !== text)
    summary.history.push({ version: summary.version, at: s.time, text });
  const network = radioNetwork(s);
  let entry = network.entries.find((e) => e.id === summary.id);
  if (!entry) {
    const alreadyNotified = summary.notified;
    transmit(s, {
      id: summary.id,
      channel: "Einsatzfunk",
      sender,
      vehicle: speaker,
      mission: m.id,
      text,
      priority,
      consolidated: true,
      silent: alreadyNotified || silent || !eligible,
      contentVersion: summary.version,
      unresolved,
    });
    entry = network.entries.find((e) => e.id === summary.id)!;
  } else {
    Object.assign(entry, {
      text,
      sender,
      vehicle: speaker,
      priority,
      contentVersion: summary.version,
      unresolved,
    });
    if (silent) {
      entry.silent = true;
      entry.state = "delivered";
    }
    if (!summary.notified && eligible && !silent) {
      entry.state = "queued";
      entry.silent = false;
      entry.created = s.time;
      delete entry.started;
      delete entry.ends;
    }
  }
  if (eligible || silent) summary.notified = true;
}
/** The owner retains each recipient's notification receipt even if a display queue rotates. */
export function syncAssistanceRadio(
  owner: Save,
  m: Mission,
  helper: Save,
  silent = false,
  authorized = true,
) {
  const summary = m.control?.radioSummary;
  if (!summary?.notified) return;
  const receivers = (summary.receivers ??= {});
  const id = incidentRadioId(helper, m);
  const serving = helper.vehicles.some(
    (v) =>
      v.mission === `remote:${owner.player.id}:${m.id}` &&
      !["return", "ready"].includes(v.status),
  );
  if (!authorized || !serving) {
    const entry = helper.radioNetwork?.entries.find((e) => e.id === id);
    if (
      entry &&
      entry.text !==
        "Unterstützung beendet. Kein offener Auftrag dieser Leitstelle."
    ) {
      entry.text =
        "Unterstützung beendet. Kein offener Auftrag dieser Leitstelle.";
      entry.unresolved = false;
      entry.silent = true;
      entry.state = "delivered";
      entry.contentVersion = (entry.contentVersion ?? 0) + 1;
    }
    return;
  }
  if (
    receivers[helper.player.id] === undefined &&
    !helper.vehicles.some(
      (v) =>
        v.mission === `remote:${owner.player.id}:${m.id}` &&
        ["scene", "transport"].includes(v.status),
    )
  )
    return;
  const network = radioNetwork(helper);
  const entry = network.entries.find((e) => e.id === id);
  if (entry)
    Object.assign(entry, {
      text: summary.text,
      contentVersion: summary.version,
      unresolved: summary.unresolved,
      priority: summary.priority,
      sender: summary.sender,
    });
  else
    transmit(helper, {
      id,
      channel: "Einsatzfunk",
      sender: summary.sender,
      vehicle: summary.speaker,
      mission: `remote:${owner.player.id}:${m.id}`,
      text: summary.text,
      priority: summary.priority,
      consolidated: true,
      silent: silent || receivers[helper.player.id] !== undefined,
      contentVersion: summary.version,
      unresolved: summary.unresolved,
    });
  receivers[helper.player.id] = summary.version;
}
/** Restore old outstanding concerns in place; no old message is replayed on upgrade. */
export function migrateIncidentRadio(s: Save, m: Mission) {
  const c = m.control;
  if (
    !c ||
    c.radioSummary ||
    (!c.radio.length &&
      !c.events.some((e) =>
        ["REPORT_RECEIVED", "SPEAK_REQUESTED", "AID_FMS"].includes(e.type),
      ))
  )
    return;
  for (const r of c.radio) {
    r.version ??= 1;
    r.topic ??= `legacy:${r.id}`;
    r.active ??= r.state === "open";
  }
  updateIncidentRadio(s, m, true);
  const summaryId = incidentRadioId(s, m);
  for (const entry of radioNetwork(s).entries)
    if (entry.mission === m.id && entry.id !== summaryId) {
      entry.silent = true;
      entry.supersededBy = summaryId;
      entry.state = "delivered";
    }
}
