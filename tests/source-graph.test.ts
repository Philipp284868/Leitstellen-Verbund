import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
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
      "view.ts":
        "import './view.css'; export const worker = new URL('./worker.ts', import.meta.url);",
      "view.css":
        "@import './shared.css'; .map{background:url('./marker.png')}",
      "shared.css": ".title{color:white}",
      "worker.ts": "export const ready = true;",
      "marker.png": "opaque test asset",
      "database.ts": "export const value = 1;",
    }))
      await writeFile(resolve(root, name), source);
    expect(sourceGraph(["client.ts"], root)).toEqual([
      "client.ts",
      "marker.png",
      "shared.css",
      "shared.ts",
      "view.css",
      "view.ts",
      "worker.ts",
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
