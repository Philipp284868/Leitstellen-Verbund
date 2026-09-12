export type Change = {
  id: string;
  version: string | null;
  date: string | null;
  title: string;
  body: string;
};
/** Only level-two headings delimit releases. Undated legacy entries remain undated. */
export function parseChangelog(markdown: string): Change[] {
  return markdown
    .split(/^## /m)
    .slice(1)
    .map((section, i) => {
      const newline = section.indexOf("\n"),
        title = (newline < 0 ? section : section.slice(0, newline)).trim();
      return {
        id: String(i),
        title,
        version: title.match(/^(\d+\.\d+\.\d+)\b/)?.[1] ?? null,
        date: title.match(/\b\d{2}\.\d{2}\.\d{4}\b/)?.[0] ?? null,
        body: newline < 0 ? "" : section.slice(newline + 1).trim(),
      };
    });
}
