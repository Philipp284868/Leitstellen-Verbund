// Only called by the manual, same-repository release workflow. No token enters client files.
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
const repository = "Philipp284868/Leitstellen-Verbund";
const sha = process.env.RELEASE_SHA;
if (!/^[a-f0-9]{40}$/.test(sha || ""))
  throw Error("Vollständiger Commit erforderlich.");
if (
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() !==
  sha
)
  throw Error("Checkout entspricht nicht dem angeforderten Commit.");
const token = process.env.GITHUB_TOKEN;
if (!token) throw Error("Workflow-Berechtigung fehlt.");
async function api(path, method = "GET", body) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  if (!response.ok) throw Error(`GitHub ${method} ${path}: ${response.status}`);
  return response.status === 204 ? null : response.json();
}
async function verifiedMain() {
  const main = await api("/branches/main");
  if (main.commit.sha !== sha)
    throw Error(
      "main ist inzwischen weitergelaufen; diesen Commit zuerst vollständig prüfen.",
    );
  const runs = await api(`/actions/runs?head_sha=${sha}&per_page=100`);
  for (const workflow of ["Prüfung", "Code-Sicherheit"]) {
    const latest = runs.workflow_runs
      .filter(
        (r) =>
          r.name === workflow &&
          r.head_branch === "main" &&
          r.event !== "pull_request",
      )
      .sort((a, b) => b.id - a.id)[0];
    if (latest?.conclusion !== "success")
      throw Error(
        `Erfolgreiche ${workflow} für exakt diesen main-Commit fehlt.`,
      );
  }
}
await verifiedMain();
if (process.argv.includes("--verify-only")) {
  console.log(
    "Exakter main-Commit mit vollständiger Prüfung und Code-Sicherheit bestätigt.",
  );
  process.exit(0);
}
if (
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() !==
  sha
)
  throw Error("Falscher Checkout.");
const pkg = JSON.parse(await readFile("package.json", "utf8")),
  tag = `v${pkg.version}`;
const releases = await api("/releases?per_page=100");
if (releases.some((r) => r.tag_name === tag))
  throw Error(
    "Release existiert bereits; keine automatische Änderung oder Überschreibung.",
  );
const refs = await api(`/git/matching-refs/tags/${tag}`);
if (refs.some((r) => r.ref === `refs/tags/${tag}`))
  throw Error("Tag existiert bereits; keine Überschreibung.");
const manifest = JSON.parse(
  await readFile(".tools/releases/release.json", "utf8"),
);
if (manifest.commit !== sha) throw Error("Paket gehört zu anderem Commit.");
await verifiedMain();
const release = await api("/releases", "POST", {
  tag_name: tag,
  target_commitish: sha,
  name: `${tag} – PC-Multiplayer (Entwurf)`,
  draft: true,
  prerelease: false,
  body: await readFile("docs/RELEASE-2.14.md", "utf8"),
});
const upload = new URL(release.upload_url.split("{")[0]);
if (upload.origin !== "https://uploads.github.com")
  throw Error("Unerwartetes Upload-Ziel.");
for (const name of (await readdir(".tools/releases")).sort()) {
  if (
    !name.endsWith(".tar.gz") &&
    !["SHA256SUMS", "release.json"].includes(name)
  )
    continue;
  const url = new URL(upload);
  url.searchParams.set("name", name);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body: await readFile(resolve(".tools/releases", name)),
  });
  if (!response.ok)
    throw Error(
      `Artefakt-Upload ${name}: ${response.status}. Entwurf bleibt unveröffentlicht.`,
    );
}
console.log(`Release-Entwurf mit geprüften Artefakten: ${release.html_url}`);
