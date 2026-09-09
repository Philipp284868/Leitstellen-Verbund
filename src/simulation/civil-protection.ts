import type { Building, Save } from "../model";
import type { CivilProtectionAction } from "./civil-protection-schema";

export const civilStationTypes = ["fire", "ems", "thw"];

export function civilReadinessReason(s: Save, b: Building) {
  const c = b.civilProtection;
  if (
    !c?.enabled ||
    c.state === "ready" ||
    (c.state === "mobilizing" && s.time >= c.readyAt)
  )
    return "";
  return c.state === "inactive"
    ? "KatS-Wache nicht mobilisiert. Katastrophenbereitschaft aktivieren."
    : `KatS-Wache wird vorbereitet: noch ${Math.ceil(c.readyAt - s.time)} Sekunden.`;
}

function entry(b: Building, at: number, actor: string, text: string) {
  b.civilProtection!.history.push({ at, actor, text });
  b.civilProtection!.history = b.civilProtection!.history.slice(-200);
}

export function civilProtectionTick(s: Save) {
  for (const b of s.buildings) {
    const c = b.civilProtection;
    if (c?.state === "mobilizing" && s.time >= c.readyAt) {
      c.state = "ready";
      entry(
        b,
        c.readyAt,
        "server",
        "Vorbereitung abgeschlossen. Reguläre Besatzungs- und Fahrzeugprüfung gilt weiterhin.",
      );
    }
  }
}

export function civilProtectionCommand(
  s: Save,
  a: CivilProtectionAction,
  actor: string,
) {
  const ids = a.type === "civil-station" ? [a.home] : a.homes;
  if (new Set(ids).size !== ids.length)
    throw Error("Jede Wache nur einmal auswählen.");
  const homes = ids.map((id) => {
    const b = s.buildings.find((b) => b.id === id);
    if (!b || !civilStationTypes.includes(b.type))
      throw Error(
        "Eigene Feuerwehr-, Rettungsdienst- oder THW-Wache erforderlich.",
      );
    if (b.ready > s.time) throw Error("Bauarbeiten zuerst abschließen.");
    return b;
  });
  // Validate the whole batch before changing any station.
  for (const b of homes) {
    const c = b.civilProtection;
    if (a.type === "civil-station") {
      if (c && c.state !== "inactive")
        throw Error("Katastrophenbereitschaft zuerst beenden.");
    } else if (!c?.enabled)
      throw Error("Nur ausgewiesene KatS-Wachen können mobilisiert werden.");
    if (
      (a.type === "civil-station" || a.op === "stand-down") &&
      s.vehicles.some(
        (v) => v.home === b.id && (v.status !== "ready" || v.postIncident),
      )
    )
      throw Error(
        "Alle Fahrzeuge müssen zurück und ihre Nachbereitung abgeschlossen sein.",
      );
  }
  for (const b of homes) {
    if (a.type === "civil-station") {
      if (!a.enabled) {
        if (b.civilProtection?.enabled) {
          b.civilProtection.enabled = false;
          entry(
            b,
            s.time,
            actor,
            "Standort wieder als reguläre Wache geführt.",
          );
        }
      } else {
        b.civilProtection ??= {
          enabled: false,
          preparation: a.preparation,
          state: "inactive",
          readyAt: 0,
          history: [],
        };
        if (
          b.civilProtection.enabled &&
          b.civilProtection.preparation === a.preparation
        )
          continue;
        b.civilProtection.enabled = true;
        b.civilProtection.preparation = a.preparation;
        entry(
          b,
          s.time,
          actor,
          `KatS-Wache eingerichtet: ${a.preparation} Sekunden Vorbereitung.`,
        );
      }
      continue;
    }
    const c = b.civilProtection!;
    if (a.op === "mobilize") {
      if (c.state !== "inactive") continue;
      c.state = "mobilizing";
      c.readyAt = s.time + c.preparation;
      entry(
        b,
        s.time,
        actor,
        "Katastrophenbereitschaft angeordnet; Vorbereitung läuft.",
      );
    } else {
      if (c.state === "inactive") continue;
      c.state = "inactive";
      c.readyAt = 0;
      entry(b, s.time, actor, "Katastrophenbereitschaft beendet.");
    }
  }
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
  }
}
