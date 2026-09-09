import { IS_GERMANY, IS_RIVERMERE, WORLD_NAME } from "../src/world-choice";
import { existsSync, realpathSync, mkdirSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const root = resolve(
  fileURLToPath(new URL(IS_GERMANY ? "../../../" : "../../", import.meta.url)),
);
export interface Config {
  host: string;
  port: number;
  publicUrl: string;
  dataDir: string;
  secure: boolean;
  trustedProxies: string[];
  geodataDir?: string;
  routerUrl?: string;
}
export function config(): Config {
  const germanyEnv = resolve(root, ".env.germany");
  const env =
    IS_GERMANY && existsSync(germanyEnv) ? germanyEnv : resolve(root, ".env");
  if (existsSync(env)) {
    loadEnvFile(env);
    if (IS_GERMANY && env === germanyEnv) {
      const settings = parseEnv(readFileSync(germanyEnv, "utf8"));
      // The CLI and a directly started Germany binary must select the same
      // world as the launcher, even if AMP still exports legacy data paths.
      for (const key of ["DATA_DIR", "GEODATA_DIR"] as const) {
        if (settings[key]) process.env[key] = settings[key];
        else delete process.env[key];
      }
      // An omitted URL preserves the managed routing address already set by
      // start-germany.mjs in its server child's environment.
      if (settings.GRAPHHOPPER_URL)
        process.env.GRAPHHOPPER_URL = settings.GRAPHHOPPER_URL;
    }
  }
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw Error("Node.js 24 erforderlich.");
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT muss zwischen 1 und 65535 liegen.");
  const url = new URL(process.env.PUBLIC_URL || `http://127.0.0.1:${port}`);
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
    process.env.ALLOW_HTTP !== "true"
  )
    throw Error(
      "Öffentlicher Betrieb benötigt HTTPS; ALLOW_HTTP=true ist nur für ein privates Testnetz.",
    );
  if ((IS_RIVERMERE || IS_GERMANY) && !process.env.DATA_DIR)
    throw Error(
      `${WORLD_NAME} benötigt ein ausdrücklich gesetztes eigenes DATA_DIR. Bestehende Welten werden nicht umgestellt.`,
    );
  const dataDir = resolve(
    root,
    process.env.DATA_DIR || resolve(root, "../leitstellen-data"),
  );
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const rel = relative(realpathSync(root), realpathSync(dataDir));
  if (!(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)))
    throw Error("DATA_DIR muss außerhalb des Programmverzeichnisses liegen.");
  if (IS_GERMANY && !process.env.GEODATA_DIR)
    throw Error(
      "Deutschland benötigt GEODATA_DIR mit einem fertig aufbereiteten Geodatenpaket. Anleitung: docs/DEUTSCHLAND-DATEN.md.",
    );
  if (IS_GERMANY) {
    const geo = realpathSync(resolve(root, process.env.GEODATA_DIR!));
    const inside = (parent: string, child: string) => {
      const rel = relative(parent, child);
      return (
        rel === "" ||
        !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
      );
    };
    if (inside(realpathSync(root), geo))
      throw Error(
        "GEODATA_DIR muss dauerhaft außerhalb des Programmverzeichnisses liegen.",
      );
    if (
      inside(geo, realpathSync(dataDir)) ||
      inside(realpathSync(dataDir), geo)
    )
      throw Error("Spieldaten und Geodaten benötigen getrennte Verzeichnisse.");
  }
  return {
    host,
    port,
    publicUrl: url.origin,
    dataDir,
    secure: url.protocol === "https:",
    ...(IS_GERMANY
      ? {
          geodataDir: resolve(root, process.env.GEODATA_DIR!),
          routerUrl: process.env.GRAPHHOPPER_URL || "http://127.0.0.1:8989",
        }
      : {}),
    trustedProxies: (process.env.TRUSTED_PROXIES || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
