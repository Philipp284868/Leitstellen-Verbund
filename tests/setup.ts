import { beforeEach } from "vitest";
import { installLogicGeography } from "./fixtures/germany/logic-provider";
// Runs before importing the test file so its top-level fixture positions exist.
installLogicGeography();
beforeEach(() => {
  installLogicGeography();
});
