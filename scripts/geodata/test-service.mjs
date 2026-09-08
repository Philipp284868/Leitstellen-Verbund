/** Starts and stops only its own prepared routing sidecar; requires free loopback port 8989. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const origin = "http://127.0.0.1:8989";
async function info() {
  try {
    const response = await fetch(`${origin}/info`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok ? await response.json() : { occupied: true };
  } catch {
    return undefined;
  }
}
for (const shutdownMode of ["message", "disconnect"]) {
  assert.equal(
    await info(),
    undefined,
    "Port 8989 is occupied; an existing service must not be stopped.",
  );
  const child = spawn(
    process.execPath,
    ["scripts/geodata/pipeline.mjs", "serve"],
    {
      cwd: repo,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    },
  );
  let output = "",
    exited = false,
    exitCode;
  child.stdout.on("data", (data) => {
    output = (output + data).slice(-200000);
  });
  child.stderr.on("data", (data) => {
    output = (output + data).slice(-200000);
  });
  child.once("error", (error) => {
    output += error.stack;
    exited = true;
  });
  child.once("exit", (code) => {
    exited = true;
    exitCode = code;
  });
  async function stop() {
    if (!exited && child.connected) {
      if (shutdownMode === "disconnect") child.disconnect();
      else child.send({ type: "shutdown" });
    }
    const deadline = Date.now() + 25000;
    while (!exited && Date.now() < deadline) await pause(100);
    assert.ok(exited, `Owned routing wrapper did not exit:\n${output}`);
  }
  try {
    const deadline = Date.now() + 120000;
    let response;
    while (!(response = await info())) {
      assert.ok(!exited, `Routing startup failed:\n${output}`);
      assert.ok(Date.now() < deadline, `Routing startup timed out:\n${output}`);
      await pause(250);
    }
    assert.ok(!exited, output);
    assert.match(response.version, /^11\./);
    assert.ok(response.profiles.some((profile) => profile.name === "car"));
    await stop();
    assert.equal(exitCode, 0, output);
    assert.equal(
      await info(),
      undefined,
      "Routing listener remained alive after IPC shutdown.",
    );
    const javaPid = Number(output.match(/Java-Prozess (\d+)/)?.[1]);
    assert.ok(javaPid > 0, "Owned Java shutdown PID must be reported.");
    assert.throws(
      () => process.kill(javaPid, 0),
      { code: "ESRCH" },
      "Java child remained orphaned after wrapper exit.",
    );
    console.log(
      `Local GraphHopper ${response.version}: startup, car profile, IPC ${shutdownMode}, closed listener and no Java orphan passed.`,
    );
  } finally {
    await stop();
  }
}
