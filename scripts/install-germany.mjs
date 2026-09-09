import { spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { parseEnv } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const script = fileURLToPath(import.meta.url);
const NETWORK_KEYS = [
  "HOST",
  "PORT",
  "PUBLIC_URL",
  "TRUSTED_PROXIES",
  "ALLOW_HTTP",
];
function inside(parent, child) {
  const value = relative(parent, child);
  return (
    !value ||
    !(value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value))
  );
}
function overlaps(left, right) {
  return inside(left, right) || inside(right, left);
}
function present(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
function canonical(path) {
  if (present(path)) return realpathSync(path);
  const parent = dirname(path);
  if (parent === path) throw Error("Datenpfad kann nicht aufgelöst werden.");
  return resolve(canonical(parent), relative(parent, path));
}
function directory(path) {
  if (existsSync(path) && !statSync(path).isDirectory())
    throw Error(`Datenpfad ist kein Verzeichnis: ${path}`);
}
function readConfiguration(file) {
  if (!present(file)) return {};
  if (!lstatSync(file).isFile())
    throw Error(`${file} muss eine reguläre Konfigurationsdatei sein.`);
  return parseEnv(readFileSync(file, "utf8"));
}
function dotenv(value) {
  if (/[\r\n\0]/.test(value))
    throw Error("Konfigurationswerte dürfen keine Zeilenumbrüche enthalten.");
  // Node's dotenv parser preserves backslashes and does not interpolate values.
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  throw Error(
    "Konfigurationswert enthält nicht unterstützte Anführungszeichen.",
  );
}
function networkConfiguration(settings) {
  const port = Number(settings.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT muss zwischen 1 und 65535 liegen.");
  if (settings.PUBLIC_URL) {
    let url;
    try {
      url = new URL(settings.PUBLIC_URL);
    } catch {
      throw Error("PUBLIC_URL muss eine vollständige HTTP(S)-Adresse sein.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw Error("PUBLIC_URL muss eine HTTP(S)-Adresse ohne Unterpfad sein.");
    if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      settings.ALLOW_HTTP !== "true"
    )
      throw Error(
        "PUBLIC_URL benötigt HTTPS. Eine bestehende ausdrückliche ALLOW_HTTP-Testausnahme wird erhalten, aber nicht automatisch aktiviert.",
      );
  }
}

/** The explicit Germany installer creates its own configuration, never rewrites .env. */
export function prepareGermanyConfiguration({
  programRoot = resolve(dirname(script), ".."),
  environment = process.env,
} = {}) {
  programRoot = realpathSync(programRoot);
  const configFile = resolve(programRoot, ".env.germany");
  const existing = present(configFile);
  const legacy = readConfiguration(resolve(programRoot, ".env"));
  let settings;
  if (existing) settings = readConfiguration(configFile);
  else {
    settings = {
      HOST: "0.0.0.0",
      PORT: "7777",
      TRUSTED_PROXIES: "",
      ALLOW_HTTP: "false",
    };
    for (const key of NETWORK_KEYS) {
      const value = environment[key] ?? legacy[key];
      if (value !== undefined) settings[key] = value;
    }
    settings.PUBLIC_URL ||= `http://127.0.0.1:${settings.PORT}`;
    settings.DATA_DIR =
      environment.GERMANY_DATA_DIR ||
      resolve(programRoot, "../leitstellen-germany-data");
    settings.GEODATA_DIR =
      environment.GERMANY_GEODATA_DIR ||
      resolve(programRoot, "../leitstellen-germany-geodata");
  }
  if (!settings.DATA_DIR || !settings.GEODATA_DIR)
    throw Error(
      ".env.germany benötigt DATA_DIR und GEODATA_DIR. Vorhandene Konfiguration wurde nicht verändert.",
    );
  const dataDir = canonical(resolve(programRoot, settings.DATA_DIR));
  const geodataDir = canonical(resolve(programRoot, settings.GEODATA_DIR));
  directory(dataDir);
  directory(geodataDir);
  if (overlaps(programRoot, dataDir) || overlaps(programRoot, geodataDir))
    throw Error(
      "Deutschland-Spiel- und Geodaten müssen außerhalb des Programmverzeichnisses liegen und dürfen es nicht enthalten.",
    );
  if (overlaps(dataDir, geodataDir))
    throw Error("Spieldaten und Geodaten benötigen getrennte Verzeichnisse.");
  if (!existing) {
    for (const previous of [legacy.DATA_DIR, environment.DATA_DIR]) {
      if (!previous) continue;
      const previousDir = canonical(resolve(programRoot, previous));
      if (
        existsSync(previousDir) &&
        (!statSync(previousDir).isDirectory() ||
          readdirSync(previousDir).length) &&
        (overlaps(previousDir, dataDir) || overlaps(previousDir, geodataDir))
      )
        throw Error(
          "Deutschland darf vorhandene Spieldaten weder verwenden noch überlagern. Eigenes GERMANY_DATA_DIR und GERMANY_GEODATA_DIR wählen.",
        );
    }
    if (existsSync(dataDir) && readdirSync(dataDir).length)
      throw Error(
        "Der neue Deutschland-Spielordner ist nicht leer. Vorhandene Daten werden nicht übernommen oder gelöscht; einen neuen GERMANY_DATA_DIR wählen.",
      );
  }
  const effective = { ...settings };
  for (const key of NETWORK_KEYS)
    if (environment[key] !== undefined) effective[key] = environment[key];
  networkConfiguration(effective);
  if (!existing) {
    settings.DATA_DIR = dataDir;
    settings.GEODATA_DIR = geodataDir;
    const lines = [
      "# Automatisch angelegte Deutschland-Konfiguration. Bestehende .env bleibt erhalten.",
      "# PORT muss dem AMP-Anwendungsport entsprechen; PUBLIC_URL ist die Browseradresse.",
      ...NETWORK_KEYS.filter((key) => settings[key] !== undefined).map(
        (key) => `${key}=${dotenv(settings[key])}`,
      ),
      `DATA_DIR=${dotenv(dataDir)}`,
      `GEODATA_DIR=${dotenv(geodataDir)}`,
      "# Diese beiden Ordner außerhalb der App dauerhaft einbinden und separat sichern.",
      "",
    ];
    try {
      writeFileSync(configFile, lines.join("\n"), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code === "EEXIST")
        return prepareGermanyConfiguration({ programRoot, environment });
      throw error;
    }
  }
  const childEnvironment = {
    ...environment,
    ...settings,
    ...Object.fromEntries(
      NETWORK_KEYS.filter((key) => environment[key] !== undefined).map(
        (key) => [key, environment[key]],
      ),
    ),
    DATA_DIR: dataDir,
    GEODATA_DIR: geodataDir,
  };
  // A routing URL from the legacy instance must not attach the new world to it.
  if (!settings.GRAPHHOPPER_URL) delete childEnvironment.GRAPHHOPPER_URL;
  return {
    programRoot,
    configFile,
    created: !existing,
    dataDir,
    geodataDir,
    needsPublicUrl:
      !effective.PUBLIC_URL ||
      ["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(effective.PUBLIC_URL).hostname,
      ),
    environment: childEnvironment,
  };
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
} = {}) {
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw Error("AMP muss Node.js 24 verwenden.");
  const config = prepareGermanyConfiguration({ programRoot, environment });
  const context = { cwd: config.programRoot, env: config.environment };
  onProgress(
    `Deutschland-Konfiguration ${config.created ? "angelegt" : "erhalten"}: ${config.configFile}`,
  );
  onProgress(`Spieldaten: ${config.dataDir}; Geodaten: ${config.geodataDir}`);
  // Creating only an empty, validated game directory never opens or migrates a save.
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
  await execute(["scripts/geodata/pipeline.mjs", "tools"], context);
  onProgress(
    "Deutschland-Installation abgeschlossen. AMP App Name: scripts/start-germany.mjs. Bestehende .env und alte Spielstände wurden nicht verändert.",
  );
  if (config.needsPublicUrl)
    onProgress(
      "Vor dem Start PUBLIC_URL in .env.germany auf die tatsächliche Browseradresse setzen und PORT mit dem zugewiesenen AMP-Anwendungsport abgleichen. Eine Serveradresse kann nicht automatisch ermittelt werden.",
    );
  return config;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === script) {
  try {
    await installGermany();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
