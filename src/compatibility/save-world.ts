/** Format bridge v1: fictional coordinates have no authoritative German mapping.
 * Inspect without mutating or parsing away fields so the original stays exportable. */
export function assertSaveWorld(data: unknown) {
  if (!data || typeof data !== "object" || !("world" in data)) return;
  if (
    ["falkenried-1", "falkenried-2", "rivermere-1"].includes(String(data.world))
  )
    throw Error(
      `Weltkonflikt: ${data.world} enthält fiktive Koordinaten ohne verlässliche Deutschland-Zuordnung. Der ursprüngliche Stand bleibt unverändert exportierbar; eine automatische Übernahme ist nicht möglich.`,
    );
}
