import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
export function requireChangeNotes(paths, exception = "") {
  if (!paths?.some((p) => /^(src\/|server\/|scripts\/|package\.json$)/.test(p)))
    return;
  if (paths.includes("CHANGELOG.md")) return;
  const maintenance = paths.every((p) =>
    /^(scripts\/|tests\/|docs\/|\.github\/)/.test(p),
  );
  if (
    maintenance &&
    paths.includes("docs/CHANGELOG-AUSNAHME.md") &&
    exception.trim().length >= 80
  )
    return;
  throw Error(
    "Änderungsnotizen fehlen: CHANGELOG.md für Produktänderungen pflegen. Reine Wartung darf mit geändertem docs/CHANGELOG-AUSNAHME.md und konkreter Begründung ausgenommen werden.",
  );
}
if (process.argv[1]?.endsWith("check-changelog.mjs")) {
  const plan = JSON.parse(readFileSync(".tools/ci/plan.json", "utf8"));
  if (plan.base) {
    const paths = execFileSync(
      "git",
      ["diff", "--name-only", plan.base, plan.head],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n");
    let exception = "";
    if (paths.includes("docs/CHANGELOG-AUSNAHME.md"))
      exception = readFileSync("docs/CHANGELOG-AUSNAHME.md", "utf8");
    requireChangeNotes(paths, exception);
  }
  console.log("Änderungsnotizen: Umfang geprüft.");
}
