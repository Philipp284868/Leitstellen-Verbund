import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parseProjectNews } from "../src/project-news.ts";
const fallback = JSON.parse(
  await readFile(
    new URL("../src/project-news-fallback.json", import.meta.url),
    "utf8",
  ),
);
let items = parseProjectNews(fallback);
try {
  if (process.env.LV_OFFLINE_NEWS === "1")
    throw Error("Reproduzierbarer Release-Build mit freigegebenen Metadaten");
  const r = await fetch(
    "https://api.github.com/repos/Philipp284868/Leitstellen-Verbund/releases?per_page=5",
    {
      signal: AbortSignal.timeout(2500),
      headers: { Accept: "application/vnd.github+json" },
    },
  );
  if (!r.ok) throw Error("GitHub nicht erreichbar");
  const releases = await r.json();
  if (Array.isArray(releases))
    items = [
      ...parseProjectNews({
        items: releases
          .filter((x) => !x.draft && !x.prerelease)
          .map((x) => ({
            title: x.name || x.tag_name,
            summary: x.body || "Änderungsnotizen auf GitHub",
            url: x.html_url,
            kind: "release",
            publishedAt: x.published_at,
          })),
      }),
      ...items,
    ].slice(0, 5);
} catch {
  console.log(
    "Projektmeldungen: geprüfte lokale Veröffentlichung als Fallback.",
  );
}
for (const directory of ["../dist/client", "../dist/client"])
  if (existsSync(new URL(directory, import.meta.url)))
    await writeFile(
      new URL(directory + "/project-news.json", import.meta.url),
      JSON.stringify({ items }, null, 2) + "\n",
    );
