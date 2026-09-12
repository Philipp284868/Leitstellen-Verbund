type State = { loading: boolean; error: string; cooldownUntil: number };
const cooldowns = new Map<string, number>();
export function facilityReadScope(query: string) {
  const p = new URLSearchParams(query);
  return p.has("id")
    ? "facility-detail"
    : p.get("clusters") === "1"
      ? "facility-map"
      : "facility-search";
}
/** One active read and one latest intent. Movement never starts overlapping HTTP work. */
export class FacilityReader<T> {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active: AbortController | undefined;
  private pending:
    | { query: string; revision: string; generation: number }
    | undefined;
  private generation = 0;
  private lastStart = 0;
  private burstStart = 0;
  private retries = 0;
  private stopped = false;
  private lastIdentity = "";
  constructor(
    private receive: (data: T, query: string) => void,
    private state: (state: State) => void,
    private headers: HeadersInit = {},
    private context = "default",
  ) {}
  cooldown(query: string) {
    return Math.max(
      cooldowns.get(`${this.context}:facility-reads`) || 0,
      cooldowns.get(`${this.context}:${facilityReadScope(query)}`) || 0,
    );
  }
  request(query: string, revision = "") {
    if (this.stopped) return;
    const identity = `${query}|${revision}`;
    if (identity === this.lastIdentity) return;
    this.lastIdentity = identity;
    this.pending = { query, revision, generation: ++this.generation };
    const now = Date.now();
    if (!this.burstStart) this.burstStart = now;
    this.schedule(Math.min(now + 250, this.burstStart + 1000));
  }
  private schedule(at: number) {
    if (!this.pending || this.stopped) return;
    clearTimeout(this.timer);
    const until = this.cooldown(this.pending.query);
    const due = Math.max(at, this.lastStart + 500, until);
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        void this.run();
      },
      Math.max(0, due - Date.now()),
    );
  }
  private async run() {
    if (this.stopped || this.active || !this.pending) return;
    if (this.cooldown(this.pending.query) > Date.now()) {
      this.schedule(this.cooldown(this.pending.query));
      return;
    }
    const intent = this.pending;
    this.pending = undefined;
    this.burstStart = 0;
    const controller = new AbortController();
    this.active = controller;
    this.lastStart = Date.now();
    this.state({ loading: true, error: "", cooldownUntil: 0 });
    try {
      const response = await fetch(`/api/facilities?${intent.query}`, {
        credentials: "same-origin",
        headers: this.headers,
        signal: controller.signal,
      });
      if (this.stopped || controller.signal.aborted) return;
      if (response.status === 429) {
        const value = response.headers.get("Retry-After") || "1";
        const seconds = /^\d+$/.test(value)
          ? Number(value)
          : Math.max(1, (Date.parse(value) - Date.now()) / 1000);
        const wait = Number.isFinite(seconds)
          ? Math.min(3600, Math.max(1, seconds))
          : 1;
        const data = await response.json();
        const scope =
          data.scope === "facility-reads"
            ? "facility-reads"
            : facilityReadScope(intent.query);
        const until = Date.now() + wait * 1000 + 100 + Math.random() * 200;
        cooldowns.set(`${this.context}:${scope}`, until);
        if (cooldowns.size > 64)
          cooldowns.delete(cooldowns.keys().next().value!);
        this.state({
          loading: false,
          error: `Standorte werden zu häufig abgefragt. Erneuter Versuch frühestens in ${Math.ceil(wait)} Sekunden.`,
          cooldownUntil: until,
        });
        if (
          this.retries++ < 2 &&
          !this.pending &&
          intent.generation === this.generation
        )
          this.pending = intent;
        if (this.retries > 2) this.pending = undefined;
      } else {
        const data = await response.json();
        if (!response.ok)
          throw Error(
            response.status === 401
              ? "Für die Standorte bitte erneut anmelden."
              : data.error || "Standorte konnten nicht geladen werden.",
          );
        this.retries = 0;
        if (!this.stopped && intent.generation === this.generation) {
          this.receive(data as T, intent.query);
          this.state({ loading: false, error: "", cooldownUntil: 0 });
        }
      }
    } catch (error) {
      if (
        !this.stopped &&
        !controller.signal.aborted &&
        intent.generation === this.generation
      )
        this.state({
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Standortverbindung unterbrochen.",
          cooldownUntil: 0,
        });
    } finally {
      if (this.active === controller) this.active = undefined;
      if (this.pending && !this.stopped) this.schedule(Date.now() + 250);
    }
  }
  /** Cached intent supersedes any response in flight without cancel/restart churn. */
  supersede() {
    this.generation++;
    this.pending = undefined;
    this.lastIdentity = "";
    clearTimeout(this.timer);
  }
  cancel() {
    this.supersede();
    this.active?.abort();
    this.active = undefined;
  }
  destroy() {
    this.stopped = true;
    this.cancel();
  }
}
