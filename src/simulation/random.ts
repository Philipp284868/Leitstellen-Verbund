// Stateless draws: unrelated ticks never consume another system's random state.
export function sample(seed: number, channel: string, sequence = 0) {
  let h = (seed ^ Math.imul(sequence + 1, 2654435761)) >>> 0;
  for (let i = 0; i < channel.length; i++)
    h = Math.imul(h ^ channel.charCodeAt(i), 16777619) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
export const clamp = (n: number, max = 100) => Math.max(0, Math.min(max, n));
export const DYNAMICS = {
  quantum: 5,
  eventCooldown: 90,
  maxEvents: 6,
  followups: 1,
  spreadChance: 0.28,
  collapseChance: 0.04,
  secondaryChance: 0.15,
  defectChance: 0.002,
  trafficChance: 0.12,
  weatherPeriod: 900,
} as const;
