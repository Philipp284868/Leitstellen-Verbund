import { test as base } from "@playwright/test";
import { createGermanyRuntime } from "../fixtures/germany/runtime";
import { installLogicGeography } from "../fixtures/germany/logic-provider";
type Runtime = Awaited<ReturnType<typeof createGermanyRuntime>>;
let active: Runtime | undefined;
export function browserGeography() {
  if (!active)
    throw Error("Deutschland-Browserfixture wurde nicht eingerichtet.");
  return active;
}
export const test = base.extend<
  NonNullable<unknown>,
  { germanyRuntime: Runtime }
>({
  germanyRuntime: [
    async ({}, use) => {
      active = await createGermanyRuntime();
      installLogicGeography();
      try {
        await use(active);
      } finally {
        await active.close();
        active = undefined;
      }
    },
    { scope: "worker", auto: true },
  ],
});
export { expect } from "@playwright/test";
export type {
  Page,
  Browser,
  BrowserContext,
  TestInfo,
  Locator,
} from "@playwright/test";
