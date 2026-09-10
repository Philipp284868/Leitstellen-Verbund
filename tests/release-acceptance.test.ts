import { it, expect } from "vitest";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { mergeResults, assertJobs } = await import(
  pathToFileURL(resolve("scripts/ci-aggregate.mjs")).href
);
it("verlangt echte erfolgreiche Pflichtjobs und lässt nur geplante Jobs aus", () => {
  const jobs = Object.fromEntries(
    ["prepare", "logic", "browser", "geodata", "endurance"].map((name) => [
      name,
      { result: name === "endurance" ? "skipped" : "success" },
    ]),
  );
  expect(() => assertJobs({ profile: "full" }, jobs)).not.toThrow();
  for (const result of ["skipped", "failure", "cancelled", undefined])
    expect(() =>
      assertJobs({ profile: "full" }, { ...jobs, browser: { result } }),
    ).toThrow("Pflichtjob");
  expect(() => assertJobs({ profile: "deep" }, jobs)).toThrow("endurance");
  expect(() =>
    assertJobs(
      { profile: "docs" },
      {
        prepare: { result: "success" },
        logic: { result: "skipped" },
        browser: { result: "skipped" },
        geodata: { result: "skipped" },
        endurance: { result: "skipped" },
      },
    ),
  ).not.toThrow();
});
const { releaseRun, verifyCoverage } = await import(
  pathToFileURL(resolve("scripts/release-verification.mjs")).href
);
const { makePlan } = await import(
  pathToFileURL(resolve("scripts/ci-plan.mjs")).href
);
it("verweigert verlorene, doppelte und falsche Browser-Shards vor dem Gesamtstatus", () => {
  const plan = {
    head: "a",
    contract: "c",
    expected: ["chromium"],
    partitions: { chromium: [["one"], ["two"]] },
  };
  const parts = [0, 1].map((part) => ({
    group: "chromium",
    part,
    head: "a",
    contract: "c",
    status: "success",
    executed: [part ? "two" : "one"],
    passed: 1,
    failed: 0,
    skipped: 0,
    flaky: 0,
    durationMs: 10,
  }));
  expect(mergeResults(plan, parts)[0].executed).toEqual(["one", "two"]);
  expect(() => mergeResults(plan, parts.slice(1))).toThrow("Shard");
  expect(() => mergeResults(plan, [parts[0], parts[0]])).toThrow("Shard");
  expect(() =>
    mergeResults(plan, [parts[0], { ...parts[1], status: "cancelled" }]),
  ).toThrow("Shard");
  expect(() =>
    mergeResults(plan, [parts[0], { ...parts[1], executed: ["one"] }]),
  ).toThrow("Shard");
});
it("Release vertraut dem Workflowpfad und finalen Commit, nicht dem frei wählbaren Anzeigenamen", () => {
  const head = "a".repeat(40),
    path = ".github/workflows/ci.yml";
  const run = {
    id: 1,
    path,
    head_sha: head,
    head_branch: "main",
    event: "push",
    status: "completed",
    conclusion: "success",
    name: "Beliebiger Name",
  };
  expect(releaseRun([run], path, head)).toEqual(run);
  expect(() =>
    releaseRun(
      [{ ...run, path: ".github/workflows/quick.yml", name: "Prüfung" }],
      path,
      head,
    ),
  ).toThrow();
  for (const changed of [
    { event: "pull_request" },
    { head_sha: "b".repeat(40) },
    { conclusion: "failure" },
    { conclusion: "cancelled" },
  ])
    expect(() => releaseRun([{ ...run, ...changed }], path, head)).toThrow();
  expect(() =>
    releaseRun([run, { ...run, id: 2, conclusion: "failure" }], path, head),
  ).toThrow();
});
it("Release prüft alle aktuellen Testdateien erneut gegen den gemeldeten Gesamtumfang", async () => {
  const p = await makePlan({
    head: "a".repeat(40),
    base: null,
    paths: null,
    requested: "full",
  });
  expect(() => verifyCoverage(p)).not.toThrow();
  expect(() =>
    verifyCoverage({
      ...p,
      selected: { ...p.selected, logic: p.selected.logic.slice(1) },
    }),
  ).toThrow("vollständige");
  expect(() =>
    verifyCoverage({ ...p, selected: { ...p.selected, firefox: [] } }),
  ).toThrow("vollständige");
});
