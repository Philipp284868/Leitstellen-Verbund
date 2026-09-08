import { existsSync, readFileSync, appendFileSync } from "node:fs";
let report = "## Tatsächliche Testausführung\n\n";
for (const name of ["ci", "quick", "browser"]) {
  const path = `.tools/test-runs/${name}.json`;
  if (!existsSync(path)) continue;
  const data = JSON.parse(readFileSync(path, "utf8"));
  report +=
    name === "browser"
      ? `- Browser: ${data.stats.expected} bestanden, ${data.stats.unexpected} Fehler, ${data.stats.skipped} übersprungen; ${(data.stats.duration / 1000).toFixed(1)} s.\n`
      : `- ${name}: ${(data.durationMs / 1000).toFixed(1)} s; ${data.results.every((r) => r.exitCode === 0) ? "erfolgreich" : "fehlgeschlagen"}.\n`;
}
report +=
  "\nKalte Installation und Build erfolgen einmal. Browserjobs verwenden exakt dieses Commit-Artefakt; Datenbanken, Ports und Konten sind pro Testserver isoliert.\n";
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
