import type { Mission, Save } from "../shared/model";
import { addXp, missionXp } from "../shared/progression";
import { mt } from "../shared/catalog";

type Award = {
  id: string;
  recipient: string;
  generation: string;
  mission: string;
  kind: "owner" | "helper";
  amount: number;
};
let claim: ((award: Award) => boolean) | undefined;
/** The server supplies the durable journal inside its existing world transaction. */
export function withXpJournal<T>(
  ledger: (award: Award) => boolean,
  run: () => T,
): T {
  const previous = claim;
  claim = ledger;
  try {
    return run();
  } finally {
    claim = previous;
  }
}
export function sealMissionXp(m: Mission, transition = false) {
  return (m.xpPolicy ??= {
    version: 2,
    event: m.round,
    base: missionXp(mt(m.template)),
    transition,
    partial: Math.max(0, m.telemetry?.xp ?? 0),
    awarded: {},
  });
}
export function awardMissionXp(
  s: Save,
  m: Mission,
  kind: "owner" | "helper",
  quality: number,
) {
  const policy = sealMissionXp(m);
  if (m.phase !== "done" || m.location?.state === "technical-closure") return 0;
  const recipients = [...new Set(m.contributors)].sort();
  if (kind === "helper" && !recipients.includes(s.player.id))
    throw Error("Kein berechtigter XP-Empfänger.");
  const total = Math.floor(policy.base * Math.max(0, Math.min(1, quality)));
  const pool = Math.floor(total / 4),
    index = recipients.indexOf(s.player.id);
  const amount =
    kind === "owner"
      ? Math.max(0, total - policy.partial)
      : Math.floor(pool / recipients.length) +
        (index < pool % recipients.length ? 1 : 0);
  const key = `${kind}:${s.player.id}`;
  if (policy.awarded[key] !== undefined) return 0;
  // Validate before a ledger claim, so even direct simulation use is all-or-nothing.
  const next = { xp: s.xp };
  addXp(next, amount);
  const awarded =
    !claim ||
    claim({
      id: `xp:${s.generation}:${policy.event}:${key}`,
      recipient: s.player.id,
      generation: s.generation,
      mission: policy.event,
      kind,
      amount,
    });
  policy.awarded[key] = awarded ? amount : 0;
  if (!awarded) return 0;
  s.xp = next.xp;
  if (s.progression)
    s.progression.rawEarned = (s.progression.rawEarned ?? 0) + amount;
  return amount;
}
