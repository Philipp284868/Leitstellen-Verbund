import { useEffect, useState } from "react";
import fallback from "./project-news-fallback.json";
import { parseProjectNews, type ProjectNews } from "./project-news";
let request: Promise<ProjectNews[]> | undefined;
export function useProjectNews() {
  const [items, setItems] = useState(() => parseProjectNews(fallback));
  useEffect(() => {
    let active = true;
    request ??= fetch("/project-news.json", {
      signal: AbortSignal.timeout(2500),
    })
      .then((r) => {
        if (!r.ok) throw Error("Nachrichten nicht erreichbar");
        return r.json();
      })
      .then(parseProjectNews)
      .then((items) => (items.length ? items : parseProjectNews(fallback)))
      .catch(() => parseProjectNews(fallback));
    void request.then((next) => {
      if (active) setItems(next);
    });
    return () => {
      active = false;
    };
  }, []);
  return items;
}
export function ProjectNewsPanel() {
  const items = useProjectNews();
  return (
    <section className="menu-flow">
      <p>
        Veröffentlichte Projektinformationen. Eine Entwicklungsankündigung ist
        keine stabile Release-Freigabe.
      </p>
      {items.map((item) => (
        <article key={item.url}>
          <span className="eyebrow">
            {item.kind === "release"
              ? "Veröffentlichtes Release"
              : "Projektankündigung"}{" "}
            · {new Date(item.publishedAt).toLocaleDateString("de-DE")}
          </span>
          <h3>{item.title}</h3>
          <p>{item.summary}</p>
          <a href={item.url} target="_blank" rel="noreferrer">
            Original auf GitHub
          </a>
        </article>
      ))}
      <p>
        <a
          href="https://github.com/Philipp284868/Leitstellen-Verbund/releases"
          target="_blank"
          rel="noreferrer"
        >
          Änderungsnotizen und Releases
        </a>
      </p>
      <p>
        <a
          href="https://github.com/Philipp284868/Leitstellen-Verbund/issues/new/choose"
          target="_blank"
          rel="noreferrer"
        >
          Fehler melden
        </a>{" "}
        ·{" "}
        <a
          href="https://github.com/Philipp284868/Leitstellen-Verbund/discussions"
          target="_blank"
          rel="noreferrer"
        >
          Community
        </a>
      </p>
    </section>
  );
}
