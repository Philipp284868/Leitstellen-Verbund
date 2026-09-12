import { build } from "esbuild";
import { fork } from "node:child_process";
import { resolve } from "node:path";
// @ts-expect-error Node tooling shared with the normal build
import { cachedBuild, fingerprint } from "../../scripts/build/build-cache.mjs";
// @ts-expect-error Node tooling shared with the normal build
import { sourceGraph } from "../../scripts/build/source-graph.mjs";

// Production server and browser driver must not share an event loop. Otherwise
// simulation work is counted as delayed Playwright commands, not browser input.
export async function startOverviewLoadServer() {
  const fixturePath = resolve(".tools/browser-load-fixture/server.mjs");
  await cachedBuild({
    root: resolve("."),
    name: "browser-load-fixture",
    reuse: true,
    key: JSON.stringify({
      node: process.version,
      inputs: await fingerprint(resolve("."), [
        ...sourceGraph(["tests/helpers/map-load-server.ts"]),
        "pnpm-lock.yaml",
      ]),
    }),
    outputs: [".tools/browser-load-fixture/server.mjs"],
    run: () =>
      build({
        entryPoints: ["tests/helpers/map-load-server.ts"],
        outfile: fixturePath,
        bundle: true,
        platform: "node",
        format: "esm",
        packages: "external",
      }),
  });
  const child = fork(fixturePath, [], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let output = "";
  child.stderr?.on("data", (data) => {
    output = (output + String(data)).slice(-16000);
  });
  const ready = await new Promise<{
    origin: string;
    buildings: number;
    vehicles: number;
    incidents: number;
    activeTrips: number;
  }>((done, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("Lastserver startet nicht: " + output));
    }, 30000);
    child.once("message", (message) => {
      clearTimeout(timer);
      done(message as Awaited<typeof ready>);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(Error(`Lastserver beendet (${code}): ${output}`));
    });
  });
  return {
    ...ready,
    stop: () =>
      new Promise<void>((done, reject) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          reject(Error("Lastserver vorzeitig beendet: " + output));
          return;
        }
        const timer = setTimeout(() => {
          child.kill();
          reject(Error("Lastserver beendet nicht sauber."));
        }, 20000);
        child.once("exit", (code) => {
          clearTimeout(timer);
          if (code === 0) done();
          else reject(Error(`Lastserver beendet (${code}): ${output}`));
        });
        child.send("stop");
      }),
  };
}
