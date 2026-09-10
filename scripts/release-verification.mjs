import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { assertReleaseAcceptance, sameSet } from "./ci-contract.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function releaseRun(runs, path, head) {
  const run = runs
    .filter(
      (r) =>
        r.path?.split("@")[0] === path &&
        r.head_sha === head &&
        r.head_branch === "main" &&
        ["push", "workflow_dispatch"].includes(r.event),
    )
    .sort((a, b) => b.id - a.id)[0];
  if (run?.status !== "completed" || run.conclusion !== "success")
    throw Error("Erforderlicher erfolgreicher Lauf fehlt: " + path);
  return run;
}
export function verifyCoverage(proof) {
  const node = readdirSync("tests", { recursive: true })
    .filter((f) => f.endsWith(".node.mjs"))
    .map((f) => "tests/" + f.replaceAll("\\", "/"));
  const logic = readdirSync("tests", { recursive: true })
    .filter((f) => f.endsWith(".test.ts"))
    .map((f) => "tests/" + f.replaceAll("\\", "/"));
  const browser = readdirSync("tests/e2e", { recursive: true })
    .filter((f) => f.endsWith(".spec.ts") && !f.endsWith("map-load.spec.ts"))
    .map((f) => "tests/e2e/" + f.replaceAll("\\", "/"));
  if (
    !sameSet(proof.selected.logic, logic) ||
    !sameSet(proof.selected.node, node) ||
    !sameSet(proof.selected.chromium, browser) ||
    !sameSet(proof.selected.firefox, browser)
  )
    throw Error(
      "Releaseabnahme deckt nicht das vollständige aktuelle Produkt ab.",
    );
}
export async function verifiedRelease(api, token, repository, sha) {
  const main = await api("/branches/main");
  if (main.commit.sha !== sha)
    throw Error(
      "main ist inzwischen weitergelaufen; den exakten aktuellen Commit zuerst vollständig prüfen.",
    );
  const { workflow_runs: runs } = await api(
    "/actions/runs?head_sha=" + sha + "&per_page=100",
  );
  const product = releaseRun(runs, ".github/workflows/ci.yml", sha);
  const security = releaseRun(runs, ".github/workflows/security.yml", sha);
  const { artifacts } = await api(
    "/actions/runs/" + product.id + "/artifacts?per_page=100",
  );
  async function artifact(name) {
    const found = artifacts.filter((a) => a.name === name && !a.expired);
    if (found.length !== 1)
      throw Error("Eindeutiges unverfallenes Abnahmeartefakt fehlt: " + name);
    const a = found[0];
    const response = await fetch(
      "https://api.github.com/repos/" +
        repository +
        "/actions/artifacts/" +
        a.id +
        "/zip",
      {
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json",
        },
        signal: AbortSignal.timeout(120000),
      },
    );
    if (!response.ok)
      throw Error("Artefakt-Download scheiterte: " + response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (a.digest !== "sha256:" + hash(bytes))
      throw Error("GitHub-Artefaktprüfsumme stimmt nicht.");
    await mkdir(".tools/release-verification", { recursive: true });
    const file = resolve(".tools/release-verification", name + ".zip");
    await writeFile(file, bytes);
    const entries = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter((p) => !p.endsWith("/"));
    const get = (name) => {
      if (entries.filter((e) => e === name).length !== 1)
        throw Error("Artefaktdatei fehlt oder ist doppelt: " + name);
      return execFileSync("unzip", ["-p", file, name], {
        maxBuffer: 300 * 1024 * 1024,
      });
    };
    return { entries, get };
  }
  const approval = await artifact("product-acceptance");
  const proof = assertReleaseAcceptance(
    JSON.parse(approval.get("acceptance.json")),
    sha,
  );
  verifyCoverage(proof);
  const candidate = await artifact("linux-runtime-candidate");
  const manifest = JSON.parse(candidate.get("release.json"));
  const p = proof.results.find((r) => r.group === "package");
  if (
    manifest.commit !== sha ||
    manifest.product !== "germany-1" ||
    manifest.buildHash !== p.buildHash
  )
    throw Error("Runtime-Manifest gehört nicht zur vollständigen Abnahme.");
  if (!/^[a-z0-9.-]+\.tar\.gz$/.test(p.archive))
    throw Error("Ungültiger Paketname.");
  const bytes = candidate.get(p.archive),
    sum = candidate.get("SHA256SUMS").toString("utf8");
  if (
    hash(bytes) !== p.archiveHash ||
    sum !== p.archiveHash + "  " + p.archive + "\n"
  )
    throw Error("Runtime-Paket stimmt nicht mit geprüften Bytes überein.");
  await mkdir(".tools/releases", { recursive: true });
  for (const name of [p.archive, "SHA256SUMS", "release.json"])
    await writeFile(resolve(".tools/releases", name), candidate.get(name));
  await writeFile(
    ".tools/releases/acceptance.json",
    JSON.stringify(proof, null, 2) + "\n",
  );
  await writeFile(
    ".tools/release-verification/verification.json",
    JSON.stringify(
      {
        head: sha,
        productRun: product.id,
        securityRun: security.id,
        archive: p.archive,
        sha256: p.archiveHash,
      },
      null,
      2,
    ) + "\n",
  );
  // Check main again after potentially slow artifact downloads.
  if ((await api("/branches/main")).commit.sha !== sha)
    throw Error("main änderte sich während der Artefaktprüfung.");
  return proof;
}
