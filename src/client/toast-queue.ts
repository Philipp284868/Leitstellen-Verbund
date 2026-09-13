import type { GameEvent } from "../shared/game-events";
export type Toast = {
  id: string;
  text: string;
  priority: GameEvent["priority"];
  group?: string;
};
/** Display time belongs to the queue, not a React mount, snapshot or hover. */
export class ToastQueue {
  private seen = new Set<string>();
  private pending: (Toast & { queued: number })[] = [];
  private current: (Toast & { until: number }) | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  private viewers = 0;
  constructor(private now = () => Date.now()) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.current;
  private changed() {
    this.listeners.forEach((f) => f());
  }
  attach() {
    this.viewers++;
    this.next();
    return () => {
      this.viewers--;
      if (!this.viewers) {
        clearTimeout(this.timer);
        this.current = null;
        this.pending = [];
        this.changed();
      }
    };
  }
  add(toast: Toast) {
    if (this.seen.has(toast.id)) return;
    this.seen.add(toast.id);
    if (this.seen.size > 10000)
      this.seen.delete(this.seen.values().next().value!);
    if (!this.viewers) return;
    if (toast.group) {
      if (this.current?.group === toast.group) return;
      this.pending = this.pending.filter((p) => p.group !== toast.group);
    }
    this.pending.push({ ...toast, queued: this.now() });
    const rank = { normal: 0, important: 1, critical: 2 };
    this.pending.sort(
      (a, b) => rank[b.priority] - rank[a.priority] || b.queued - a.queued,
    );
    this.pending = this.pending.slice(0, 2);
    this.next();
  }
  private next() {
    if (this.current || !this.viewers) return;
    this.pending = this.pending.filter((p) => this.now() - p.queued < 4000);
    const next = this.pending.shift();
    if (!next) return;
    this.current = { ...next, until: 0 };
    this.changed();
  }
  shown(id: string) {
    if (!this.current || this.current.id !== id || this.current.until) return;
    this.current = { ...this.current, until: this.now() + 3000 };
    this.changed();
    this.timer = setTimeout(() => {
      this.current = null;
      this.changed();
      this.next();
    }, 3000);
  }
}
export const gameToasts = new ToastQueue();
