import type { Template } from "../catalog";
import { incidentCategory } from "./incident-selection";

export const REPORTED_IDS = new Set([
  "reported-fire",
  "reported-technical",
  "reported-medical",
  "reported-police",
  "reported-water",
  "reported-other",
]);
export const reportId = (t: Template) => `reported-${incidentCategory(t)}`;

/** Observable language deliberately does not carry the hidden template/variant,
 * resource quantities, medical diagnosis, confirmed outcome or escalation. */
export function callerObservation(t: Template): string {
  const family = t.profile?.family;
  if (t.id === "bma-false" || t.id === "bma")
    return "Die Brandmeldeanlage hat ausgelöst. Ob es raucht oder brennt, ist noch nicht bekannt.";
  if (incidentCategory(t) === "fire") {
    if (family === "vehicle-fire" || t.id === "car")
      return "Ich sehe Rauch an einem Fahrzeug. Die Lage ist von hier aus nicht vollständig erkennbar.";
    if (family === "vegetation" || ["field", "forest"].includes(t.id))
      return "Draußen steigen Rauch und Funken auf. Ich kann die Ausdehnung nicht sicher erkennen.";
    if (t.profile?.fire?.indoor || ["flat", "roof"].includes(t.id))
      return "Aus dem Gebäude kommt Rauch. Ich weiß nicht, ob noch jemand darin ist.";
    return "Ich sehe Rauch und Flammen. Wie weit das Feuer reicht, kann ich nicht sicher sagen.";
  }
  if (incidentCategory(t) === "medical")
    return "Eine Person benötigt medizinische Hilfe. Ich bin vor Ort und kann weitere Beobachtungen beschreiben.";
  if (incidentCategory(t) === "water")
    return "Eine Person ist am oder im Wasser in Schwierigkeiten. Ich brauche Hilfe und beschreibe den Zugang.";
  if (incidentCategory(t) === "police")
    return "Hier besteht eine unübersichtliche Situation mit Personen. Polizeiliche Hilfe wird benötigt.";
  if (
    family === "traffic" ||
    ["crash", "traffic", "bus", "rail"].includes(t.id)
  )
    return "Hier ist ein Unfall passiert. Ob jemand verletzt oder eingeschlossen ist, muss noch geklärt werden.";
  if (family === "flood" || ["cellar", "flood", "pump"].includes(t.id))
    return "Hier dringt Wasser ein. Der betroffene Bereich lässt sich nicht sicher betreten.";
  if (family === "hazmat" || t.id === "gas")
    return "Hier ist ein ungewöhnlicher Geruch oder eine ausgetretene Flüssigkeit. Um welchen Stoff es sich handelt, weiß ich nicht.";
  if (family === "collapse")
    return "Ein Bauteil ist beschädigt oder eingestürzt. Ob Personen betroffen sind, ist noch unklar.";
  return "Ein Hindernis oder technischer Schaden verursacht eine Gefahr. Ich beschreibe, was ich von hier aus sehen kann.";
}
