import { BALANCE } from "../catalog";
import type { Save } from "../model";
/** Stable, staggered real-time arrivals; a reconnect never catches up missed calls. */
export function nextCallDelay(seed: number, context?: Save) {
  const base =
    BALANCE.callIntervalMin +
    ((seed >>> 0) % (BALANCE.callIntervalMax - BALANCE.callIntervalMin + 1));
  if (!context) return base;
  const hour = new Date(context.time * 1000).getUTCHours();
  const night = hour < 6 || hour >= 23;
  const rush = (hour >= 6 && hour < 9) || (hour >= 15 && hour < 19);
  const storm = ["storm", "gale", "hurricane", "heavy-rain", "ice"].includes(
    context.environment?.kind ?? "",
  );
  // Service area and real conditions affect rate. The current number of open calls never does.
  const area = Math.min(
    1.6,
    1 + Math.max(0, context.buildings.length - 1) * 0.015,
  );
  return Math.round(
    (base * (night ? 1.55 : rush ? 0.85 : 1)) /
      (area * (storm ? 1.35 : 1) * (context.operations.campaign ? 1.15 : 1)),
  );
}
