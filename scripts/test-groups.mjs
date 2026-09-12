import ts from "typescript";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

// Fail-safe classification follows runtime imports, including fixture helpers.
// New database/network/process tests automatically enter integration. Every
// discovered file belongs to exactly one group; the full suite uses the union.
export function testGroups(root = resolve(".")) {
  const files = readdirSync(resolve(root, "tests"), { recursive: true })
    .filter((f) => f.endsWith(".test.ts"))
    .map((f) => "tests/" + f.replaceAll("\\", "/"))
    .sort();
  const imports = new Map();
  function dependencies(file) {
    if (imports.has(file)) return imports.get(file);
    const source = readFileSync(file, "utf8"),
      result = [];
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        if (
          clause?.isTypeOnly ||
          (!clause?.name &&
            clause?.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.every((e) => e.isTypeOnly))
        )
          return;
        result.push(node.moduleSpecifier.text);
      } else if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        !node.isTypeOnly
      )
        result.push(node.moduleSpecifier.text);
      else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        ts.isStringLiteral(node.arguments[0])
      )
        result.push(node.arguments[0].text);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    // Runtime-generated imports of built binaries are intentionally integration.
    if (/(?:dist[\/\\])/.test(source)) result.push("<compiled-server>");
    imports.set(file, result);
    return result;
  }
  function integration(file, seen = new Set()) {
    if (seen.has(file)) return false;
    seen.add(file);
    if (
      file.startsWith(resolve(root, "src/server") + "/") ||
      file.startsWith(resolve(root, "src/server") + "\\")
    )
      return true;
    return dependencies(file).some((specifier) => {
      if (
        /^(?:node:)?(?:sqlite|http|https|net|child_process)$/.test(specifier) ||
        ["<compiled-server>", "socket.io", "esbuild"].includes(specifier)
      )
        return true;
      if (!specifier.startsWith(".")) return false;
      const path = resolve(dirname(file), specifier);
      const target = [
        path,
        ...[".ts", ".tsx", ".mjs", ".js"].map((ext) => path + ext),
      ].find((p) => existsSync(p) && /\.(?:ts|tsx|mjs|js)$/.test(p));
      return target ? integration(target, seen) : false;
    });
  }
  const integrations = files.filter((file) => integration(resolve(root, file)));
  return {
    all: files,
    unit: files.filter((f) => !integrations.includes(f)),
    integration: integrations,
  };
}
