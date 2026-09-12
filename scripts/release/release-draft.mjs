import { parseChangelog } from "../../src/client/changelog.ts";
// Only called by the manual, same-repository release workflow. No token enters client files.
import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifiedRelease } from "./release-verification.mjs";
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
const verifiedMain = () => verifiedRelease(api, token, repository, sha);
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
if (!/^\d+\.\d+\.\d+$/.test(pkg.version))
  throw Error("Gültige Releaseversion erforderlich.");
const changes = parseChangelog(await readFile("CHANGELOG.md", "utf8"));
const releaseEntry = changes.find((x) => x.version === pkg.version);
if (!releaseEntry) throw Error("Versionsnotizen fehlen in CHANGELOG.md");
const notes = releaseEntry.title + "\n\n" + releaseEntry.body;
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
const proof = JSON.parse(
  await readFile(".tools/releases/acceptance.json", "utf8"),
);
const pkgResult = proof.results.find((r) => r.group === "package");
const verification = JSON.parse(
  await readFile(".tools/release-verification/verification.json", "utf8"),
);
await writeFile(
  ".tools/releases/channel.json",
  JSON.stringify(
    {
      format: 1,
      tag,
      version: pkg.version,
      commit: sha,
      archive: pkgResult.archive,
      sha256: pkgResult.archiveHash,
      sequence: verification.productRun,
    },
    null,
    2,
  ) + "\n",
);
const release = await api("/releases", "POST", {
  tag_name: tag,
  target_commitish: sha,
  name: `${tag} – Leitstellen-Verbund (Entwurf)`,
  draft: true,
  prerelease: false,
  body: notes,
});
const upload = new URL(release.upload_url.split("{")[0]);
if (upload.origin !== "https://uploads.github.com")
  throw Error("Unerwartetes Upload-Ziel.");
for (const name of (await readdir(".tools/releases")).sort()) {
  if (
    !name.endsWith(".tar.gz") &&
    ![
      "SHA256SUMS",
      "release.json",
      "acceptance.json",
      "bootstrap.json",
      "channel.json",
    ].includes(name)
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
// A lightweight, immutable source tag is created only after every draft asset uploaded.
// Tags never trigger a private deployment. Publication is a separate explicit action.
await api("/git/refs", "POST", { ref: `refs/tags/${tag}`, sha });
console.log(`Release-Entwurf mit geprüften Artefakten: ${release.html_url}`);
if (process.argv.includes("--publish")) {
  await verifiedMain();
  const uploaded = await api(`/releases/${release.id}/assets`);
  for (const name of [
    pkgResult.archive,
    "release.json",
    "SHA256SUMS",
    "amp-bootstrap.tar.gz",
    "bootstrap.json",
    "channel.json",
    "acceptance.json",
  ])
    if (
      uploaded.filter((a) => a.name === name && a.state === "uploaded")
        .length !== 1
    )
      throw Error("Release bleibt Entwurf: Upload fehlt: " + name);
  await api(`/releases/${release.id}`, "PATCH", {
    draft: false,
    name: `${tag} – Leitstellen-Verbund`,
    make_latest: "true",
  });
  console.log(`Geprüftes Release veröffentlicht: ${release.html_url}`);
}
