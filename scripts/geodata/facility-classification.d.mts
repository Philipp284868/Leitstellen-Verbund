export function classifyFacility(
  tags: Record<string, string>,
):
  | { kind: string; subtype: string; emergency: string; status: string }
  | undefined;
export function pointInRing(
  point: { lon: number; lat: number },
  ring: number[][],
): boolean;
export function covers(
  geometry: unknown,
  point: { lon: number; lat: number },
): boolean;
export function sameFacility(a: unknown, b: unknown): boolean;
