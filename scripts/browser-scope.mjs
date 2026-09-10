// Explicit engine capabilities, not runtime skips: CDP permission overrides
// exist only in Chromium. Shared clipboard fallback is tested in both engines.
export function forEngine(files, engine) {
  if (!["chromium", "firefox"].includes(engine))
    throw Error("Unbekannte Browserengine.");
  return files.filter((file) => {
    const capability = /\.(chromium|firefox)\.spec\.ts$/.exec(file)?.[1];
    return !capability || capability === engine;
  });
}
