import {
  readFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { gzipSync } from "node:zlib";
// Fixed-library exceptions have independent limits; never raise all chunks to
// hide a new accidental dependency. Sizes are deterministic, unlike CPU time.
const limits = {
  maplibre: 1050000,
  worker: 500000,
  vendor: 430000,
  application: 280000,
};
const results = [];
for (const dir of ["dist/client/assets", "dist/germany/client/assets"]) {
  let total = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const group = file.startsWith("maplibre-gl-worker-")
      ? "worker"
      : file.startsWith("maplibre-")
        ? "maplibre"
        : file.startsWith("vendor-")
          ? "vendor"
          : "application";
    const bytes = statSync(`${dir}/${file}`).size;
    total += bytes;
    if (bytes > limits[group])
      throw Error(
        `${file}: ${bytes} Bytes überschreiten ${limits[group]} (${group}). Ursache prüfen; Budgetänderung begründen.`,
      );
    results.push({
      file: `${dir}/${file}`,
      bytes,
      gzip: gzipSync(readFileSync(`${dir}/${file}`)).byteLength,
      group,
    });
  }
  if (total > (dir.includes("germany") ? 2500000 : 1100000))
    throw Error(`Gesamt-JavaScript-Budget überschritten: ${dir}`);
}
mkdirSync(".tools/test-runs", { recursive: true });
writeFileSync(
  ".tools/test-runs/bundles.json",
  JSON.stringify({ limits, results }, null, 2),
);
console.log("Bundlebudgets und separate Karten-/Workerbudgets eingehalten.");
