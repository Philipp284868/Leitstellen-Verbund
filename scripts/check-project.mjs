import ts from "typescript";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { testGroups } from "./test-groups.mjs";

const errors = [];
const sources = ["src", "server"].flatMap((dir) =>
  readdirSync(dir, { recursive: true })
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => dir + "/" + f.replaceAll("\\", "/")),
);
const packages = new Set();
for (const file of sources) {
  const text = readFileSync(file, "utf8"),
    ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function visit(node) {
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
        file.startsWith("src/") &&
        (specifier.startsWith("node:") ||
          resolve(dirname(file), specifier).startsWith(
            resolve("server") + (process.platform === "win32" ? "\\" : "/"),
          ))
      )
        errors.push(
          `${file}: Server-/Node-Implementierung im Clientimport ${specifier}`,
        );
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
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
// Active documents only. Historical evidence may deliberately reference old paths.
for (const file of [
  "README.md",
  "CONTRIBUTING.md",
  "docs/PHASE-0.md",
  "docs/ENTWICKLUNG.md",
  "docs/MENUES.md",
  "docs/wiki/Entwicklung.md",
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
