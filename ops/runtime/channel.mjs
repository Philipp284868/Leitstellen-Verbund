const repository = "Philipp284868/Leitstellen-Verbund";
const base = `https://api.github.com/repos/${repository}`;
export async function fetchBytes(url, limit = 256 * 1024 * 1024) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    ![
      "api.github.com",
      "github.com",
      "release-assets.githubusercontent.com",
      "objects.githubusercontent.com",
    ].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password
  )
    throw Error("Unzulässige Paketquelle.");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(120000),
    headers: { Accept: "application/octet-stream" },
  });
  if (!response.ok)
    throw Error(
      "Download fehlgeschlagen (HTTP " +
        response.status +
        "). Bisherige Version erhalten.",
    );
  const chunks = [];
  let total = 0;
  for await (const c of response.body) {
    total += c.length;
    if (total > limit) {
      throw Error("Download überschreitet Größenlimit.");
    }
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
export async function candidate() {
  const r = await fetch(base + "/releases/latest", {
    signal: AbortSignal.timeout(20000),
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!r.ok)
    throw Error(
      "Kein freigegebenes Release verfügbar. Bisherige Version erhalten.",
    );
  const release = await r.json();
  if (release.draft || release.prerelease)
    throw Error("Release ist nicht freigegeben.");
  const asset = (n) => {
    const a = release.assets.filter((x) => x.name === n);
    if (a.length !== 1 || a[0].state !== "uploaded")
      throw Error("Release unvollständig: " + n);
    return a[0];
  };
  const descriptor = JSON.parse(
    (
      await fetchBytes(asset("channel.json").browser_download_url, 16384)
    ).toString(),
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
  if (a.digest && a.digest !== "sha256:" + descriptor.sha256)
    throw Error("GitHub-Prüfsumme widerspricht Freigabe.");
  return { ...descriptor, url: a.browser_download_url, size: a.size };
}
