import type { Save } from "../../src/model";
import { mt, vt } from "../../src/catalog";
import { callAction } from "../../src/simulation/calls";
import { radioAction } from "../../src/simulation/incidents";
import { alarm } from "../../src/simulation/dispatch";
import { readiness } from "../../src/engine";
import { requirements } from "../../src/simulation/hazards";
import { organizationCommand } from "../../src/simulation/organizations";
/** Reproducible ideal single dispatcher, using the real call, alarm and report
 * operations. No position, journey duration or completed mission is fabricated. */
export function operate(s: Save) {
  const ordered = [...s.missions].sort((a, b) => a.created - b.created);
  const conversation = ordered.flatMap((m) =>
    (m.control?.calls || []).map((call) => ({ m, call })),
  );
  const active = conversation.find(({ call }) => call.state === "active");
  const next =
    active || conversation.find(({ call }) => call.state === "ringing");
  if (next) {
    const { m, call } = next;
    if (call.state === "ringing")
      callAction(s, m, call.id, "accept", s.player.id);
    else if (s.time >= call.nextAnswer) {
      const q = (
        ["calm", "report", "address", "people", "hazard"] as const
      ).find((q) => !call.asked.includes(q));
      if (q) callAction(s, m, call.id, "ask", s.player.id, q);
      else callAction(s, m, call.id, "end", s.player.id);
    }
  }
  for (const m of ordered) {
    const c = m.control;
    if (!c?.locationKnown || !c.reportedTemplate) continue;
    for (const r of c.radio.filter((r) => r.state === "open"))
      radioAction(
        s,
        m,
        r.id,
        r.reason === "arrival" ? "report" : "request",
        s.player.id,
      );
    if (c.briefed)
      for (const task of m.organization?.tasks ?? [])
        if (!task.ordered)
          organizationCommand(
            s,
            { type: "organization-task", mission: m.id, task: task.kind },
            s.player.id,
          );
    const required = {
      ...(c.briefed ? requirements(m) : mt(c.reportedTemplate).requirements),
    };
    for (const v of s.vehicles.filter((v) => v.mission === m.id))
      for (const [k, n] of Object.entries(vt(v.type).skills))
        required[k] = Math.max(0, (required[k] || 0) - n);
    const chosen: string[] = [];
    for (const v of s.vehicles.filter((v) => !readiness(s, v))) {
      if (
        !Object.entries(vt(v.type).skills).some(
          ([k, n]) => n > 0 && required[k] > 0,
        )
      )
        continue;
      chosen.push(v.id);
      for (const [k, n] of Object.entries(vt(v.type).skills))
        required[k] = Math.max(0, (required[k] || 0) - n);
    }
    if (chosen.length) alarm(s, m, chosen, s.player.id);
  }
}
