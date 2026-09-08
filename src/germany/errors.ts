/** Expected routing failures can suspend a trip; malformed data and programming errors remain fatal. */
export class GermanyRoutingError extends Error {
  constructor(
    message: string,
    readonly code: "unavailable" | "no-route" | "blocked",
  ) {
    super(message);
    this.name = "GermanyRoutingError";
  }
}
