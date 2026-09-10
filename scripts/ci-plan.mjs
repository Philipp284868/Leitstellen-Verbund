import { execFileSync } from "node:child_process";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CI_CONTRACT, contractHash, sameSet } from "./ci-contract.mjs";
import { forEngine } from "./browser-scope.mjs";

export function changedPaths(base, head, cwd = resolve(".")) {
  if (
    !/^[a-f0-9]{40}$/.test(base || "") ||
    !/^([a-f0-9]{40})$/.test(head || "") ||
    /^0+$/.test(base)
  )
    return null;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", base, head], {
      cwd,
      stdio: "pipe",
    });
    const fields = execFileSync(
      "git",
      ["diff", "--name-status", "-z", "-M", base, head],
      { cwd, encoding: "utf8" },
    ).split("\0");
    const paths = [];
    for (let i = 0; i < fields.length && fields[i]; ) {
      const status = fields[i++];
      paths.push(fields[i++]);
      if (/^[RC]/.test(status)) paths.push(fields[i++]);
    }
    return [...new Set(paths)].sort();
  } catch {
    return null;
  }
}
export function classify(paths, requested = "auto") {
  if (!["auto", "fast", "full", "deep"].includes(requested))
    throw Error("Unbekanntes Prüfprofil.");
  if (requested === "deep") return "deep";
  if (!paths || !paths.length) return "full";
  if (
    requested !== "full" &&
    paths.every((p) => /^(README\.md|CONTRIBUTING\.md|docs\/.*\.md)$/.test(p))
  )
    return "docs";
  if (
    paths.some((p) =>
      /^(src\/germany\/(GermanyMap|game-markers)|server\/germany\/|src\/motion|tests\/e2e\/map-load|scripts\/geodata\/)/.test(
        p,
      ),
    )
  )
    return "deep";
  if (requested === "full") return "full";
  const narrow =
    /^(src\/audio\/|src\/(?:audio|device-preferences|money|fleet-view|map-symbols)\.ts$|tests\/(?:audio[^/]*|device-preferences|economy|fleet-view|map-symbols)\.test\.ts$|tests\/e2e\/(?:audio[^/]*|settings-workstation)\.spec\.ts$)/;
  return paths.every((p) => narrow.test(p) && existsSync(p)) ? "fast" : "full";
}
// Longest processing time first, using measured per-engine file costs. Files
// stay serial internally; only independent files run in separate workers.
export function balance(files, costs, count) {
  const parts = Array.from({ length: Math.min(count, files.length) }, () => ({
    files: [],
    ms: 0,
  }));
  for (const file of [...files].sort(
    (a, b) => (costs[b] || 30000) - (costs[a] || 30000) || a.localeCompare(b),
  )) {
    const part = [...parts].sort((a, b) => a.ms - b.ms)[0];
    part.files.push(file);
    part.ms += costs[file] || 30000;
  }
  if (
    !sameSet(
      files,
      parts.flatMap((p) => p.files),
    )
  )
    throw Error("Unvollständige Shardaufteilung.");
  return parts.map((p) => p.files.sort());
}
export async function makePlan({ head, base, paths, requested = "auto" }) {
  const profile = classify(paths, requested),
    selected = {
      structure: ["project", "format", ...(profile === "docs" ? [] : ["lint"])],
    },
    partitions = {};
  if (profile !== "docs") {
    const { testGroups } = await import("./test-groups.mjs");
    const { sourceGraph } = await import("./source-graph.mjs");
    const groups = testGroups();
    const browser = readdirSync("tests/e2e", { recursive: true })
      .filter((f) => f.endsWith(".spec.ts") && !f.endsWith("map-load.spec.ts"))
      .map((f) => "tests/e2e/" + f.replaceAll("\\", "/"))
      .sort();
    const affected = (file) =>
      paths.some((p) => p === file || sourceGraph([file]).includes(p));
    selected.build = ["typecheck", "germany-build", "bundle-budgets"];
    selected.logic =
      profile === "fast"
        ? groups.all.filter(
            (f) =>
              affected(f) ||
              /\/(?:economy|ids|source-graph|ci-contract)\.test\.ts$/.test(f),
          )
        : groups.all;
    const selectedBrowser =
      profile === "fast"
        ? browser.filter((f) => affected(f) || f.endsWith("/game.spec.ts"))
        : browser;
    for (const engine of ["chromium", "firefox"])
      selected[engine] = forEngine(selectedBrowser, engine);
    if (
      !selected.logic.length ||
      !selected.chromium.length ||
      !selected.firefox.length
    )
      throw Error("Pflicht-Prüfumfang ist leer.");
    const costs = JSON.parse(
      readFileSync("scripts/browser-costs.json", "utf8"),
    );
    for (const engine of ["chromium", "firefox"])
      partitions[engine] = balance(
        selected[engine],
        costs[engine],
        profile === "fast" ? 1 : 2,
      );
    if (profile !== "fast") {
      selected.node = readdirSync("tests", { recursive: true })
        .filter((f) => f.endsWith(".node.mjs"))
        .map((f) => "tests/" + f.replaceAll("\\", "/"))
        .sort();
      selected.geodata = ["tools", "jdk-repair", "osm-index", "dem"];
      selected.package = [
        "runtime-package",
        "reproducibility",
        "runtime-start-restart",
      ];
      selected.audit = ["production-dependencies"];
      selected.amp = ["debian-fresh-setup-recovery-caddy-tls"];
    }
    if (profile === "deep")
      selected.endurance = [
        "chromium:tests/e2e/map-load.spec.ts",
        "firefox:tests/e2e/map-load.spec.ts",
      ];
  }
  return {
    schema: CI_CONTRACT.schema,
    contract: contractHash,
    product: CI_CONTRACT.product,
    head,
    base: base ?? null,
    profile,
    reason:
      paths === null
        ? "Basis fehlt; vollständige Abnahme."
        : profile === "fast"
          ? "Begrenzter Änderungsumfang mit Abhängigkeitsanalyse."
          : "Verpflichtender Umfang nach betroffener Produktgrundlage.",
    paths,
    expected: CI_CONTRACT.profiles[profile],
    selected,
    partitions,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const event = process.env.GITHUB_EVENT_PATH
    ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"))
    : {};
  const flag = (name) => {
    const i = process.argv.indexOf(name);
    return i < 0 ? undefined : process.argv[i + 1];
  };
  const base =
    flag("--base") ||
    process.env.CI_BASE ||
    event.before ||
    event.pull_request?.base?.sha;
  const plan = await makePlan({
    head,
    base,
    paths: changedPaths(base, head),
    requested: flag("--profile") || process.env.CI_PROFILE || "auto",
  });
  mkdirSync(".tools/ci", { recursive: true });
  writeFileSync(".tools/ci/plan.json", JSON.stringify(plan, null, 2) + "\n");
  const matrix = {
    include: Object.entries(plan.partitions).flatMap(([engine, parts]) =>
      parts.map((_, part) => ({ engine, part })),
    ),
  };
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      "profile=" +
        plan.profile +
        "\nfull=" +
        ["full", "deep"].includes(plan.profile) +
        "\nmatrix=" +
        JSON.stringify(matrix) +
        "\n",
    );
  console.log(JSON.stringify(plan));
}
