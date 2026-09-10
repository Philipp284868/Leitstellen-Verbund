import { it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const { CI_CONTRACT, contractHash, acceptance, assertReleaseAcceptance } =
  await import(pathToFileURL(resolve("scripts/ci-contract.mjs")).href);
const { classify, changedPaths, balance } = await import(
  pathToFileURL(resolve("scripts/ci-plan.mjs")).href
);
const { runCommand } = await import(
  pathToFileURL(resolve("scripts/ci-process.mjs")).href
);
const head = "a".repeat(40),
  hash = "b".repeat(64);
const plan = (profile: string) => ({
  schema: CI_CONTRACT.schema,
  contract: contractHash,
  product: CI_CONTRACT.product,
  head,
  profile,
  expected: CI_CONTRACT.profiles[profile],
  selected: Object.fromEntries(
    CI_CONTRACT.profiles[profile].map((group: string) => [
      group,
      [group + "-required"],
    ]),
  ),
});
const results = (profile: string) =>
  CI_CONTRACT.profiles[profile].map((group: string) => ({
    group,
    head,
    contract: contractHash,
    status: "success",
    executed: [group + "-required"],
    passed: 1,
    failed: 0,
    skipped: 0,
    flaky: 0,
    ...(group === "build" ? { outputHash: hash } : {}),
    ...(group === "package" ? { buildHash: hash, archiveHash: hash } : {}),
  }));
it("verweigert fehlende, abgebrochene, fremde, doppelte und leere Pflichtgruppen", () => {
  const p = plan("full"),
    r = results("full");
  expect(acceptance(p, r).status).toBe("success");
  for (const status of ["failure", "cancelled", "skipped", "pending"])
    expect(() =>
      acceptance(
        p,
        r.map((v: { group: string }) =>
          v.group === "logic" ? { ...v, status } : v,
        ),
      ),
    ).toThrow("Pflichtgruppe");
  expect(() => acceptance(p, r.slice(1))).toThrow("Pflichtgruppe");
  expect(() => acceptance(p, [...r, r[0]])).toThrow("Doppelte");
  expect(() => acceptance({ ...p, expected: p.expected.slice(1) }, r)).toThrow(
    "Pflichtgruppen",
  );
  for (const invalid of [
    { executed: [] },
    { passed: 0 },
    { failed: 1 },
    { skipped: 1 },
    { flaky: 1 },
    { executed: ["logic-required", "logic-required"] },
  ])
    expect(() =>
      acceptance(
        p,
        r.map((v: { group: string }) =>
          v.group === "logic" ? { ...v, ...invalid } : v,
        ),
      ),
    ).toThrow("Umfang");
  expect(() => acceptance({ ...p, selected: {} }, r)).toThrow("Umfang");
  expect(() => acceptance({ ...p, contract: "old" }, r)).toThrow("Prüfvertrag");
});
it("bindet vollständige Freigabe an SHA, Vertrag und dieselbe Build-/Paketprovenienz", () => {
  expect(() =>
    assertReleaseAcceptance(acceptance(plan("fast"), results("fast")), head),
  ).toThrow("Schnellprüfung");
  const proof = acceptance(plan("full"), results("full"));
  expect(assertReleaseAcceptance(proof, head)).toEqual(proof);
  expect(() => assertReleaseAcceptance(proof, "c".repeat(40))).toThrow();
  expect(() =>
    assertReleaseAcceptance({ ...proof, contract: "old" }, head),
  ).toThrow();
  expect(() =>
    assertReleaseAcceptance(
      {
        ...proof,
        results: proof.results.map((r: { group: string }) =>
          r.group === "package" ? { ...r, buildHash: "d".repeat(64) } : r,
        ),
      },
      head,
    ),
  ).toThrow("Paketprovenienz");
});
it("wählt bei unbekannter Basis, gemeinsamen Grundlagen, Löschung und neuen Werkzeugen die volle Abnahme", () => {
  for (const paths of [
    null,
    [],
    ["src/engine.ts"],
    ["server/auth.ts"],
    ["scripts/release-draft.mjs"],
    ["tests/fixtures/germany/server.ts"],
    ["src/audio/deleted.ts"],
    ["unknown"],
  ])
    expect(classify(paths)).toBe("full");
  expect(classify(["src/audio/events.ts"])).toBe("fast");
  expect(classify(["docs/MENUES.md"])).toBe("docs");
  expect(classify(["docs/MENUES.md"], "full")).toBe("full");
  expect(classify(["docs/TESTMIGRATION.json"])).toBe("full");
  expect(classify(["src/germany/GermanyMap.tsx"])).toBe("deep");
  expect(classify(["src/engine.ts"], "fast")).toBe("full");
});
it("erfasst echte umbenannte und gelöschte Gitpfade einschließlich vorherigem Namen", () => {
  const root = mkdtempSync(resolve(tmpdir(), "lv-ci-diff-"));
  try {
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        [
          "-c",
          "user.name=Test",
          "-c",
          "user.email=test@example.invalid",
          ...args,
        ],
        { cwd: root, encoding: "utf8", stdio: "pipe" },
      ).trim();
    git("init");
    writeFileSync(resolve(root, "before.txt"), "unchanged contents");
    writeFileSync(resolve(root, "deleted.txt"), "remove");
    git("add", ".");
    git("commit", "-m", "before");
    const base = git("rev-parse", "HEAD");
    git("mv", "before.txt", "after.txt");
    git("rm", "deleted.txt");
    git("commit", "-am", "after");
    const target = git("rev-parse", "HEAD");
    expect(changedPaths(base, target, root)).toEqual([
      "after.txt",
      "before.txt",
      "deleted.txt",
    ]);
    expect(changedPaths("0".repeat(40), target, root)).toBeNull();
    expect(changedPaths(target, base, root)).toBeNull();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it("balanciert messbare Dateikosten ohne fehlende oder doppelte Tests", () => {
  const parts = balance(
    ["a", "b", "c", "d"],
    { a: 100, b: 90, c: 20, d: 10 },
    2,
  );
  expect(parts).toEqual([
    ["a", "d"],
    ["b", "c"],
  ]);
});
it("ein tatsächlich fehlgeschlagener Kindprozess kann keine erfolgreiche Pflichtprüfung erzeugen", async () => {
  await expect(runCommand(["-e", "process.exit(7)"])).rejects.toThrow("(7)");
  const p = plan("full"),
    r = results("full");
  try {
    await runCommand(["-e", "process.exit(3)"]);
  } catch {
    r.find((x: { group: string }) => x.group === "logic").status = "failure";
  }
  expect(() => acceptance(p, r)).toThrow("Pflichtgruppe");
});
