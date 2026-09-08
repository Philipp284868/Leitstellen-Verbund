import { build } from "esbuild";
import { fork } from "node:child_process";
import { resolve } from "node:path";

// Production server and browser driver must not share an event loop. Otherwise
// simulation work is counted as delayed Playwright commands, not browser input.
export async function startOverviewLoadServer() {
  const fixturePath = resolve(`.tools/overview-fixture-${process.pid}.mjs`);
  await build({
    entryPoints: ["tests/rivermere-fixture.ts"],
    outfile: fixturePath,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    define: { __LV_WORLD__: JSON.stringify("rivermere-1") },
  });
  const child = fork(
    resolve("tests/helpers/rivermere-load-server.mjs"),
    [fixturePath, "overview"],
    { stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  let output = "";
  child.stderr?.on("data", (data) => {
    output += String(data);
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
