/** Rivermere is the only shipped world. The old geography is retained for migration tests only. */
declare const __LV_WORLD__: string | undefined;
export const IS_RIVERMERE =
  typeof __LV_WORLD__ === "undefined" || __LV_WORLD__ !== "falkenried-2";
export const WORLD_NAME = IS_RIVERMERE ? "Rivermere" : "Falkenried";
export const WORLD_CENTER = IS_RIVERMERE
  ? { x: 4200, y: 3900 }
  : { x: 650, y: 425 };
