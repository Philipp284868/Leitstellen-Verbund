/** Repairs a real partial JDK in an isolated fixture; existing tool archives are read-only inputs. */
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = resolve(
  process.env.GEODATA_DIR ||
    resolve(repo, "../leitstellen-deutschland-geodata"),
  "tools",
);
const windows = process.platform === "win32";
const archive = windows
  ? "OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip"
  : "OpenJDK21U-jdk_x64_linux_hotspot_21.0.12.1_1.tar.gz";
const fixture = await mkdtemp(resolve(tmpdir(), "lv-germany-jdk-repair-"));
const tools = resolve(fixture, "tools"),
  jdk = resolve(tools, "jdk-21.0.12.1+1");
async function digest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
try {
  await mkdir(resolve(jdk, "bin"), { recursive: true });
  const originalHashes = new Map();
  for (const name of [
    archive,
    "graphhopper-web-11.0.jar",
    "planetiler-0.10.2.jar",
  ]) {
    originalHashes.set(name, await digest(resolve(source, name)));
    try {
      await link(resolve(source, name), resolve(tools, name));
    } catch (error) {
      if (error.code !== "EXDEV") throw error;
      await copyFile(resolve(source, name), resolve(tools, name));
    }
  }
  // This is the exact state that the old bin/java existence heuristic accepted.
  const java = resolve(jdk, "bin", windows ? "java.exe" : "java");
  await writeFile(
    java,
    "interrupted extraction: JVM binary alone is not sufficient",
  );
  await assert.rejects(stat(resolve(jdk, "lib/modules")), { code: "ENOENT" });
  const preserved = new Map([
    ["maps.mbtiles", "existing map tiles remain unchanged"],
    ["index.sqlite", "existing geographic index remains unchanged"],
    ["manifest.json", "existing complete data manifest remains unchanged"],
    ["save.sqlite", "existing game save remains unchanged"],
  ]);
  for (const [name, content] of preserved)
    await writeFile(resolve(fixture, name), content);

  async function setupTools() {
    const child = spawn(
      process.execPath,
      [resolve(repo, "scripts/geodata/pipeline.mjs"), "tools"],
      {
        cwd: repo,
        env: { ...process.env, GEODATA_DIR: fixture },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        windowsHide: true,
      },
    );
    let output = "",
      timedOut = false;
    child.stdout.on("data", (chunk) => {
      output = (output + chunk).slice(-200000);
    });
    child.stderr.on("data", (chunk) => {
      output = (output + chunk).slice(-200000);
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      if (child.connected) child.send({ type: "shutdown" });
      else child.kill("SIGTERM");
    }, 120000);
    const code = await new Promise((done, fail) => {
      child.once("error", fail);
      child.once("close", done);
    }).finally(() => clearTimeout(timeout));
    assert.equal(timedOut, false, `Tool installation timed out:\n${output}`);
    assert.equal(code, 0, output);
    assert.match(output, /jdk-extract abgeschlossen/);
  }
  async function verifyJava() {
    assert.ok((await stat(resolve(jdk, "lib/modules"))).size > 1024 * 1024);
    const version = await promisify(execFile)(java, ["-version"], {
      windowsHide: true,
      timeout: 15000,
    });
    assert.match(version.stderr + version.stdout, /21\.0\.12/);
  }
  await setupTools();
  await verifyJava();
  // Even after an earlier successful setup, a partial tool tree must be repaired.
  await unlink(resolve(jdk, "lib/modules"));
  await assert.rejects(stat(resolve(jdk, "lib/modules")), { code: "ENOENT" });
  await setupTools();
  await verifyJava();
  for (const [name, content] of preserved)
    assert.equal(await readFile(resolve(fixture, name), "utf8"), content, name);
  for (const [name, hash] of originalHashes)
    assert.equal(
      await digest(resolve(source, name)),
      hash,
      `Original archive changed: ${name}`,
    );
  console.log(
    "Actual JDK archive: interrupted extraction and missing lib/modules repaired in two setups; Java 21 executes; map/index/manifest/save bytes and original tool archive hashes preserved.",
  );
} finally {
  const relativeFixture = relative(resolve(tmpdir()), fixture);
  if (
    !relativeFixture.startsWith("lv-germany-jdk-repair-") ||
    relativeFixture.includes(sep)
  )
    throw Error("Unsafe JDK fixture cleanup path");
  await rm(fixture, { recursive: true, force: true });
}
