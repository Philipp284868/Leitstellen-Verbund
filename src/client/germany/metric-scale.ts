import type { Map as GLMap } from "maplibre-gl";
export const SCALE_REFERENCE_PX = 100;
export function metricScale(
  distance: number,
  referencePixels = SCALE_REFERENCE_PX,
) {
  if (!Number.isFinite(distance) || distance <= 0)
    return { meters: Infinity, pixels: 0, label: "", markers: false };
  const power = 10 ** Math.floor(Math.log10(distance));
  const meters =
    [5, 2, 1].map((n) => n * power).find((n) => n <= distance * (1 + 1e-12)) ??
    power;
  return {
    meters,
    pixels: (referencePixels * meters) / distance,
    label: meters >= 1000 ? `${meters / 1000} km` : `${meters} m`,
    markers: meters <= 200,
  };
}
/** Identical projected reference segment for the visible ruler and every added game layer. */
export function mapMetricScale(map: Pick<GLMap, "getContainer" | "unproject">) {
  const box = map.getContainer(),
    x = box.clientWidth / 2,
    y = box.clientHeight / 2;
  const a = map.unproject([x - SCALE_REFERENCE_PX / 2, y]),
    b = map.unproject([x + SCALE_REFERENCE_PX / 2, y]);
  return metricScale(a.distanceTo(b));
}
/** Choose the middle of the 200 m rounding interval at this latitude, never a fixed zoom. */
export function markerFocusZoom(latitude: number) {
  return Math.max(
    4,
    Math.min(
      18,
      Math.log2(
        (2 *
          Math.PI *
          6371008.8 *
          Math.cos((latitude * Math.PI) / 180) *
          SCALE_REFERENCE_PX) /
          (512 * 250),
      ),
    ),
  );
}
