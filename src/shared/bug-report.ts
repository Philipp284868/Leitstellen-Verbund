import { z } from "zod";
export const reportInput = z
  .object({
    title: z.string().trim().min(5).max(140),
    description: z.string().trim().min(10).max(4000),
    steps: z.string().trim().max(3000),
    expected: z.string().trim().max(2000),
    actual: z.string().trim().max(2000),
    technical: z.boolean(),
  })
  .strict();
export type ReportInput = z.infer<typeof reportInput>;
/** Deliberately conservative: no links, addresses, known credentials or mass mentions. */
export function redactReportText(text: string) {
  return text
    .normalize("NFKC")
    .replace(
      /(?:authorization|cookie|password|passwort|token|secret|api[_ -]?key)\s*[:=]\s*[^\r\n]+/gi,
      "[Zugangsdaten entfernt]",
    )
    .replace(
      /(?:github_pat_|gh[pousr]_|sk-)[A-Za-z0-9_\-]{10,}/g,
      "[Token entfernt]",
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "[Token entfernt]")
    .replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, "[Link entfernt]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[E-Mail entfernt]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, "[IP entfernt]")
    .replace(/(?:[A-F0-9]{0,4}:){2,}[A-F0-9:]{0,39}/gi, "[IP entfernt]")
    .replace(
      /(?:[A-Za-z]:[\\/]|\/(?:home|Users|AMP|var)\/)[^\r\n]+/g,
      "[Dateipfad entfernt]",
    )
    .replace(
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,
      "",
    )
    .replaceAll("@", "＠");
}
export function cleanReport(input: unknown): ReportInput {
  const parsed = reportInput.parse(input);
  return {
    ...parsed,
    title: redactReportText(parsed.title),
    description: redactReportText(parsed.description),
    steps: redactReportText(parsed.steps),
    expected: redactReportText(parsed.expected),
    actual: redactReportText(parsed.actual),
  };
}
export function reportText(input: ReportInput, technical: string) {
  return [
    ["Beschreibung", input.description],
    ["Schritte", input.steps],
    ["Erwartet", input.expected],
    ["Tatsächlich", input.actual],
    ...(input.technical ? [["Technische Angaben", technical]] : []),
  ]
    .map(([title, text]) => title + "\n" + text)
    .join("\n\n");
}
