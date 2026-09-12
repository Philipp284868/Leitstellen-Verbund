import { build } from "esbuild";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const temp = await mkdtemp(resolve(tmpdir(), "lv-economy-audit-"));
const file = resolve(temp, "report.mjs");
await build({
  entryPoints: ["src/server/economy-report.ts"],
  outfile: file,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
});
const { economyPriceReport, priceMarkdown } = await import(
  pathToFileURL(file).href
);
const report = economyPriceReport();
if (process.argv.includes("--write")) {
  await writeFile(
    "docs/EURO-PREISE.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await writeFile("docs/EURO-PREISE.md", priceMarkdown());
}
console.log(
  JSON.stringify(
    {
      currency: report.currency,
      unit: report.unit,
      prices: report.prices.length,
      missions: report.missions.length,
      conversion: report.conversion,
      scenarios: report.scenarios,
    },
    null,
    2,
  ),
);
