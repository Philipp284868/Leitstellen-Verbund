import {
  githubBytes,
  githubResponse,
  githubSource,
  readGithubCredential,
} from "../../ops/runtime/github-auth.mjs";
const repository = "Philipp284868/Leitstellen-Verbund";

/** Metadata once per installation; stream each checked part with short-lived
 * redirects. Only canonical API asset URLs are held in memory. */
export function privateGeodataAssets(root, tag, fetchImpl = fetch) {
  const token = root ? readGithubCredential(root) : undefined;
  if (!token) return undefined; // Public transition; private installations fail clearly without their credential.
  let assets;
  return async (part) => {
    assets ??= (async () => {
      const meta = JSON.parse(
        (
          await githubBytes(
            `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
            {
              repository,
              token,
              json: true,
              limit: 8 * 1024 * 1024,
              fetchImpl,
            },
          )
        ).toString(),
      );
      if (meta.draft || meta.tag_name !== tag || !Array.isArray(meta.assets))
        throw Error("Deutschland-Release nicht freigegeben.");
      return meta.assets;
    })();
    const matches = (await assets).filter(
      (a) => a.name === part.asset && a.state === "uploaded",
    );
    if (
      matches.length !== 1 ||
      matches[0].size !== part.bytes ||
      (matches[0].digest && matches[0].digest !== "sha256:" + part.sha256)
    )
      throw Error(
        "Deutschland-Releaseasset fehlt oder widerspricht dem freigegebenen Datenkatalog.",
      );
    githubSource(matches[0].url, repository);
    return githubResponse(matches[0].url, {
      repository,
      token,
      fetchImpl,
      signal: AbortSignal.timeout(15 * 60 * 1000),
    });
  };
}
