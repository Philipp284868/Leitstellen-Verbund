import { GermanyRoutingError } from "../../shared/germany/errors";

/** Only a proven missing connection is reusable. Outages and invalid data are not geography. */
export class RouteFailures {
  private entries = new Map<
    string,
    { error: GermanyRoutingError; until: number }
  >();
  constructor(private now = () => performance.now()) {}
  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (entry.until <= this.now()) {
      this.entries.delete(key);
      return;
    }
    return entry.error;
  }
  remember(key: string, error: unknown) {
    if (!(error instanceof GermanyRoutingError) || error.code !== "no-route")
      return;
    this.entries.delete(key);
    this.entries.set(key, { error, until: this.now() + 30000 });
    while (this.entries.size > 512)
      this.entries.delete(this.entries.keys().next().value!);
  }
}
