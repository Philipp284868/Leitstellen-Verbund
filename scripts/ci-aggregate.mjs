import {
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  appendFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { acceptance, sameSet } from "./ci-contract.mjs";

export function assertJobs(plan, jobs) {
  const required = [
    "prepare",
    ...(plan.profile === "docs" ? [] : ["logic", "browser"]),
    ...(["full", "deep"].includes(plan.profile) ? ["geodata", "amp"] : []),
    ...(plan.profile === "deep" ? ["endurance"] : []),
  ];
  for (const name of [
    "prepare",
    "logic",
    "browser",
    "geodata",
    "endurance",
    "amp",
  ]) {
    const result = jobs[name]?.result;
    if (required.includes(name) ? result !== "success" : result !== "skipped")
      throw Error(
        "Pflichtjob oder vorgesehene Auslassung nicht bestätigt: " +
          name +
          " (" +
          result +
          ")",
      );
  }
}

export function mergeResults(plan, parts) {
  if (parts.some((p) => !plan.expected.includes(p.group)))
    throw Error("Unerwartetes Prüfergebnis.");
  return plan.expected.map((group) => {
    const found = parts.filter((p) => p.group === group),
      shards = plan.partitions?.[group];
    if (!shards) {
      if (found.length !== 1 || found[0].part !== undefined)
        throw Error("Pflichtgruppe fehlt oder ist doppelt: " + group);
      return found[0];
    }
    if (
      !sameSet(
        found.map((p) => p.part),
        shards.map((_, i) => i),
      )
    )
      throw Error("Shard fehlt oder ist doppelt: " + group);
    for (const p of found)
      if (
        !sameSet(shards[p.part], p.executed) ||
        p.head !== plan.head ||
        p.contract !== plan.contract ||
        p.status !== "success"
      )
        throw Error(
          "Shard nicht vollständig erfolgreich: " + group + "-" + p.part,
        );
    return {
      group,
      head: plan.head,
      contract: plan.contract,
      status: "success",
      executed: found.flatMap((p) => p.executed),
      passed: found.reduce((n, p) => n + p.passed, 0),
      failed: found.reduce((n, p) => n + p.failed, 0),
      skipped: found.reduce((n, p) => n + p.skipped, 0),
      flaky: found.reduce((n, p) => n + p.flaky, 0),
      durationMs: Math.max(...found.map((p) => p.durationMs)),
      parts: found,
    };
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const plan = JSON.parse(readFileSync(".tools/ci/plan.json", "utf8"));
  if (process.env.GITHUB_ACTIONS === "true")
    assertJobs(plan, JSON.parse(process.env.CI_JOB_RESULTS || "{}"));
  const root = process.argv[2] || ".tools/ci/collected";
  const parts = readdirSync(root, { recursive: true })
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(resolve(root, f), "utf8")));
  const proof = acceptance(plan, mergeResults(plan, parts));
  mkdirSync(".tools/ci", { recursive: true });
  writeFileSync(
    ".tools/ci/acceptance.json",
    JSON.stringify(proof, null, 2) + "\n",
  );
  let summary =
    "## Produktabnahme: " +
    plan.profile +
    "\n\nCommit: " +
    plan.head +
    "\n\n" +
    plan.reason +
    "\n\n| Gruppe | Ausgeführt / erwartet | Bestanden | Sekunden |\n|---|---:|---:|---:|\n";
  for (const r of proof.results)
    summary +=
      "| " +
      r.group +
      " | " +
      r.executed.length +
      " / " +
      plan.selected[r.group].length +
      " | " +
      r.passed +
      " | " +
      (r.durationMs / 1000).toFixed(1) +
      " |\n";
  summary +=
    "\n" +
    (plan.profile === "fast"
      ? "Begrenzte Schnellprüfung; keine Releasefreigabe."
      : plan.profile === "docs"
        ? "Dokumentationsprüfung; kein Spielbuild geprüft."
        : "Vollständiger Pflichtumfang dieses Vertrags bestanden. Sicherheitsworkflow und Paketprovenienz werden vor einem Release zusätzlich gebunden.") +
    "\n";
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
