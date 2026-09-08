/** Separate compiled world identities; historical Falkenried remains for migration tests only. */
import { WORLD_CENTER as GERMANY_CENTER } from "./germany/projection";
declare const __LV_WORLD__: string | undefined;
export const IS_GERMANY =
  typeof __LV_WORLD__ !== "undefined" && __LV_WORLD__ === "germany-1";
export const IS_RIVERMERE =
  typeof __LV_WORLD__ === "undefined" || __LV_WORLD__ !== "falkenried-2";
export const WORLD_NAME = IS_GERMANY
  ? "Deutschland"
  : IS_RIVERMERE
    ? "Rivermere"
    : "Falkenried";
export const WORLD_CENTER = IS_GERMANY
  ? GERMANY_CENTER
  : IS_RIVERMERE
    ? { x: 4200, y: 3900 }
    : { x: 650, y: 425 };
