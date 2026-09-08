/** Both bundles contain one immutable geography; clients and server are built together. */
declare const __LV_WORLD__: string | undefined;
export const IS_RIVERMERE =
  typeof __LV_WORLD__ !== "undefined" && __LV_WORLD__ === "rivermere-1";
export const WORLD_NAME = IS_RIVERMERE ? "Rivermere" : "Falkenried";
export const WORLD_CENTER = IS_RIVERMERE
  ? { x: 4200, y: 3900 }
  : { x: 650, y: 425 };
