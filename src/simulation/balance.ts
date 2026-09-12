import type { Save } from "../shared/model";
import { pacedDelay } from "./pacing";
/** Stable, staggered real-time arrivals; a reconnect never catches up missed calls. */
export function nextCallDelay(seed: number, context?: Save) {
  return pacedDelay(seed, context);
}
