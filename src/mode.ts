/** Wire compatibility for older multiplayer clients; no selectable product mode. */
export type GameMode = "multi";
export const modeName = (_mode: GameMode) => "Multiplayer";
export function parseMode(value: unknown): GameMode {
  if (value === undefined || value === "multi") return "multi";
  throw Error(
    "Dieser Server unterstützt ausschließlich Multiplayer. Alte Einzelspielerstände bleiben archiviert.",
  );
}
