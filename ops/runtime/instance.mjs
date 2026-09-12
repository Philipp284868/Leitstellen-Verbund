import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import {
  atomic,
  directory,
  hash,
  read,
  safePath,
  within,
  lock,
} from "./files.mjs";

export function instance(root) {
  root = safePath(root);
  const record = read(
    safePath(root, resolve(root, "shared/state/instance.json")),
  );
  if (
    record.format !== 1 ||
    record.root !== realpathSync(root) ||
    !/^[a-f0-9-]{36}$/.test(record.id)
  )
    throw Error("Fremde oder ungültige Instanzkennung.");
  for (const name of ["state", "config", "data", "backups", "uploads"])
    safePath(root, resolve(root, "shared", name));
  const current = existsSync(resolve(root, "current.json"))
    ? read(resolve(root, "current.json"))
    : null;
  const data = safePath(root, resolve(root, "shared/data", record.generation));
  if (!/^[a-f0-9-]{36}$/.test(record.generation))
    throw Error("Ungültige Weltgeneration.");
  const config = safePath(root, resolve(root, "shared/config/.env"));
  const recovery = safePath(
    root,
    resolve(root, "shared/state/config-recovery.json"),
  );
  if (!existsSync(config)) {
    const saved = read(recovery);
    if (
      saved.instance !== record.id ||
      typeof saved.text !== "string" ||
      hash(saved.text) !== saved.sha256
    )
      throw Error("Keine belegte Konfigurationssicherung für diese Instanz.");
    atomic(config, saved.text);
    console.log(
      "Private Konfiguration aus geprüfter Instanzsicherung wiederhergestellt.",
    );
  }
  const text = readFileSync(config, "utf8");
  const env = parseEnv(text);
  const saved = existsSync(recovery) ? read(recovery) : null;
  if (!saved || saved.sha256 !== hash(text))
    atomic(recovery, { instance: record.id, text, sha256: hash(text) });
  const geo = safePath(record.geodata);
  if (
    (within(root, geo) && !within(resolve(root, "shared/geodata"), geo)) ||
    within(geo, root)
  )
    throw Error("Geodaten überschneiden sich mit der Instanz.");
  return {
    root,
    record,
    current,
    state: resolve(root, "shared/state"),
    data,
    geo,
    env: {
      ...process.env,
      ...env,
      ...Object.fromEntries(
        ["HOST", "PORT", "PUBLIC_URL", "TRUSTED_PROXIES", "GRAPHHOPPER_URL"]
          .filter((k) => process.env[k] !== undefined)
          .map((k) => [k, process.env[k]]),
      ),
      LV_INSTANCE_ROOT: root,
      LV_INSTANCE_ID: record.id,
      LV_WORLD_GENERATION: record.generation,
      DATA_DIR: data,
      GEODATA_DIR: geo,
    },
  };
}
export function initialize(
  root,
  settings,
  { id = randomUUID(), geodata } = {},
) {
  root = directory(root);
  const release = lock(resolve(root, "setup.lock"), "initialize");
  try {
    if (existsSync(resolve(root, "shared/state/instance.json")))
      return instance(root);
    if (
      existsSync(resolve(root, "shared/config/.env")) ||
      existsSync(resolve(root, "shared/state/config-recovery.json")) ||
      existsSync(resolve(root, "current.json"))
    )
      throw Error(
        "Instanzkennung fehlt bei vorhandenem Bestand. Keine automatische Neuinitialisierung.",
      );
    // Explicit bootstrap only; no game start may initialize a lost installation.
    for (const name of [
      "launcher",
      "releases",
      "staging",
      "shared/config",
      "shared/state",
      "shared/data",
      "shared/uploads",
      "shared/backups",
      "shared/logs",
    ])
      directory(resolve(root, name));
    const geo = geodata
      ? safePath(geodata)
      : directory(resolve(root, "shared/geodata"));
    const generation = randomUUID();
    directory(resolve(root, "shared/data", generation));
    const values = {
      HOST: "127.0.0.1",
      PORT: "7777",
      PUBLIC_URL: "http://127.0.0.1:7777",
      TRUSTED_PROXIES: "",
      ALLOW_HTTP: "false",
      ...settings,
    };
    delete values.DATA_DIR;
    delete values.GEODATA_DIR;
    for (const [k, v] of Object.entries(values))
      if (!/^[A-Z_]+$/.test(k) || /[\r\n\0"']/.test(v))
        throw Error("Konfiguration kann nicht sicher übernommen werden: " + k);
    atomic(
      resolve(root, "shared/config/.env"),
      Object.entries(values)
        .map(([k, v]) => `${k}="${v}"`)
        .join("\n") + "\n",
    );
    atomic(resolve(root, "shared/state/instance.json"), {
      format: 1,
      root,
      id,
      generation,
      geodata: geo,
      initialized: false,
    });
    return instance(root);
  } finally {
    release();
  }
}
export function program(i, pointer = i.current) {
  if (
    !pointer ||
    !/^[0-9]+\.[0-9]+\.[0-9]+-[a-f0-9]{40}$/.test(pointer.release)
  )
    throw Error(
      "Keine gültige aktive Programmversion. Zuerst Update ausführen.",
    );
  return safePath(i.root, resolve(i.root, "releases", pointer.release));
}
export function assertGeneration(i) {
  if (!existsSync(resolve(i.data, "game.sqlite")))
    throw Error("Datenbank fehlt. Keine automatische Ersatzwelt.");
  const marker = read(resolve(i.data, "world.json"));
  if (
    marker.instance !== i.record.id ||
    marker.generation !== i.record.generation
  )
    throw Error("Weltgeneration oder Instanzzuordnung stimmt nicht.");
}
