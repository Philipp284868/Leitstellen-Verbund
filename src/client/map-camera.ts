export type Camera = {
  world: string;
  seed: number;
  x: number;
  y: number;
  zoom: number;
  sensitivity: number;
};
export function readCamera(
  raw: string | null,
  world: string,
  seed: number,
  extent: number,
): Camera | null {
  try {
    const c = JSON.parse(raw || "null") as Camera | null;
    return c &&
      c.world === world &&
      c.seed === seed &&
      [c.x, c.y, c.zoom, c.sensitivity].every(Number.isFinite) &&
      c.x >= 0 &&
      c.y >= 0 &&
      c.x <= extent &&
      c.y <= extent &&
      c.zoom >= 1300 / extent &&
      c.zoom <= 4 &&
      c.sensitivity >= 0.3 &&
      c.sensitivity <= 2
      ? c
      : null;
  } catch {
    return null;
  }
}
export const DRAG_THRESHOLD = 5;
export const wheelPixels = (delta: number, mode: number, height: number) =>
  delta * (mode === 1 ? 16 : mode === 2 ? height : 1);
