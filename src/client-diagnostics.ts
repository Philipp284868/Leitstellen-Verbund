export type ClientDiagnostic = { at: string; code: string; count: number };
const rows: ClientDiagnostic[] = [];
const codes = new Set([
  "UI_RENDER_FAILED",
  "UI_SCRIPT_FAILED",
  "UI_PROMISE_FAILED",
]);
/** Session-local allowlist. Raw errors, stacks, URLs and input never enter this buffer. */
export function recordClientDiagnostic(code: string, now = Date.now()) {
  if (!codes.has(code)) return;
  const previous = [...rows].reverse().find((r) => r.code === code);
  if (previous && now - Date.parse(previous.at) < 30000) {
    previous.count++;
    return;
  }
  rows.push({ at: new Date(now).toISOString(), code, count: 1 });
  if (rows.length > 100) rows.shift();
}
export function clientDiagnostics() {
  return rows.map((r) => ({ ...r }));
}
