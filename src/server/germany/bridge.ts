import { Worker } from "node:worker_threads";
import { GermanyRoutingError } from "../../shared/germany/errors";

// An isolated event loop performs HTTP while the authoritative SQLite transaction stays synchronous.
// Every call owns its response buffer: a timed-out response can never corrupt the next request.
const workerSource = `
const { parentPort } = require('node:worker_threads');
parentPort.on('message', async ({ url, method, body, shared, timeout }) => {
  const header = new Int32Array(shared, 0, 2);
  const destination = new Uint8Array(shared, 8);
  let status = 1, result;
  try {
    const response = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout), redirect: 'error'
    });
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > destination.length) { await reader.cancel(); throw Error('Routingantwort ist zu groß.'); }
      chunks.push(value);
    }
    const buffer = Buffer.concat(chunks);
    const parsed = JSON.parse(buffer.toString('utf8'));
    if (!response.ok) {
      const error = Error('Routingdienst: ' + String(parsed.message || response.status));
      const details = String(parsed.message || '') + ' ' + JSON.stringify(parsed.hints || []);
      if (response.status >= 500 || response.status === 429) error.routingCode = 'unavailable';
      else if (/Connection(?: between locations)? not found|ConnectionNotFoundException|PointNotFoundException|PointOutOfBoundsException|Cannot find point|maximum.*visited|timed? ?out|timeout/i.test(details)) error.routingCode = 'no-route';
      throw error;
    }
    result = buffer;
  } catch (e) {
    status = 2;
    const code = e.routingCode || (e.name === 'AbortError' || e.name === 'TimeoutError' || (e.name === 'TypeError' && /fetch failed|terminated/i.test(e.message)) ? 'unavailable' : undefined);
    result = Buffer.from(JSON.stringify({ error: e instanceof Error ? e.message : 'Routingdienst nicht verfügbar.', code }));
  }
  destination.set(result);
  Atomics.store(header, 1, result.length);
  Atomics.store(header, 0, status);
  Atomics.notify(header, 0);
});
`;
export class RoutingBridge {
  private worker: Worker;
  private failed = false;
  private closed = false;
  private retryAt = 0;
  readonly origin: string;
  constructor(
    origin = "http://127.0.0.1:8989",
    readonly timeout = 9500,
  ) {
    const url = new URL(origin);
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw Error(
        "Routingdienst muss eine lokale HTTP-Adresse ohne Unterpfad sein.",
      );
    if (!Number.isInteger(timeout) || timeout < 50 || timeout > 10000)
      throw Error("Routing-Timeout muss zwischen 50 und 10000 ms liegen.");
    this.origin = url.origin;
    this.worker = new Worker(workerSource, { eval: true });
    this.worker.unref();
    this.worker.on("error", () => {
      this.failed = true;
    });
    this.worker.on("exit", () => {
      if (!this.closed) this.failed = true;
    });
  }
  request(
    path: "/route" | "/info",
    body?: unknown,
    budget = this.timeout,
  ): unknown {
    if (this.closed) throw Error("Routingprovider wurde bereits geschlossen.");
    if (this.failed || Date.now() < this.retryAt)
      throw new GermanyRoutingError(
        "Lokaler Routingdienst vorübergehend nicht verfügbar; erneuter Versuch nach der Wartefrist.",
        "unavailable",
      );
    const timeout = Math.min(this.timeout, Math.floor(budget));
    if (!Number.isFinite(timeout) || timeout < 50)
      throw new GermanyRoutingError(
        "Zeitlimit des lokalen Routingdienstes überschritten.",
        "unavailable",
      );
    const shared = new SharedArrayBuffer(16 * 1024 * 1024 + 8),
      header = new Int32Array(shared, 0, 2);
    this.worker.postMessage({
      url: this.origin + path,
      method: body === undefined ? "GET" : "POST",
      body,
      shared,
      timeout: Math.max(25, timeout - 250),
    });
    const result = Atomics.wait(header, 0, 0, timeout);
    if (result === "timed-out") {
      this.retryAt = Date.now() + 60000;
      throw new GermanyRoutingError(
        "Zeitlimit des lokalen Routingdienstes überschritten. Aktion wurde nicht ausgeführt.",
        "unavailable",
      );
    }
    const size = Atomics.load(header, 1);
    if (size < 1 || size > shared.byteLength - 8)
      throw Error("Ungültige Antwortgröße des Routingdienstes.");
    const value = JSON.parse(
      new TextDecoder().decode(new Uint8Array(shared, 8, size)),
    ) as unknown;
    if (Atomics.load(header, 0) !== 1) {
      const message =
        value && typeof value === "object" && "error" in value
          ? String(value.error)
          : "Routingdienst nicht verfügbar.";
      const code =
        value && typeof value === "object" && "code" in value
          ? value.code
          : undefined;
      if (code === "unavailable" || code === "no-route") {
        if (code === "unavailable") this.retryAt = Date.now() + 60000;
        throw new GermanyRoutingError(message.slice(0, 300), code);
      }
      throw Error(message.slice(0, 300));
    }
    return value;
  }
  async close() {
    this.closed = true;
    await this.worker.terminate();
  }
}
