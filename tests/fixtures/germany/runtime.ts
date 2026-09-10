import { fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createGermanyPackage } from "./package";

/** One bounded read-only package and provider-contract process per test worker.
 * Every game still owns its own SQLite directory, sessions, timers and port. */
export async function createGermanyRuntime() {
  const dir = await mkdtemp(resolve(tmpdir(), "lv-germany-fixture-"));
  createGermanyPackage(dir);
  const child = fork(resolve("tests/helpers/germany-router.mjs"), {
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    env: { ...process.env, LV_FIXTURE_UNIQUE_EDGES: "1" },
  });
  let stderr = "";
  child.stderr!.on("data", (b) => {
    stderr = (stderr + String(b)).slice(-8000);
  });
  const routerUrl = await new Promise<string>((done, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("Routing-Fixture nicht bereit: " + stderr));
    }, 10000);
    child.once("message", (m: { origin: string }) => {
      clearTimeout(timer);
      done(m.origin);
    });
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(Error(`Routing-Fixture beendet (${code}): ${stderr}`));
    });
  });
  return {
    geodataDir: dir,
    routerUrl,
    async close() {
      if (child.exitCode === null && child.signalCode === null)
        await new Promise<void>((done, reject) => {
          const timer = setTimeout(() => {
            child.kill();
            reject(Error("Routing-Fixture beendet nicht sauber."));
          }, 10000);
          child.once("exit", (code) => {
            clearTimeout(timer);
            if (code === 0) done();
            else reject(Error(`Routing-Fixture: ${code}`));
          });
          child.send("stop");
        });
      await rm(dir, { recursive: true, force: true });
    },
  };
}
