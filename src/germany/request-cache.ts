export type QueryResult<T> = { data?: T; error?: string; loading: boolean };
type Listener = (value: QueryResult<unknown>) => void;
type Entry = {
  result: QueryResult<unknown>;
  expires: number;
  listeners: Set<Listener>;
  controller: AbortController;
  started: boolean;
  path: string;
  mode?: string;
};

/** Bounded response cache, deduplicated live requests and eight routing calls at once. */
export class GeoRequestCache {
  private entries = new Map<string, Entry>();
  private queue: Entry[] = [];
  private running = 0;
  constructor(
    // Browser fetch requires its Window receiver. Storing the native function
    // as a class method would call it with this cache as its receiver.
    private request: typeof fetch = (input, init) =>
      globalThis.fetch(input, init),
    private ttl = 15000,
    private limit = 256,
  ) {}
  subscribe<T>(
    key: string,
    path: string,
    listener: (value: QueryResult<T>) => void,
    mode?: string,
  ) {
    let entry = this.entries.get(key);
    if (entry && entry.expires < Date.now() && !entry.result.loading) {
      this.entries.delete(key);
      entry = undefined;
    }
    if (!entry || entry.controller.signal.aborted) {
      entry = {
        result: { loading: true },
        expires: Infinity,
        listeners: new Set(),
        controller: new AbortController(),
        started: false,
        path,
        mode,
      };
      this.entries.set(key, entry);
      this.queue.push(entry);
      while (this.entries.size > this.limit) {
        const victim = [...this.entries].find(
          ([, value]) => !value.listeners.size && value !== entry,
        );
        if (!victim) {
          this.entries.delete(key);
          break;
        }
        this.entries.delete(victim[0]);
        if (victim[1].result.loading) victim[1].controller.abort();
      }
    }
    const current = entry,
      callback = listener as Listener;
    current.listeners.add(callback);
    callback(current.result);
    this.pump();
    return () => {
      current.listeners.delete(callback);
      if (!current.listeners.size && current.result.loading) {
        current.controller.abort();
        this.queue = this.queue.filter((item) => item !== current);
        if (this.entries.get(key) === current) this.entries.delete(key);
      }
    };
  }
  private pump() {
    while (this.running < 8 && this.queue.length) {
      const entry = this.queue.shift()!;
      if (entry.controller.signal.aborted) continue;
      entry.started = true;
      this.running++;
      void this.request(entry.path, {
        credentials: "same-origin",
        signal: entry.controller.signal,
        ...(entry.mode ? { headers: { "x-game-mode": entry.mode } } : {}),
      })
        .then(async (response) => {
          if (!response.ok)
            throw Error(
              response.status === 401
                ? "Bitte erneut anmelden."
                : "Geodatenabfrage momentan nicht verfügbar.",
            );
          const data: unknown = await response.json();
          if (!entry.controller.signal.aborted)
            entry.result = { loading: false, data };
        })
        .catch((reason) => {
          if (!entry.controller.signal.aborted)
            entry.result = {
              loading: false,
              error: String(reason.message || reason),
            };
        })
        .finally(() => {
          this.running--;
          entry.expires = Date.now() + this.ttl;
          if (!entry.controller.signal.aborted)
            entry.listeners.forEach((listener) => listener(entry.result));
          this.pump();
        });
    }
  }
}
