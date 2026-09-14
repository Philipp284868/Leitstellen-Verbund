import type { ReactNode } from "react";

/** Small local help grammar. All source text stays React text; no HTML parser,
 * image fetch, URL navigation or arbitrary repository path is supported. */
export function PlayerHelpArticle({
  text,
  pages,
  onPage,
}: {
  text: string;
  pages: readonly string[];
  onPage: (id: string) => void;
}) {
  const inline = (value: string): ReactNode =>
    value.split(/(\[\[[^\]]+\]\]|\*\*[^*]+\*\*)/).map((part, i) => {
      if (part.startsWith("[[") && part.endsWith("]]")) {
        const id = part.slice(2, -2);
        return pages.includes(id) ? (
          <button key={i} className="wiki-link" onClick={() => onPage(id)}>
            {id.replaceAll("-", " ")}
          </button>
        ) : (
          id
        );
      }
      return part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        part
      );
    });
  const blocks: ReactNode[] = [],
    lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^#{1,3} /.test(line)) {
      blocks.push(<h2 key={i}>{inline(line.replace(/^#{1,3} /, ""))}</h2>);
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      const key = i,
        rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i++]
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());
        if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
        rows.push(cells);
      }
      blocks.push(
        <div className="wiki-table" key={key}>
          <table>
            <thead>
              <tr>
                {rows[0]?.map((cell, c) => (
                  <th key={c} scope="col">
                    {inline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const list = line.match(/^(?:- |\d+\. )/);
    if (list) {
      const key = i,
        ordered = /^\d/.test(line),
        items: ReactNode[] = [];
      while (i < lines.length && (ordered ? /^\d+\. / : /^- /).test(lines[i])) {
        items.push(
          <li key={i}>{inline(lines[i++].replace(/^(?:- |\d+\. )/, ""))}</li>,
        );
      }
      blocks.push(
        ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>,
      );
      continue;
    }
    const key = i,
      paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3} |\||- |\d+\. )/.test(lines[i])
    )
      paragraph.push(lines[i++]);
    blocks.push(<p key={key}>{inline(paragraph.join("\n"))}</p>);
  }
  return <>{blocks}</>;
}
