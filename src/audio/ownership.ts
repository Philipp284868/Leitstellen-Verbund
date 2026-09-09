import { createId } from "../ids";

type Lease = { id: string; until: number; claimed: number };
/** Same-origin, account-specific lease. Contains no events, filenames or game state. */
export class AudioOwnership {
  private id = createId();
  private key = "";
  private bus: BroadcastChannel | null = null;
  private owner = false;
  private claimed = 0;
  private fallbackLease: Lease | null = null;
  constructor(private changed: () => void) {}
  session(account: string) {
    const key = account ? `lv-audio-owner-v2:${account}` : "";
    if (key === this.key) return;
    this.release();
    this.bus?.close();
    this.bus = null;
    this.key = key;
    if (key && typeof BroadcastChannel !== "undefined") {
      try {
        this.bus = new BroadcastChannel(key);
      } catch {
        return;
      }
      this.bus.onmessage = (event: MessageEvent<Lease>) => {
        const incoming = event.data;
        if (
          !incoming ||
          typeof incoming.id !== "string" ||
          !Number.isFinite(incoming.claimed) ||
          !Number.isFinite(incoming.until)
        )
          return;
        const wins =
          incoming.claimed > this.claimed ||
          (incoming.claimed === this.claimed && incoming.id > this.id);
        if (wins && incoming.id !== this.id) {
          this.fallbackLease = incoming;
          this.owner = false;
          this.changed();
        }
      };
    }
  }
  private read(): Lease | null {
    try {
      const value = JSON.parse(localStorage.getItem(this.key) ?? "null");
      return value &&
        typeof value.id === "string" &&
        Number.isFinite(value.until) &&
        Number.isFinite(value.claimed)
        ? value
        : null;
    } catch {
      return this.fallbackLease;
    }
  }
  claim() {
    if (!this.key) return;
    this.claimed = Date.now();
    this.owner = true;
    this.renew();
    this.changed();
  }
  renew() {
    if (!this.owner || !this.key) return;
    const current = this.read();
    if (
      current &&
      current.id !== this.id &&
      current.until > Date.now() &&
      (current.claimed > this.claimed ||
        (current.claimed === this.claimed && current.id > this.id))
    ) {
      this.owner = false;
      this.changed();
      return;
    }
    const lease = {
      id: this.id,
      until: Date.now() + 4000,
      claimed: this.claimed,
    };
    try {
      localStorage.setItem(this.key, JSON.stringify(lease));
    } catch {
      /* BroadcastChannel remains a best-effort fallback. */
    }
    this.fallbackLease = lease;
    this.bus?.postMessage(lease);
  }
  owns() {
    if (!this.owner || !this.key) return false;
    const lease = this.read();
    return !lease || (lease.id === this.id && lease.until > Date.now());
  }
  release() {
    if (this.key && this.read()?.id === this.id) {
      try {
        localStorage.removeItem(this.key);
      } catch {
        /* Expiring fallback lease. */
      }
    }
    this.owner = false;
  }
  close() {
    this.release();
    this.bus?.close();
    this.bus = null;
    this.key = "";
  }
}
