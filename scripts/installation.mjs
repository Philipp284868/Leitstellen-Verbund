import { randomUUID } from "node:crypto";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statfsSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  installationLocation,
  PATH_KEYS,
  present,
  readIdentity,
  regularFile,
  resolveConfiguration,
  validatePaths,
  validateNetwork,
} from "./configuration.mjs";
import {
  atomicPrivate,
  digest,
  inspectGame,
  inspectGeodata,
  inspectInstallation,
  privateBackup,
} from "./installation-storage.mjs";

function dotenv(value) {
  if (/[\r\n\0]/.test(value))
    throw Error("Konfigurationswerte dürfen keine Zeilenumbrüche enthalten.");
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  throw Error(
    "Konfigurationswert enthält nicht unterstützte Anführungszeichen.",
  );
}
function serialize(settings) {
  return (
    "# Private Konfiguration. DATA_DIR und GEODATA_DIR werden vom Setup verwaltet.\n# PORT = AMP-Spielport; PUBLIC_URL = tatsächliche Browseradresse.\n" +
    Object.entries(settings)
      .map(([key, value]) => `${key}=${dotenv(value)}`)
      .join("\n") +
    "\n"
  );
}
/** Only bounded, documented old per-instance locations; never enumerates disks or other instance mappings. */
export function recoveryCandidates(programRoot) {
  const pairs = [
    ["../leitstellen-germany-data", "../leitstellen-germany-geodata"],
    ["../leitstellen-deutschland-data", "../leitstellen-deutschland-geodata"],
    ["../leitstellen-rivermere-data", "../leitstellen-germany-geodata"],
  ];
  return pairs
    .filter(([data]) => present(resolve(programRoot, data)))
    .map(([data, geo]) => {
      const paths = {
        DATA_DIR: resolve(programRoot, data),
        GEODATA_DIR: resolve(programRoot, geo),
      };
      try {
        validatePaths(programRoot, paths);
        const geodata = inspectGeodata(paths.GEODATA_DIR),
          game = inspectGame(paths.DATA_DIR, geodata.dataset);
        if (game.status !== "ready" || geodata.status !== "ready")
          throw Error("Unvollständiger Kandidat");
        return { ...paths, status: "valid", dataset: game.dataset };
      } catch (error) {
        return { ...paths, status: "blocked", reason: error.message };
      }
    });
}
export function prepareInstallation({
  programRoot,
  environment = process.env,
  preferLegacy = false,
  recovery,
} = {}) {
  let config = resolveConfiguration({
    programRoot,
    environment,
    requirePaths: false,
    preferLegacy,
  });
  const directory = installationLocation(config.programRoot);
  let settings = { ...config.settings };
  const identity = config.identity;
  const missingFile =
    !present(config.configFile) && !present(config.legacyFile);
  if (identity && missingFile) {
    const backup = resolve(directory, identity.backup);
    if (
      !identity.backup ||
      !regularFile(backup) ||
      digest(readFileSync(backup)) !== identity.configHash
    )
      throw Error(
        `Geschützte Konfigurationssicherung fehlt oder ist verändert: ${directory}`,
      );
  }
  if (recovery) {
    if (!recovery.confirm || !recovery.data || !recovery.geo)
      throw Error(
        "Wiederherstellung benötigt --recover-data, --recover-geodata und --confirm-recovery.",
      );
    if (identity)
      throw Error(
        "Bekannte Installation: Datenpfade nicht über Wiederherstellung verschieben. Vorhandene Zuordnung prüfen.",
      );
    settings = {
      ...settings,
      DATA_DIR: recovery.data,
      GEODATA_DIR: recovery.geo,
    };
    Object.assign(settings, validatePaths(config.programRoot, settings));
    const geo = inspectGeodata(settings.GEODATA_DIR),
      game = inspectGame(settings.DATA_DIR, geo.dataset);
    if (geo.status !== "ready" || game.status !== "ready")
      throw Error(
        "Wiederherstellung benötigt eine vollständige gültige Deutschland-Datenbank und das passende Geodatenpaket.",
      );
  } else if (!identity && !PATH_KEYS.every((k) => settings[k])) {
    const candidates = recoveryCandidates(config.programRoot);
    if (candidates.length)
      throw Error(
        `Wiederherstellung erforderlich. Kein neuer Spielstand angelegt. Gefundene Kandidaten:\n${candidates.map((c) => `${c.DATA_DIR} | ${c.GEODATA_DIR} | ${c.status === "valid" ? "geprüfter Deutschland-Bestand; explizite Zuordnung erforderlich" : c.reason}`).join("\n")}\nPrüfen: node scripts/diagnose.mjs. Nach Prüfung: node scripts/install-germany.mjs --recover-data "<geprüfter Spielpfad>" --recover-geodata "<passender Geopfad>" --confirm-recovery`,
      );
    if (present(config.legacyFile))
      throw Error(
        "Unvollständige .env.germany: bisherige DATA_DIR und GEODATA_DIR wieder zuordnen; keine Neuinstallation.",
      );
    settings.DATA_DIR ||= resolve(directory, "game");
    settings.GEODATA_DIR ||= resolve(directory, "geodata");
  }
  Object.assign(settings, validatePaths(config.programRoot, settings));
  config = {
    ...config,
    settings,
    environment: { ...environment, ...settings },
  };
  for (const path of [config.programRoot, settings.DATA_DIR]) {
    let parent = path;
    while (!existsSync(parent)) parent = resolve(parent, "..");
    try {
      accessSync(parent, constants.R_OK | constants.W_OK | constants.X_OK);
    } catch {
      throw Error(
        `Rechtefehler: AMP benötigt Lese-/Schreibzugriff auf ${parent}. Eigentümer und Volume-Rechte prüfen.`,
      );
    }
  }
  const inspection = inspectInstallation(config, { allowMissingGeo: true });
  if (
    !identity &&
    inspection.game.status === "ready" &&
    missingFile &&
    !recovery
  )
    throw Error(
      `Vorhandener Spielstand ohne Installationszuordnung: ${settings.DATA_DIR}. Mit --recover-data und --recover-geodata sowie --confirm-recovery ausdrücklich zuordnen.`,
    );
  // Missing geodata requires room for the compressed chunks and complete staged package.
  if (inspection.geodata.status === "missing") {
    let ancestor = resolve(settings.GEODATA_DIR, "..");
    while (!existsSync(ancestor)) ancestor = resolve(ancestor, "..");
    const space = statfsSync(ancestor);
    const catalogFile = resolve(
      config.programRoot,
      "scripts/geodata/download-manifest.json",
    );
    if (existsSync(catalogFile)) {
      const catalog = JSON.parse(readFileSync(catalogFile, "utf8"));
      const required =
        catalog.files.reduce((n, f) => n + f.bytes, 0) + 2 * 1024 ** 3;
      if (space.bavail * space.bsize < required)
        throw Error(
          `Speicherplatz reicht nicht: mindestens ${Math.ceil(required / 1024 ** 3)} GiB frei für Geodaten erforderlich.`,
        );
    }
  }
  const id = identity?.id || randomUUID();
  const storedSettings = {
    ...settings,
    ...config.current,
    ...config.legacy,
    DATA_DIR: settings.DATA_DIR,
    GEODATA_DIR: settings.GEODATA_DIR,
  };
  validateNetwork(storedSettings);
  // All data/config validation above precedes backup publication or any editable-file change.
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const file of [config.configFile, config.legacyFile])
    if (regularFile(file))
      privateBackup(
        directory,
        file === config.configFile ? "env-before" : "env-germany-before",
        readFileSync(file),
      );
  const migration = !!present(config.legacyFile);
  const changed =
    missingFile ||
    migration ||
    PATH_KEYS.some((k) => !config.current[k]) ||
    !!recovery;
  // Retain comments/custom settings and byte identity on ordinary repeat setup.
  // Network environment overrides are reported and applied, but do not rewrite an existing file.
  const bytes =
    missingFile && identity
      ? readFileSync(resolve(directory, identity.backup))
      : changed
        ? serialize(storedSettings)
        : readFileSync(config.configFile);
  const backup = privateBackup(directory, "env-valid", bytes);
  const record = {
    schema: 1,
    id,
    programRoot: config.programRoot,
    world: "germany-1",
    settings: storedSettings,
    configHash: digest(bytes),
    backup: backup.slice(directory.length + 1),
    dataset: inspection.geodata.dataset || identity?.dataset,
    databaseSeen:
      inspection.game.status === "ready" || !!identity?.databaseSeen,
  };
  // Publish the recovery mapping first; an interruption can resume from this record.
  atomicPrivate(
    resolve(directory, "installation.json"),
    JSON.stringify(record, null, 2) + "\n",
  );
  if (changed) atomicPrivate(config.configFile, bytes);
  if (migration) {
    const archive = `${config.legacyFile}.migrated-${digest(readFileSync(config.legacyFile)).slice(0, 16)}.bak`;
    if (existsSync(archive)) {
      if (!readFileSync(archive).equals(readFileSync(config.legacyFile)))
        throw Error("Abweichende Sicherung der alten Konfiguration vorhanden.");
    }
    renameSync(config.legacyFile, archive);
  }
  mkdirSync(settings.DATA_DIR, { recursive: true, mode: 0o700 });
  const marker = resolve(settings.DATA_DIR, ".leitstellen-instance.json");
  if (!present(marker))
    atomicPrivate(
      marker,
      JSON.stringify({ schema: 1, id, programRoot: config.programRoot }) + "\n",
    );
  return {
    ...config,
    identity: record,
    created: missingFile && !identity,
    recovered: missingFile && !!identity,
    migrated: migration,
    dataDir: settings.DATA_DIR,
    geodataDir: settings.GEODATA_DIR,
    needsPublicUrl: new URL(settings.PUBLIC_URL).protocol !== "https:",
  };
}
export function recordDatabaseReady(programRoot) {
  const identity = readIdentity(programRoot);
  if (!identity) return; // Explicit developer/maintenance environments need not create an installation.
  const config = resolveConfiguration({ programRoot });
  const inspection = inspectInstallation(config);
  if (inspection.game.status !== "ready")
    throw Error("Spieldatenbank ist noch nicht bereit.");
  atomicPrivate(
    resolve(installationLocation(programRoot), "installation.json"),
    JSON.stringify(
      { ...identity, databaseSeen: true, dataset: inspection.game.dataset },
      null,
      2,
    ) + "\n",
  );
}
