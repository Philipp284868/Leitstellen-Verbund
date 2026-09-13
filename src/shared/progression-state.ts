import type { Save } from "./model";
import { progress, xpForLevel, unlockLevel, unlockLevels } from "./progression";
import {
  progress as oldProgress,
  xpForLevel as oldThreshold,
  unlockLevels as oldUnlocks,
} from "./progression-v1";

/** Snapshot of already earned rights, not a permanently lowered requirement. */
export function unlocked(
  s: Pick<Save, "xp" | "progression">,
  kind: string,
  id: string,
) {
  if (kind === "building" && id === "hospital") return false;
  return (
    progress(s.xp).level >= unlockLevel(kind, id) ||
    !!s.progression?.rights?.includes(`${kind}:${id}`)
  );
}
export function upgradeLevel(kind: string, current: number) {
  return Math.max(unlockLevel("building", kind), current * 2);
}
export function upgradeUnlocked(
  s: Pick<Save, "xp" | "progression">,
  kind: string,
  current: number,
) {
  if (kind === "hospital") return false;
  return (
    progress(s.xp).level >= upgradeLevel(kind, current) ||
    !!s.progression?.rights?.includes(`upgrade:${kind}:${current + 1}`)
  );
}
export function migrateProgression(s: Save) {
  if (s.progression?.version === 2) return;
  if (!s.progression) {
    const previousXp = s.xp,
      previousLevel = Math.min(10, 1 + Math.floor(s.xp / 150));
    const compensation = Math.max(0, oldThreshold(previousLevel) - previousXp);
    s.xp += compensation;
    s.progression = { version: 1, compensation, previousXp, previousLevel };
  }
  const before = s.xp,
    old = oldProgress(before),
    start = xpForLevel(old.level);
  // Integer ratio avoids a rounded fraction promoting/demoting a player at a boundary.
  const required = xpForLevel(old.level + 1) - start;
  const current = Number(
    (BigInt(old.current) * BigInt(required)) / BigInt(old.required),
  );
  const rights = Object.entries(oldUnlocks).flatMap(([kind, entries]) =>
    Object.entries(entries)
      .filter(([id, at]) => at <= old.level && unlockLevels[kind]?.[id])
      .map(([id]) => `${kind}:${id}`),
  );
  for (const [kind, at] of Object.entries(oldUnlocks.building))
    for (let target = 2; target <= 10; target++)
      if (Math.max(at, (target - 1) * 2) <= old.level)
        rights.push(`upgrade:${kind}:${target}`);
  s.xp = start + Math.min(required - 1, current);
  progress(s.xp);
  s.progression = {
    ...s.progression,
    version: 2,
    rights,
    rawEarned: before - s.progression.compensation,
    conversion: {
      fromXp: before,
      toXp: s.xp,
      level: old.level,
      current: old.current,
      required: old.required,
    },
  };
}
