import type { Game } from "../../src/server/game";

/** Advance through intermediate simulation events, with a bounded failure if
 * the intended observable state is never reached. No wall-clock sleeps. */
export function advanceUntil(
  game: Game,
  reached: () => boolean,
  seconds = 1800,
) {
  for (let elapsed = 0; elapsed < seconds && !reached(); elapsed += 5)
    game.step(5);
  if (!reached())
    throw Error(
      `Erwartetes Simulationsereignis fehlt nach ${seconds} Spielsekunden.`,
    );
}
