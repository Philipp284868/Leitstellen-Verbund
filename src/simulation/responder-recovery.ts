import { z } from "zod";
import type { Save, Mission } from "../shared/model";
import type { Patient } from "./dynamics-schema";
import { record } from "./events";

export const responderInjurySchema = z
  .object({
    mission: z.string().min(1).max(100),
    patient: z.string().min(1).max(100),
    since: z.number().finite().nonnegative(),
    state: z.enum(["treatment", "recovery", "dead"]),
    until: z.number().finite().nonnegative(),
  })
  .strict();
export function injuryReason(s: Save, person: Save["people"][number]) {
  const injury = person.injury;
  if (!injury) return "";
  if (injury.state === "dead")
    return "Einsatzkraft verstorben; Ersatzpersonal erforderlich.";
  if (injury.state === "treatment")
    return "Einsatzkraft verletzt; Versorgung und Klinikübergabe ausstehend.";
  return injury.until > s.time
    ? "Einsatzkraft in Genesung nach Versorgung."
    : "";
}
export function injureResponder(
  s: Save,
  m: Mission,
  personId: string,
  patient: Patient,
) {
  const person = s.people.find((p) => p.id === personId);
  if (!person || injuryReason(s, person)) return;
  person.injury = {
    mission: m.id,
    patient: patient.id,
    since: s.time,
    state: "treatment",
    until: 0,
  };
  record(
    s,
    m,
    "CREW_INJURED",
    "Einsatzkraft verletzt und aus der aktiven Besatzung genommen. Ersatzkräfte erforderlich.",
    "server",
    person.vehicle || "",
  );
}
/** Patient handover is authoritative; closing an incident alone never heals a responder. */
export function syncResponderRecovery(s: Save, m: Mission) {
  if (!m.dynamics?.responders?.some((r) => r.patient)) return;
  for (const person of s.people) {
    const injury = person.injury;
    if (!injury || injury.mission !== m.id || injury.state !== "treatment")
      continue;
    const patient = m.dynamics?.patients.find((p) => p.id === injury.patient);
    if (!patient) continue;
    if (patient.condition === "dead") {
      injury.state = "dead";
      person.vehicle = null;
      record(
        s,
        m,
        "CREW_LOST",
        "Tod einer Einsatzkraft dokumentiert. Diese Person steht dauerhaft nicht mehr als Besatzung zur Verfügung.",
      );
    } else if (patient.transport === "delivered") {
      injury.state = "recovery";
      injury.until = s.time + 900;
      record(
        s,
        m,
        "CREW_RECOVERY",
        "Verletzte Einsatzkraft in der Klinik übergeben. Anschließend 15 Minuten Genesungszeit im Spiel.",
      );
    }
  }
}
