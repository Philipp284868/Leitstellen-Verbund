import { spawn } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NETWORK_KEYS, installationLocation } from "./configuration.mjs";
import { prepareInstallation } from "./installation.mjs";
import { acquireLock } from "./geodata/download-package.mjs";
const script = fileURLToPath(import.meta.url);
export function prepareGermanyConfiguration(options = {}) {
  return prepareInstallation({
    programRoot: resolve(dirname(script), ".."),
    ...options,
  });
}
async function runNode(args, { cwd, env }) {
  await new Promise((done, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
    });
    let cancelled = false;
    const stop = () => {
      cancelled = true;
      child.kill("SIGTERM");
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    const cleanup = () => {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    };
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      cleanup();
      if (cancelled)
        reject(Error(`Deutschland-Setup wurde abgebrochen: ${args.join(" ")}`));
      else if (code === 0) done();
      else
        reject(
          Error(
            `Deutschland-Setup-Schritt fehlgeschlagen (${signal || code}): ${args.join(" ")}`,
          ),
        );
    });
  });
}

/** Injectable execution/download functions permit real filesystem tests without multi-GB downloads. */
export async function installGermany({
  programRoot = resolve(dirname(script), ".."),
  environment = process.env,
  execute = runNode,
  download,
  onProgress = console.log,
  preferLegacy = false,
  recovery,
} = {}) {
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw Error("AMP muss Node.js 24 verwenden.");
  const lockDirectory = installationLocation(programRoot);
  mkdirSync(lockDirectory, { recursive: true, mode: 0o700 });
  const unlock = await acquireLock(resolve(lockDirectory, "setup.lock"));
  try {
    const config = prepareGermanyConfiguration({
      programRoot,
      environment,
      preferLegacy,
      recovery,
    });
    const context = { cwd: config.programRoot, env: config.environment };
    onProgress(
      `Deutschland-Konfiguration ${config.created ? "angelegt" : "erhalten"}: ${config.configFile}`,
    );
    onProgress(`Spieldaten: ${config.dataDir}; Geodaten: ${config.geodataDir}`);
    for (const key of NETWORK_KEYS)
      onProgress(
        `${key}: ${config.settings[key]} (Quelle: ${config.sources[key]})`,
      );
    mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    await execute(["scripts/amp-setup.mjs"], context);
    const installGeodata =
      download ||
      (
        await import(
          pathToFileURL(
            resolve(config.programRoot, "scripts/geodata/download-package.mjs"),
          ).href
        )
      ).installGeodata;
    await installGeodata({
      target: config.geodataDir,
      programRoot: config.programRoot,
      onProgress,
    });
    if (!config.environment.GRAPHHOPPER_URL)
      await execute(["scripts/geodata/pipeline.mjs", "tools"], context);
    else
      onProgress(
        "Separater Router konfiguriert; dessen passende Importkennung wird vor Spielbereitschaft geprüft.",
      );
    onProgress(
      "Deutschland-Installation abgeschlossen. AMP App Name: scripts/start-germany.mjs. Konfiguration und Installationszuordnung sind gesichert; Spielstände bleiben erhalten.",
    );
    if (config.needsPublicUrl)
      onProgress(
        "Vor dem Start PUBLIC_URL in .env auf die tatsächliche Browseradresse setzen und PORT mit dem zugewiesenen AMP-Anwendungsport abgleichen. Eine Serveradresse kann nicht automatisch ermittelt werden.",
      );
    return config;
  } finally {
    await unlock();
  }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === script) {
  try {
    const args = process.argv.slice(2),
      options = {};
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--prefer-legacy") options.preferLegacy = true;
      else if (arg === "--confirm-recovery")
        (options.recovery ||= {}).confirm = true;
      else if (arg === "--recover-data" || arg === "--recover-geodata") {
        const value = args[++i];
        if (!value || value.startsWith("--")) throw Error(`Wert fehlt: ${arg}`);
        (options.recovery ||= {})[arg === "--recover-data" ? "data" : "geo"] =
          value;
      } else throw Error(`Unbekannte Setup-Option: ${arg}`);
    }
    await installGermany(options);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
