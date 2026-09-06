export type GameMode = "single" | "multi";
export const modeName = (mode: GameMode) =>
  mode === "single" ? "Einzelspieler" : "Multiplayer";
export function parseMode(value: unknown): GameMode {
  if (value === undefined || value === "multi") return "multi";
  if (value === "single") return "single";
  throw Error("Ungültiger Spielmodus.");
}
