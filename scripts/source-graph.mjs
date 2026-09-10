import ts from "typescript";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";

/** Local source closure, including literal dynamic imports and type-only shared
 * contracts. Package changes are covered separately by the locked toolchain. */
export function sourceGraph(entries, root = resolve(".")) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    // Non-code assets are terminal nodes but still participate in the hash.
    if (!/\.(?:[cm]?[jt]sx?|css)$/.test(file)) return;
    const source = readFileSync(file, "utf8");
    const dependencies = [];
    function walk(node) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier
      )
        dependencies.push(node.moduleSpecifier.text);
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        ts.isStringLiteral(node.arguments[0])
      )
        dependencies.push(node.arguments[0].text);
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "URL" &&
        node.arguments?.length === 2 &&
        ts.isStringLiteral(node.arguments[0]) &&
        !node.arguments[0].text.endsWith("/") &&
        node.arguments[1].getText() === "import.meta.url"
      )
        dependencies.push(node.arguments[0].text);
      ts.forEachChild(node, walk);
    }
    if (file.endsWith(".css")) {
      for (const match of source.matchAll(
        /@import\s+(?:url\(\s*)?["']([^"']+)["']/g,
      ))
        dependencies.push(match[1]);
      for (const match of source.matchAll(
        /url\(\s*["']?(\.[^\s"')]+)["']?\s*\)/g,
      ))
        dependencies.push(match[1]);
    } else
      walk(ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true));
    for (const specifier of dependencies) {
      if (!specifier.startsWith(".")) continue;
      const base = resolve(dirname(file), specifier.split("?")[0]);
      const target = [
        base,
        ...[
          ".ts",
          ".tsx",
          ".mjs",
          ".js",
          ".json",
          "/index.ts",
          "/index.tsx",
        ].map((ext) => base + ext),
      ].find((path) => existsSync(path) && statSync(path).isFile());
      if (!target)
        throw Error(
          `Unaufgelöster Quellimport ${relative(root, file)}: ${specifier}`,
        );
      visit(target);
    }
  };
  for (const entry of entries) visit(resolve(root, entry));
  return [...seen]
    .map((file) => relative(root, file).replaceAll("\\", "/"))
    .sort();
}
