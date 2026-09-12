import { randomUUID } from "node:crypto";

type Level = "info" | "warn" | "error";
type Fields = {
  count?: number;
  active?: boolean;
  status?: number;
  errorType?: string;
};
/** Only allowlisted scalar metadata crosses this boundary. Never serialize requests/errors/saves. */
export class Diagnostics {
  private recent = new Map<
    string,
    { at: number; suppressed: number; id: string }
  >();
  constructor(
    private write: (line: string, level: Level) => void = (line, level) =>
      level === "info" ? console.log(line) : console.error(line),
    private now = Date.now,
  ) {}
  log(
    component: string,
    code: string,
    level: Level = "info",
    fields: Fields = {},
    correlation = randomUUID(),
  ) {
    const now = this.now(),
      key = `${component}:${code}`,
      prior = this.recent.get(key);
    if (prior && now - prior.at < 30000) {
      prior.suppressed++;
      return prior.id;
    }
    if (this.recent.size >= 256)
      this.recent.delete(this.recent.keys().next().value!);
    const clean: Fields = {};
    for (const name of ["count", "status"] as const)
      if (Number.isFinite(fields[name])) clean[name] = fields[name];
    if (typeof fields.active === "boolean") clean.active = fields.active;
    if (
      fields.errorType &&
      /^[A-Za-z][A-Za-z0-9]{0,40}$/.test(fields.errorType)
    )
      clean.errorType = fields.errorType;
    this.recent.set(key, { at: now, suppressed: 0, id: correlation });
    this.write(
      JSON.stringify({
        at: new Date(now).toISOString(),
        level,
        component,
        code,
        correlation,
        ...clean,
        ...(prior?.suppressed ? { repeated: prior.suppressed } : {}),
      }),
      level,
    );
    return correlation;
  }
}
export const diagnostics = new Diagnostics();
