import { reportToken } from "./bug-reports";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfiguration } from "../../scripts/configuration.mjs";
export const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export interface Config {
  githubIssuesToken?: string;
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
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw Error("Node.js 24 erforderlich.");
  const { settings } = resolveConfiguration({ programRoot: root });
  const url = new URL(settings.PUBLIC_URL);
  return {
    githubIssuesToken: reportToken(
      process.env.GITHUB_ISSUES_TOKEN ?? settings.GITHUB_ISSUES_TOKEN,
    ),
    host: settings.HOST,
    port: Number(settings.PORT),
    publicUrl: url.origin,
    dataDir: settings.DATA_DIR,
    geodataDir: settings.GEODATA_DIR,
    routerUrl: settings.GRAPHHOPPER_URL || "http://127.0.0.1:8989",
    secure: url.protocol === "https:",
    trustedProxies: settings.TRUSTED_PROXIES.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
