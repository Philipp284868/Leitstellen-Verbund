export interface ProjectNews {
  title: string;
  summary: string;
  url: string;
  kind: "release" | "announcement";
  publishedAt: string;
}
export function parseProjectNews(value: unknown): ProjectNews[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("items" in value) ||
    !Array.isArray(value.items)
  )
    return [];
  return value.items
    .flatMap((item: unknown) => {
      if (!item || typeof item !== "object") return [];
      const x = item as Record<string, unknown>;
      if (
        typeof x.title !== "string" ||
        typeof x.summary !== "string" ||
        typeof x.url !== "string" ||
        typeof x.publishedAt !== "string" ||
        !["release", "announcement"].includes(String(x.kind)) ||
        !Number.isFinite(Date.parse(x.publishedAt))
      )
        return [];
      try {
        const url = new URL(x.url);
        if (
          url.origin !== "https://github.com" ||
          !/^\/Philipp284868\/Leitstellen-Verbund\/(?:releases\/tag\/[^/]+|discussions\/\d+)$/.test(
            url.pathname,
          ) ||
          url.username ||
          url.password
        )
          return [];
      } catch {
        return [];
      }
      return [
        {
          title: x.title.slice(0, 160),
          summary: x.summary.slice(0, 2000),
          url: x.url,
          kind: x.kind as ProjectNews["kind"],
          publishedAt: x.publishedAt,
        },
      ];
    })
    .slice(0, 5);
}
