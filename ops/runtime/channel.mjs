import {
  githubBytes,
  readGithubCredential,
  githubSource,
} from "./github-auth.mjs";
const repository = "Philipp284868/Leitstellen-Verbund";
const base = `https://api.github.com/repos/${repository}`;
export async function fetchBytes(
  url,
  limit = 256 * 1024 * 1024,
  root = process.cwd(),
) {
  return githubBytes(url, {
    repository,
    limit,
    token: readGithubCredential(root),
  });
}
export async function candidate({ root = process.cwd() } = {}) {
  const release = JSON.parse(
    (
      await githubBytes(base + "/releases/latest", {
        repository,
        token: readGithubCredential(root),
        limit: 2 * 1024 * 1024,
        json: true,
      })
    ).toString(),
  );
  if (release.draft || release.prerelease)
    throw Error("Release ist nicht freigegeben.");
  const asset = (n) => {
    const a = release.assets.filter((x) => x.name === n);
    if (a.length !== 1 || a[0].state !== "uploaded")
      throw Error("Release unvollständig: " + n);
    return a[0];
  };
  const descriptor = JSON.parse(
    (await fetchBytes(asset("channel.json").url, 16384, root)).toString(),
  );
  if (
    descriptor.format !== 1 ||
    descriptor.tag !== release.tag_name ||
    !/^[a-f0-9]{64}$/.test(descriptor.sha256) ||
    !/^[a-f0-9]{40}$/.test(descriptor.commit) ||
    !Number.isSafeInteger(descriptor.sequence)
  )
    throw Error("Freigabenachweis ungültig.");
  const a = asset(descriptor.archive);
  githubSource(a.url, repository);
  if (
    !Number.isSafeInteger(a.size) ||
    a.size <= 0 ||
    a.size > 256 * 1024 * 1024 ||
    !/^\d+\.\d+\.\d+$/.test(descriptor.version) ||
    descriptor.sequence < 1
  )
    throw Error("Ungültige Paketgröße oder Versionskennung.");
  if (a.digest && a.digest !== "sha256:" + descriptor.sha256)
    throw Error("GitHub-Prüfsumme widerspricht Freigabe.");
  return { ...descriptor, url: a.url, size: a.size };
}
