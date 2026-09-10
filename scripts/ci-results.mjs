import { relative, resolve } from "node:path";
export function vitestResults(report, root = resolve(".")) {
  const executed = [],
    tests = [];
  for (const file of report.testResults ?? []) {
    if (!file.assertionResults?.length)
      throw Error("Leere Testdatei: " + file.name);
    executed.push(relative(root, file.name).replaceAll("\\", "/"));
    for (const test of file.assertionResults)
      tests.push({
        file: executed.at(-1),
        title: test.fullName,
        status: test.status,
        durationMs: test.duration ?? 0,
      });
  }
  return {
    executed,
    tests,
    passed: report.numPassedTests || 0,
    failed: report.numFailedTests || 0,
    skipped: report.numPendingTests || 0,
    flaky: 0,
  };
}
export function browserResults(report, engine) {
  const executed = new Set(),
    tests = [];
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      const file = "tests/e2e/" + spec.file.replaceAll("\\", "/");
      for (const test of spec.tests ?? []) {
        if (test.projectName !== engine)
          throw Error("Unerwartete Browserengine.");
        executed.add(file);
        tests.push({
          id: spec.id,
          file,
          title: spec.title,
          status: test.status,
          durationMs: test.results.reduce((n, r) => n + r.duration, 0),
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of report.suites ?? []) visit(suite);
  if (new Set(tests.map((t) => t.id)).size !== tests.length)
    throw Error("Doppelte Browsertests.");
  return {
    executed: [...executed],
    tests,
    passed: report.stats?.expected || 0,
    failed: report.stats?.unexpected || 0,
    skipped: report.stats?.skipped || 0,
    flaky: report.stats?.flaky || 0,
  };
}
