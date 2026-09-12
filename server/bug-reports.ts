import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import pkg from "../package.json" with { type: "json" };
const { version } = pkg;
import { cleanReport, reportText } from "../src/bug-report";
import { diagnostics } from "./diagnostics";
export const REPORTS_SCHEMA = `CREATE TABLE IF NOT EXISTS bug_reports(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,fingerprint TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,issue INTEGER,retry_at INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0); CREATE INDEX IF NOT EXISTS report_owner ON bug_reports(owner,created);`;
export const REPORT_REPOSITORY = "Philipp284868/Leitstellen-Verbund";
const url = `https://api.github.com/repos/${REPORT_REPOSITORY}/issues`;
export function reportToken(value: string | undefined) {
  if (!value) return undefined;
  if (!/^github_pat_[A-Za-z0-9_]{20,250}$/.test(value))
    throw Error(
      "GITHUB_ISSUES_TOKEN: Fine-grained Token erforderlich; auf dieses Repository und Issues: Read and write beschränken.",
    );
  return value;
}
export class BugReports {
  private inFlight = new Map<string, Promise<ReturnType<BugReports["read"]>>>();
  constructor(
    private sql: DatabaseSync,
    private token?: string,
    private transport: typeof fetch = fetch,
    private now = Date.now,
  ) {
    sql
      .prepare(
        "UPDATE bug_reports SET status='uncertain' WHERE status='sending'",
      )
      .run();
    this.prune();
  }
  configured() {
    return !!this.token;
  }
  private prune() {
    this.sql
      .prepare("DELETE FROM bug_reports WHERE updated<?")
      .run(this.now() - 30 * 86400000);
  }
  read(owner: string, id: string) {
    const r = this.sql
      .prepare(
        "SELECT id,status,payload,issue,retry_at FROM bug_reports WHERE owner=? AND id=?",
      )
      .get(owner, id);
    if (!r) throw Error("Bericht nicht vorhanden oder nicht berechtigt.");
    return {
      id: String(r.id),
      status: String(r.status),
      preview: JSON.parse(String(r.payload)) as { title: string; text: string },
      issue: r.issue ? Number(r.issue) : null,
      url: r.issue
        ? `https://github.com/${REPORT_REPOSITORY}/issues/${Number(r.issue)}`
        : null,
      retryAt: Number(r.retry_at),
      configured: this.configured(),
    };
  }
  list(owner: string) {
    return this.sql
      .prepare(
        "SELECT id FROM bug_reports WHERE owner=? ORDER BY created DESC LIMIT 10",
      )
      .all(owner)
      .map((r) => this.read(owner, String(r.id)));
  }
  prepare(owner: string, input: unknown) {
    const clean = cleanReport(input),
      payload = JSON.stringify({
        title: clean.title,
        text: reportText(
          clean,
          `Leitstellen-Verbund ${version}\nKarte: Deutschland · Echtzeitserver`,
        ),
      });
    const fingerprint = createHash("sha256").update(payload).digest("hex");
    this.prune();
    const old = this.sql
      .prepare(
        "SELECT id FROM bug_reports WHERE owner=? AND fingerprint=? ORDER BY created DESC LIMIT 1",
      )
      .get(owner, fingerprint);
    if (old) return this.read(owner, String(old.id));
    if (
      Number(this.sql.prepare("SELECT COUNT(*) n FROM bug_reports").get()!.n) >=
        200 ||
      Number(
        this.sql
          .prepare("SELECT COUNT(*) n FROM bug_reports WHERE owner=?")
          .get(owner)!.n,
      ) >= 10
    )
      throw Error(
        "Berichtslimit erreicht. Vorhandene Berichte prüfen oder bereinigten Export nutzen.",
      );
    const id = randomUUID();
    this.sql
      .prepare(
        "INSERT INTO bug_reports(id,owner,fingerprint,created,updated,status,payload) VALUES (?,?,?,?,?,'prepared',?)",
      )
      .run(id, owner, fingerprint, this.now(), this.now(), payload);
    diagnostics.log("reports", "REPORT_PREPARED", "info", {}, id);
    return this.read(owner, id);
  }
  submit(owner: string, id: string) {
    this.read(owner, id);
    const pending = this.inFlight.get(id);
    if (pending) return pending;
    const promise = this.send(owner, id).finally(() =>
      this.inFlight.delete(id),
    );
    this.inFlight.set(id, promise);
    return promise;
  }
  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Leitstellen-Verbund",
      "Content-Type": "application/json",
    };
  }
  private mark(
    id: string,
    status: string,
    delay = 0,
    issue: number | null = null,
  ) {
    this.sql
      .prepare(
        "UPDATE bug_reports SET status=?,updated=?,retry_at=?,issue=COALESCE(?,issue) WHERE id=?",
      )
      .run(status, this.now(), this.now() + delay, issue, id);
    if (status === "sent" && issue) {
      const owner = this.sql
        .prepare("SELECT owner FROM bug_reports WHERE id=?")
        .get(id)!.owner;
      const event = {
        id: `report:${id}`,
        at: this.now() / 1000,
        sender: "Support",
        type: "Bugreport",
        priority: "normal",
        text: `GitHub-Bericht #${issue} veröffentlicht. Den Link findest du unter Support.`,
      };
      this.sql
        .prepare("INSERT OR IGNORE INTO game_events VALUES(?,?,?,?)")
        .run(owner, event.id, event.at, JSON.stringify(event));
    }
    diagnostics.log(
      "reports",
      `REPORT_${status.toUpperCase()}`,
      status === "sent" ? "info" : "warn",
      {},
      id,
    );
  }
  private async send(owner: string, id: string) {
    const r = this.read(owner, id);
    if (
      !this.token ||
      r.status === "sent" ||
      r.status === "blocked" ||
      r.retryAt > this.now()
    )
      return r;
    if (r.status === "uncertain" || r.status === "sending") {
      // An absent search result is not proof that a timed-out POST failed. Never recreate blindly.
      const stored = this.sql
        .prepare("SELECT created FROM bug_reports WHERE id=?")
        .get(id)!;
      try {
        for (let page = 1; page <= 10; page++) {
          const response = await this.transport(
            `${url}?state=all&sort=created&direction=asc&since=${encodeURIComponent(new Date(Number(stored.created) - 60000).toISOString())}&per_page=100&page=${page}`,
            {
              headers: this.headers(),
              redirect: "error",
              signal: AbortSignal.timeout(15000),
            },
          );
          if (!response.ok) break;
          const items = await response.json();
          if (!Array.isArray(items)) break;
          const hit = items.find(
            (x) =>
              typeof x.body === "string" &&
              x.body.includes(`<!-- lv-report:${id} -->`) &&
              Number.isSafeInteger(x.number) &&
              x.number > 0 &&
              !x.pull_request,
          );
          if (hit) {
            this.mark(id, "sent", 0, hit.number);
            return this.read(owner, id);
          }
          if (items.length < 100) break;
        }
      } catch {
        /* No raw upstream response or exception crosses the privacy boundary. */
      }
      this.mark(id, "uncertain", 60000);
      return this.read(owner, id);
    }
    const attempts = Number(
      this.sql.prepare("SELECT attempts FROM bug_reports WHERE id=?").get(id)!
        .attempts,
    );
    if (attempts >= 5) {
      this.mark(id, "blocked");
      return this.read(owner, id);
    }
    this.sql
      .prepare(
        "UPDATE bug_reports SET status='sending',attempts=attempts+1,updated=? WHERE id=?",
      )
      .run(this.now(), id);
    // Escape markdown after the user's plain-text preview. The marker is generated server-side.
    const escaped = r.preview.text.replace(/[\\`*_{}\[\]()<>#!|~]/g, "\\$&");
    try {
      const response = await this.transport(url, {
        method: "POST",
        headers: this.headers(),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          title: r.preview.title.replace(/[<>`]/g, ""),
          body: escaped + `\n\n<!-- lv-report:${id} -->`,
        }),
      });
      if (response.status === 201) {
        const issue = await response.json();
        if (!Number.isSafeInteger(issue.number) || issue.number <= 0)
          throw Error("invalid response");
        this.mark(id, "sent", 0, issue.number);
      } else if (response.status === 403 || response.status === 429) {
        const retry = Number(response.headers.get("retry-after"));
        this.mark(
          id,
          "retry",
          Math.min(
            86400000,
            Math.max(60000, (Number.isFinite(retry) ? retry : 60) * 1000),
          ),
        );
      } else if ([400, 401, 404, 410, 422].includes(response.status))
        this.mark(id, "blocked", 60000);
      else this.mark(id, "uncertain", 60000);
    } catch {
      this.mark(id, "uncertain", 60000);
    }
    return this.read(owner, id);
  }
}
