import { it, expect } from "vitest";
import { parseProjectNews } from "../src/client/project-news";
const item = {
  title: "Freigegeben",
  summary: "<script>kein HTML</script>",
  url: "https://github.com/Philipp284868/Leitstellen-Verbund/discussions/23",
  kind: "announcement",
  publishedAt: "2026-09-08T10:00:00Z",
};
it("übernimmt ausschließlich begrenzte freigegebene Repository-Metadaten als Klartext", () => {
  expect(parseProjectNews({ items: [item] })).toEqual([item]);
  expect(parseProjectNews({ items: Array(10).fill(item) })).toHaveLength(5);
  expect(
    parseProjectNews({ items: [{ ...item, title: "x".repeat(3000) }] })[0]
      .title,
  ).toHaveLength(160);
});
it("weist fremde Ziele, Credentials, ausführbare URLs und beschädigte Daten ab", () => {
  for (const url of [
    "javascript:alert(1)",
    "https://evil.test/x",
    "https://github.com/anderer/repo/releases/tag/x",
    "https://secret@github.com/Philipp284868/Leitstellen-Verbund/discussions/23",
  ])
    expect(parseProjectNews({ items: [{ ...item, url }] })).toEqual([]);
  for (const input of [
    null,
    {},
    {
      items: [
        null,
        { ...item, publishedAt: "kaputt" },
        { ...item, kind: "draft" },
      ],
    },
  ])
    expect(parseProjectNews(input)).toEqual([]);
});
