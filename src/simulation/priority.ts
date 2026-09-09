/** Legacy saves keep their original value; presentation and ordering use six levels. */
export const priorities = [
  "INFO",
  "NORMAL",
  "DRINGEND",
  "HOCH",
  "KRITISCH",
  "NOTFALL",
] as const;
export type VisiblePriority = (typeof priorities)[number];
export function visiblePriority(value: string | undefined): VisiblePriority {
  if (value === "PRIORITÄT") return "HOCH";
  return priorities.includes(value as VisiblePriority)
    ? (value as VisiblePriority)
    : "NORMAL";
}
export function priorityRank(value: string | undefined) {
  return priorities.indexOf(visiblePriority(value));
}
export function urgentPriority(value: string | undefined) {
  return priorityRank(value) >= priorityRank("HOCH");
}
