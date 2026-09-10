import { relative, resolve } from "node:path";

export default async function* reporter(source) {
  const result = {
    executed: [],
    tests: [],
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
  };
  const files = new Set();
  for await (const { type, data } of source) {
    if (
      !["test:pass", "test:fail"].includes(type) ||
      data.details?.type === "suite"
    )
      continue;
    const file = data.file
      ? relative(resolve("."), data.file).replaceAll("\\", "/")
      : "";
    if (file) files.add(file);
    const status =
      data.skip || data.todo
        ? "skipped"
        : type === "test:pass"
          ? "passed"
          : "failed";
    result[status]++;
    result.tests.push({
      file,
      title: data.name,
      status,
      durationMs: data.details?.duration_ms ?? 0,
    });
  }
  result.executed = [...files];
  yield JSON.stringify(result, null, 2) + "\n";
}
