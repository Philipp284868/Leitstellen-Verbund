import type { Save } from "../shared/model";

// A synchronous simulation scope; callbacks recheck authorization immediately
// before creating an offer. No presence flag is persisted in a save.
let policy: ((save: Save) => boolean) | undefined;
export function callGenerationAllowed(save: Save) {
  return policy?.(save) ?? true;
}
export function withCallGeneration<T>(
  allow: (save: Save) => boolean,
  run: () => T,
): T {
  const previous = policy;
  policy = allow;
  try {
    return run();
  } finally {
    policy = previous;
  }
}
