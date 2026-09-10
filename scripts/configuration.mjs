import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { isIP } from "node:net";
import { parseEnv } from "node:util";

export const NETWORK_KEYS = [
  "HOST",
  "PORT",
  "PUBLIC_URL",
  "ALLOW_HTTP",
  "TRUSTED_PROXIES",
];
export const PATH_KEYS = ["DATA_DIR", "GEODATA_DIR"];
export function inside(parent, child) {
  const path = relative(parent, child);
  return (
    !path || !(path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path))
  );
}
export const overlaps = (a, b) => inside(a, b) || inside(b, a);
export function present(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}
export function canonical(path) {
  if (present(path)) return realpathSync(path);
  return resolve(canonical(dirname(path)), basename(path));
}
export function regularFile(file) {
  const entry = present(file);
  if (entry && (!entry.isFile() || entry.isSymbolicLink()))
    throw Error(`Reguläre Konfigurationsdatei erforderlich: ${file}`);
  return entry;
}
export function readConfiguration(file) {
  return regularFile(file) ? parseEnv(readFileSync(file, "utf8")) : {};
}
export function installationLocation(programRoot) {
  const root = realpathSync(programRoot);
  const key = createHash("sha256").update(root).digest("hex").slice(0, 16);
  return resolve(root, "../.leitstellen-instances", `${basename(root)}-${key}`);
}
export function readIdentity(programRoot) {
  const directory = installationLocation(programRoot),
    file = resolve(directory, "installation.json");
  if (!regularFile(file)) return undefined;
  if (realpathSync(directory) !== directory)
    throw Error(`Installationszuordnung ist umgeleitet: ${directory}`);
  if (
    process.platform !== "win32" &&
    (statSync(directory).mode & 0o077 || statSync(file).mode & 0o077)
  )
    throw Error(
      `Rechtefehler: Installationszuordnung benötigt Verzeichnisrechte 700 und Dateirechte 600: ${directory}`,
    );
  const value = JSON.parse(readFileSync(file, "utf8"));
  if (
    value.schema !== 1 ||
    value.programRoot !== realpathSync(programRoot) ||
    value.world !== "germany-1" ||
    !/^env-valid-[a-f0-9]{64}\.bak$/.test(value.backup || "") ||
    !/^[a-f0-9]{64}$/.test(value.configHash || "") ||
    !/^[a-f0-9-]{36}$/.test(value.id) ||
    !PATH_KEYS.every((k) => typeof value.settings?.[k] === "string")
  )
    throw Error(`Ungültige oder fremde Installationszuordnung: ${file}`);
  return value;
}
export function validatePaths(programRoot, settings) {
  const paths = {};
  for (const key of PATH_KEYS) {
    const value = settings[key];
    if (!value || /^(AUTO|HIER_PFAD|<.*>)$/i.test(value))
      throw Error(
        `${key} fehlt oder ist ein Platzhalter. Setup: node scripts/install-germany.mjs`,
      );
    const path = canonical(resolve(programRoot, value));
    if (existsSync(path) && !statSync(path).isDirectory())
      throw Error(`${key} ist kein Verzeichnis: ${path}`);
    if (overlaps(programRoot, path))
      throw Error(
        `${key} muss außerhalb des Programmverzeichnisses liegen und darf es nicht enthalten.`,
      );
    paths[key] = path;
  }
  if (overlaps(paths.DATA_DIR, paths.GEODATA_DIR))
    throw Error("Spieldaten und Geodaten benötigen getrennte Verzeichnisse.");
  return paths;
}
export function validateNetwork(settings) {
  for (const [key, value] of Object.entries(settings))
    if (typeof value !== "string" || /[\r\n\0]/.test(value))
      throw Error(
        `Konfigurationsfehler ${key}: keine Zeilenumbrüche oder Nullzeichen erlaubt.`,
      );
  if (!isIP(settings.HOST))
    throw Error(
      "HOST muss eine konkrete Bind-IP sein (z. B. 127.0.0.1 oder 0.0.0.0).",
    );
  const port = Number(settings.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT muss zwischen 1 und 65535 liegen.");
  let url;
  try {
    url = new URL(settings.PUBLIC_URL);
  } catch {
    throw Error("PUBLIC_URL benötigt eine vollständige HTTP(S)-Adresse.");
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
  if (!["true", "false"].includes(settings.ALLOW_HTTP))
    throw Error("ALLOW_HTTP muss true oder false sein.");
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    settings.ALLOW_HTTP !== "true"
  )
    throw Error(
      "PUBLIC_URL benötigt HTTPS. Eine HTTP-Ausnahme wird nicht automatisch aktiviert.",
    );
  if (
    settings.TRUSTED_PROXIES.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .some((ip) => !isIP(ip))
  )
    throw Error(
      "TRUSTED_PROXIES erlaubt nur exakte IP-Adressen des unmittelbaren Proxys, keine Netze oder Platzhalter.",
    );
  if (settings.GRAPHHOPPER_URL) {
    const router = new URL(settings.GRAPHHOPPER_URL);
    if (
      !["http:", "https:"].includes(router.protocol) ||
      router.username ||
      router.password ||
      router.search ||
      router.hash ||
      router.pathname !== "/"
    )
      throw Error(
        "GRAPHHOPPER_URL muss eine HTTP(S)-Adresse ohne Zugangsdaten oder Unterpfad sein.",
      );
  }
}
/** Pure reader used by setup, launcher, direct server/CLI and diagnosis. No cwd dependence, mkdir, dotenv loading or process.env mutation. */
export function resolveConfiguration({
  programRoot,
  environment = process.env,
  requirePaths = true,
  preferLegacy = false,
} = {}) {
  programRoot = realpathSync(programRoot);
  const file = resolve(programRoot, ".env"),
    legacyFile = resolve(programRoot, ".env.germany");
  const current = readConfiguration(file),
    legacy = readConfiguration(legacyFile),
    identity = readIdentity(programRoot);
  const conflicts = Object.keys(legacy).filter(
    (key) => current[key] !== undefined && current[key] !== legacy[key],
  );
  if (conflicts.length && !preferLegacy)
    throw Error(
      `Konfigurationskonflikt zwischen .env und .env.germany: ${conflicts.join(", ")}. Beide Dateien bleiben erhalten. Werte abgleichen oder nach Prüfung ausdrücklich mit node scripts/install-germany.mjs --prefer-legacy übernehmen (Sicherung beider Dateien).`,
    );
  const saved = { ...current, ...legacy };
  const settings = {
    HOST: "127.0.0.1",
    PORT: "7777",
    ALLOW_HTTP: "false",
    TRUSTED_PROXIES: "",
    ...saved,
  };
  const sources = Object.fromEntries(
    Object.keys(settings).map((k) => [
      k,
      k in legacy ? ".env.germany" : k in current ? ".env" : "Standard",
    ]),
  );
  for (const key of PATH_KEYS) {
    const override = environment[key] || environment[`GERMANY_${key}`];
    if (
      environment[key] &&
      environment[`GERMANY_${key}`] &&
      canonical(resolve(programRoot, environment[key])) !==
        canonical(resolve(programRoot, environment[`GERMANY_${key}`]))
    )
      throw Error(
        `Konfigurationskonflikt ${key} / GERMANY_${key} in AMP-Umgebung.`,
      );
    const bound = identity?.settings[key];
    if (
      bound &&
      saved[key] &&
      canonical(resolve(programRoot, saved[key])) !==
        canonical(resolve(programRoot, bound))
    )
      throw Error(
        `Datenpfadkonflikt ${key}: .env weicht von der geschützten Installationszuordnung ab. Keine automatische Datenverschiebung.`,
      );
    const known = bound || saved[key];
    if (
      known &&
      override &&
      canonical(resolve(programRoot, override)) !==
        canonical(resolve(programRoot, known))
    )
      throw Error(
        `Datenpfadkonflikt ${key}: AMP-Umgebung weicht von der vorhandenen Installation ab. AMP-Pfadvariable entfernen oder auf den bisherigen Pfad setzen. Kein Datenreset.`,
      );
    if (!settings[key] && bound) {
      settings[key] = bound;
      sources[key] = "Installationszuordnung";
    }
    if (!settings[key] && override) {
      settings[key] = override;
      sources[key] = "AMP-Umgebung";
    }
  }
  // Recover saved network values only when the editable file has disappeared.
  if (identity)
    for (const [key, value] of Object.entries(identity.settings)) {
      if (!PATH_KEYS.includes(key) && saved[key] === undefined) {
        settings[key] = value;
        sources[key] = "Installationszuordnung";
      }
    }
  for (const key of [...NETWORK_KEYS, "GRAPHHOPPER_URL"])
    if (environment[key] !== undefined) {
      settings[key] = environment[key];
      sources[key] = "AMP-Umgebung";
    }
  if (!settings.PUBLIC_URL) {
    settings.PUBLIC_URL = `http://127.0.0.1:${settings.PORT}`;
    sources.PUBLIC_URL = "lokaler Standard";
  }
  validateNetwork(settings);
  if (requirePaths || PATH_KEYS.every((k) => settings[k]))
    Object.assign(settings, validatePaths(programRoot, settings));
  return {
    programRoot,
    configFile: file,
    legacyFile,
    current,
    legacy,
    identity,
    settings,
    sources,
    environment: { ...environment, ...settings },
  };
}
