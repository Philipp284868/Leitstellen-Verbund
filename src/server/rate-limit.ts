import { createHmac, randomBytes, randomUUID } from "node:crypto";

export const rateScopes = [
  "authentication",
  "registration",
  "account",
  "actions",
  "facility-map",
  "facility-search",
  "facility-detail",
  "facility-reads",
  "geography",
  "reports",
  "presence",
  "chat",
  "leaderboard",
  "other",
] as const;
export type RateScope = (typeof rateScopes)[number];
export function rateScope(key: string): RateScope {
  const prefix = key.split(":")[0];
  if (prefix.startsWith("auth-")) return "authentication";
  if (prefix.startsWith("registration")) return "registration";
  if (prefix.startsWith("account") || prefix === "password") return "account";
  if (prefix === "action") return "actions";
  if (prefix.startsWith("geo")) return "geography";
  if (prefix.startsWith("report")) return "reports";
  if (prefix.includes("presence")) return "presence";
  return rateScopes.includes(prefix as RateScope)
    ? (prefix as RateScope)
    : "other";
}
export class RateLimitError extends Error {
  readonly code = "RATE_LIMITED";
  constructor(
    readonly scope: RateScope,
    readonly expiresAt: number,
    readonly retryAfter: number,
  ) {
    super(
      `Zu viele Anfragen in diesem Bereich. Bitte in ${retryAfter} Sekunden erneut versuchen.`,
    );
  }
}

/** Per-process pseudonyms, bounded log memory and one summary per scope / 30 seconds. */
export class RateLimitLog {
  private salt = randomBytes(32);
  private recent = new Map<RateScope, { at: number; suppressed: number }>();
  write(
    scope: RateScope,
    key: string,
    max: number,
    windowMs: number,
    retryAfter: number,
  ) {
    const now = Date.now(),
      prior = this.recent.get(scope);
    if (prior && now - prior.at < 30000) {
      prior.suppressed++;
      return;
    }
    this.recent.set(scope, { at: now, suppressed: 0 });
    console.warn(
      JSON.stringify({
        component: "rate-limit",
        scope,
        route: scope.startsWith("facility-") ? "/api/facilities" : scope,
        bucket: createHmac("sha256", this.salt)
          .update(key)
          .digest("hex")
          .slice(0, 16),
        max,
        windowMs,
        retryAfter,
        correlation: randomUUID(),
        suppressed: prior?.suppressed ?? 0,
      }),
    );
  }
}
