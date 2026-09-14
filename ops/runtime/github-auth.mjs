import {
  openSync,
  fstatSync,
  closeSync,
  readFileSync,
  constants,
  lstatSync,
} from "node:fs";
import { resolve } from "node:path";
import { safePath } from "./files.mjs";

/** Operator-created secret, outside releases/config exports. Never accepted through argv or a URL. */
export function readGithubCredential(root) {
  const file = resolve(root, "shared/secrets/github-read-token");
  let fd;
  try {
    safePath(root, file);
    const parent = lstatSync(resolve(root, "shared/secrets"));
    if (
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      (process.platform !== "win32" &&
        (parent.mode & 0o077 || parent.uid !== process.getuid()))
    )
      throw Error("unsafe");
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.size > 4096 ||
      stat.nlink !== 1 ||
      (process.platform !== "win32" &&
        (stat.mode & 0o077 || stat.uid !== process.getuid()))
    )
      throw Error("unsafe");
    const token = readFileSync(fd, "utf8").trim();
    if (!/^[A-Za-z0-9_]{20,512}$/.test(token)) throw Error("invalid");
    return token;
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw Error(
      "GitHub-Lesezugang ungültig oder nicht geschützt. shared/secrets (0700) und github-read-token (0600) als AMP-Benutzer prüfen.",
    );
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

const assetHosts = new Set([
  "release-assets.githubusercontent.com",
  "objects.githubusercontent.com",
]);
export function githubSource(url, repository, redirected = false) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw Error("Unzulässige GitHub-Paketquelle.");
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash)
    throw Error("Unzulässige GitHub-Paketquelle.");
  const api =
    u.hostname === "api.github.com" &&
    u.pathname.startsWith(`/repos/${repository}/releases/`) &&
    !u.search;
  if (!api && !(redirected && assetHosts.has(u.hostname)))
    throw Error("Unzulässige GitHub-Paketquelle.");
  return { u, api };
}

/** Bounded manual redirects. Credentials only go to this repository's GitHub API. */
export async function githubResponse(
  url,
  {
    repository,
    token,
    json = false,
    fetchImpl = fetch,
    signal = AbortSignal.timeout(120000),
  },
) {
  let next = url;
  for (let hop = 0; hop < 5; hop++) {
    const { u, api } = githubSource(next, repository, hop > 0);
    let response;
    try {
      response = await fetchImpl(u.href, {
        redirect: "manual",
        signal,
        headers: {
          Accept: json
            ? "application/vnd.github+json"
            : "application/octet-stream",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(api && token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {
      throw Error(
        "GitHub-Download nicht erreichbar. Bisherige Version erhalten.",
      );
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw Error("GitHub-Weiterleitung unvollständig.");
      try {
        next = new URL(location, u).href;
      } catch {
        throw Error("Unzulässige GitHub-Weiterleitung.");
      }
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw Error(
        `GitHub-Abruf abgelehnt (HTTP ${response.status}). Lesezugang und Repository-Freigabe prüfen; bisherige Version erhalten.`,
      );
    }
    return response;
  }
  throw Error("Zu viele GitHub-Weiterleitungen. Bisherige Version erhalten.");
}
export async function githubBytes(
  url,
  { limit = 256 * 1024 * 1024, ...options },
) {
  const response = await githubResponse(url, options);
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > limit) throw Error("limit");
      chunks.push(chunk);
    }
  } catch {
    throw Error(
      "GitHub-Download abgebrochen oder Größenlimit überschritten. Bisherige Version erhalten.",
    );
  }
  return Buffer.concat(chunks);
}
