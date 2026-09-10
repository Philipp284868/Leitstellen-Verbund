import { createHash } from "node:crypto";

// Changing a required group invalidates old acceptance and release evidence.
export const CI_CONTRACT = {
  schema: 2,
  product: "germany-1",
  profiles: {
    docs: ["structure"],
    fast: ["structure", "build", "logic", "chromium", "firefox"],
    full: [
      "structure",
      "build",
      "logic",
      "node",
      "chromium",
      "firefox",
      "geodata",
      "package",
      "audit",
      "amp",
    ],
    deep: [
      "structure",
      "build",
      "logic",
      "node",
      "chromium",
      "firefox",
      "geodata",
      "package",
      "audit",
      "amp",
      "endurance",
    ],
  },
};
export const contractHash = createHash("sha256")
  .update(JSON.stringify(CI_CONTRACT))
  .digest("hex");
export const sameSet = (a, b) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  new Set(a).size === a.length &&
  new Set(b).size === b.length &&
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
export function acceptance(plan, results) {
  if (
    plan.schema !== CI_CONTRACT.schema ||
    plan.contract !== contractHash ||
    plan.product !== CI_CONTRACT.product ||
    !/^[a-f0-9]{40}$/.test(plan.head || "")
  )
    throw Error("Unbekannter oder unvollständiger Prüfvertrag.");
  const expected = CI_CONTRACT.profiles[plan.profile];
  if (!expected || JSON.stringify(plan.expected) !== JSON.stringify(expected))
    throw Error(
      "Pflichtgruppen stimmen nicht mit dem aktuellen Vertrag überein.",
    );
  if (new Set(results.map((r) => r.group)).size !== results.length)
    throw Error("Doppelte Prüfergebnisse.");
  if (
    !sameSet(
      expected,
      results.map((r) => r.group),
    )
  )
    throw Error("Pflichtgruppe fehlt oder unerwartete Gruppe vorhanden.");
  for (const group of expected) {
    const r = results.find((r) => r.group === group),
      selected = plan.selected?.[group];
    if (
      r.status !== "success" ||
      r.head !== plan.head ||
      r.contract !== contractHash
    )
      throw Error(
        "Pflichtgruppe " +
          group +
          " scheiterte oder gehört nicht zu diesem Commit.",
      );
    if (
      !selected?.length ||
      !sameSet(selected, r.executed) ||
      r.failed !== 0 ||
      r.flaky !== 0 ||
      r.skipped !== 0 ||
      !(r.passed > 0)
    )
      throw Error(
        "Ausgeführter Umfang von " +
          group +
          " weicht vom Plan ab oder enthält fehlende/übersprungene Prüfungen.",
      );
  }
  return { ...plan, results, status: "success" };
}
export function assertReleaseAcceptance(proof, head) {
  if (
    !proof ||
    !["full", "deep"].includes(proof.profile) ||
    proof.head !== head ||
    proof.status !== "success"
  )
    throw Error(
      "Vollständige Abnahme für exakt diesen main-Commit fehlt; eine Schnellprüfung reicht nicht.",
    );
  acceptance(proof, proof.results ?? []);
  const build = proof.results.find((r) => r.group === "build"),
    pkg = proof.results.find((r) => r.group === "package");
  if (
    !/^[a-f0-9]{64}$/.test(build.outputHash || "") ||
    !/^[a-f0-9]{64}$/.test(pkg.archiveHash || "") ||
    pkg.buildHash !== build.outputHash
  )
    throw Error("Build-/Paketprovenienz fehlt oder stimmt nicht überein.");
  return proof;
}
