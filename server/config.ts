import { IS_RIVERMERE } from "../src/world-choice";
import { existsSync, realpathSync, mkdirSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export interface Config {
  host: string;
  port: number;
  publicUrl: string;
  dataDir: string;
  secure: boolean;
  trustedProxies: string[];
}
export function config(): Config {
  const env = resolve(root, ".env");
  if (existsSync(env)) loadEnvFile(env);
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
  if (IS_RIVERMERE && !process.env.DATA_DIR)
    throw Error(
      "Rivermere benötigt ein ausdrücklich gesetztes eigenes DATA_DIR. Bestehende Welten werden nicht umgestellt.",
    );
  const dataDir = resolve(
    process.env.DATA_DIR || resolve(root, "../leitstellen-data"),
  );
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const rel = relative(realpathSync(root), realpathSync(dataDir));
  if (!(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)))
    throw Error("DATA_DIR muss außerhalb des Programmverzeichnisses liegen.");
  return {
    host,
    port,
    publicUrl: url.origin,
    dataDir,
    secure: url.protocol === "https:",
    trustedProxies: (process.env.TRUSTED_PROXIES || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
