import { it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
// @ts-expect-error Node build tool
import { sourceGraph } from "../scripts/source-graph.mjs";

it("trennt Client und Server und erfasst gemeinsame Typen sowie dynamische Importe", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "lv-source-graph-"));
  try {
    for (const [name, source] of Object.entries({
      "client.ts":
        'import type { State } from "./shared"; export const load = () => import("./view");',
      "server.ts":
        'import type { State } from "./shared"; import "./database";',
      "shared.ts": "export type State = { count: number };",
      "view.ts": "export const label = 'Leitstelle';",
      "database.ts": "export const value = 1;",
    }))
      await writeFile(resolve(root, name), source);
    expect(sourceGraph(["client.ts"], root)).toEqual([
      "client.ts",
      "shared.ts",
      "view.ts",
    ]);
    expect(sourceGraph(["server.ts"], root)).toEqual([
      "database.ts",
      "server.ts",
      "shared.ts",
    ]);
    await writeFile(resolve(root, "view.ts"), 'import "./missing";');
    expect(() => sourceGraph(["client.ts"], root)).toThrow("Unaufgelöster");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
