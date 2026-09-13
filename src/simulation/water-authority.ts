import type { WaterSource } from "../shared/germany/water";
export type WaterAuthority = {
  draw(
    source: WaterSource,
    consumer: string,
    at: number,
    litres: number,
    seconds: number,
  ): number;
};
let current: WaterAuthority | undefined;
export function withWaterAuthority<T>(
  authority: WaterAuthority,
  run: () => T,
): T {
  const old = current;
  current = authority;
  try {
    return run();
  } finally {
    current = old;
  }
}
export function drawWater(
  source: WaterSource,
  consumer: string,
  at: number,
  litres: number,
  seconds: number,
) {
  return current
    ? current.draw(source, consumer, at, litres, seconds)
    : Math.min(litres, (source.flowLpm * seconds) / 60);
}
