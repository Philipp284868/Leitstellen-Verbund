import ts from "typescript";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { testGroups } from "./test-groups.mjs";

const errors = [];
const sources = ["src"].flatMap((dir) =>
  readdirSync(dir, { recursive: true })
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => dir + "/" + f.replaceAll("\\", "/")),
);
const packages = new Set();
for (const file of sources) {
  const text = readFileSync(file, "utf8"),
    ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const name = node.arguments[0].text;
      if (!name.startsWith(".") && !name.startsWith("node:"))
        packages.add(
          name.startsWith("@")
            ? name.split("/").slice(0, 2).join("/")
            : name.split("/")[0],
        );
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier?.text;
      if (!specifier) return;
      const clause = node.importClause;
      const typesOnly =
        node.isTypeOnly ||
        clause?.isTypeOnly ||
        (!clause?.name &&
          clause?.namedBindings &&
          ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.every((e) => e.isTypeOnly));
      if (
        !specifier.startsWith(".") &&
        !specifier.startsWith("node:") &&
        !typesOnly
      )
        packages.add(
          specifier.startsWith("@")
            ? specifier.split("/").slice(0, 2).join("/")
            : specifier.split("/")[0],
        );
      if (
        !typesOnly &&
        !file.startsWith("src/server/") &&
        (specifier.startsWith("node:") ||
          resolve(dirname(file), specifier).startsWith(
            resolve("src/server") + (process.platform === "win32" ? "\\" : "/"),
          ))
      )
        errors.push(
          `${file}: Server-/Node-Implementierung im Clientimport ${specifier}`,
        );
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (
    /\b__LV_WORLD__\b|["'][^"']*(?:world-choice|\/rivermere\/|MapTerrain|RegionScene)["']/.test(
      text,
    )
  )
    errors.push(`${file}: entfernter Welt-Einstieg wieder eingeführt`);
}
for (const retired of [
  "src/world-choice.ts",
  "src/Map.tsx",
  "src/MapTerrain.tsx",
  "src/RegionScene.tsx",
  "src/region.ts",
  "src/rivermere",
  "tests/legacy-build.ts",
  "tests/rivermere-fixture.ts",
]) {
  if (existsSync(retired))
    errors.push(`Entfernter Produkteinstieg wieder vorhanden: ${retired}`);
}
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
for (const dep of Object.keys(pkg.dependencies))
  if (!packages.has(dep))
    errors.push(
      `Produktabhängigkeit ohne Import: ${dep}; dynamischen Einstieg prüfen und dokumentieren.`,
    );
const groups = testGroups();
if (
  new Set([...groups.unit, ...groups.integration]).size !== groups.all.length ||
  groups.unit.some((f) => groups.integration.includes(f))
)
  errors.push("Unvollständige/überlappende Testgruppen");
const inventory = JSON.parse(
  readFileSync("docs/TESTMIGRATION.json", "utf8"),
).entries;
if (new Set(inventory.map((e) => e.old)).size !== inventory.length)
  errors.push("Doppelte Alt-Testzuordnung");
for (const entry of inventory) {
  if (!entry.requirements?.length || !entry.disposition || !entry.category)
    errors.push(`Unbegründete Testzuordnung: ${entry.old}`);
  for (const successor of [entry.replacement].flat().filter(Boolean)) {
    if (!existsSync(successor))
      errors.push(`Fehlender Testnachfolger: ${entry.old} -> ${successor}`);
  }
}
// Historical evidence uses immutable commit links; local links must stay valid.
for (const file of [
  "README.md",
  "CONTRIBUTING.md",
  ...readdirSync("docs", { recursive: true })
    .filter((f) => f.endsWith(".md"))
    .map((f) => "docs/" + f.replaceAll("\\", "/")),
]) {
  if (!existsSync(file)) {
    errors.push(`Aktive Anleitung fehlt: ${file}`);
    continue;
  }
  const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  for (const match of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const link = match[1].split("#")[0];
    if (!link || /^[a-z]+:|^\/\//i.test(link)) continue;
    if (!existsSync(resolve(dirname(file), decodeURIComponent(link))))
      errors.push(`${file}: verwaister lokaler Link ${link}`);
  }
  if (file.startsWith("docs/wiki/"))
    for (const match of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const page = match[1].split("|").at(-1).split("#")[0];
      if (page && !existsSync(resolve("docs/wiki", page + ".md")))
        errors.push(`${file}: verwaiste Wiki-Seite ${page}`);
    }
}
// Retired navigation has no dynamic registry or persisted selector references.
for (const file of readdirSync("src", { recursive: true }).filter((f) =>
  /\.(?:tsx|css)$/.test(f),
)) {
  if (
    /\b(?:mobile-tabs|bottom-toolbar|radio-bar|navrail)\b/.test(
      readFileSync(resolve("src", file), "utf8"),
    )
  )
    errors.push(`${file}: verworfene Navigation wieder eingeführt`);
}
try {
  execFileSync("git", ["diff", "--check"], { stdio: "pipe" });
} catch (error) {
  if (existsSync(".git"))
    errors.push(
      error.stdout?.toString() || "Whitespace-Prüfung fehlgeschlagen",
    );
}
if (errors.length) throw Error(errors.join("\n"));
console.log(
  `Projektstruktur: ${sources.length} Module, ${packages.size} importierte Pakete, ${groups.unit.length} Unit- und ${groups.integration.length} Integrationsdateien; aktive Links und Navigationsgrenzen geprüft.`,
);
