import { existsSync, readdirSync } from "node:fs";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveConfiguration,
  installationLocation,
} from "./configuration.mjs";
import { inspectInstallation } from "./installation-storage.mjs";
import { recoveryCandidates } from "./installation.mjs";

export function diagnose({
  programRoot = fileURLToPath(new URL("../", import.meta.url)),
  environment = process.env,
} = {}) {
  const report = {
    programRoot,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    build: existsSync(resolve(programRoot, "dist/server/index.js")),
    identityPath: installationLocation(programRoot),
  };
  try {
    const config = resolveConfiguration({ programRoot, environment });
    report.configuration = Object.fromEntries(
      [
        "HOST",
        "PORT",
        "PUBLIC_URL",
        "ALLOW_HTTP",
        "TRUSTED_PROXIES",
        "DATA_DIR",
        "GEODATA_DIR",
      ].map((key) => [
        key,
        { value: config.settings[key], source: config.sources[key] },
      ]),
    );
    report.identity = config.identity
      ? "zugeordnet"
      : "keine geschützte Zuordnung";
    report.data = inspectInstallation(config);
    report.next = report.build
      ? "Setup bei Bedarf: node scripts/install-germany.mjs; AMP-Start: scripts/start-germany.mjs"
      : "Build fehlt: node scripts/install-germany.mjs";
  } catch (error) {
    report.problem = error.message;
    report.candidates = recoveryCandidates(programRoot);
    report.next =
      "Konflikt/Pfade prüfen; reguläres Setup stellt eindeutig zugeordnete Konfiguration wieder her. Kein Ordner wird gelöscht.";
  }
  return report;
}
export async function networkDiagnosis(options) {
  try {
    const { settings } = resolveConfiguration(options);
    const host =
      settings.HOST === "0.0.0.0"
        ? "127.0.0.1"
        : settings.HOST === "::"
          ? "::1"
          : settings.HOST;
    const reachable = await new Promise((done) => {
      const socket = createConnection({ host, port: Number(settings.PORT) });
      const finish = (value) => {
        socket.destroy();
        done(value);
      };
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.setTimeout(1000, () => finish(false));
    });
    const router = await fetch(
      (settings.GRAPHHOPPER_URL || "http://127.0.0.1:8989") + "/info",
      { signal: AbortSignal.timeout(1500), redirect: "error" },
    )
      .then((r) =>
        r.ok
          ? "erreichbar; Importkennung beim Start prüfen"
          : `HTTP ${r.status}`,
      )
      .catch(() => "nicht erreichbar");
    const tools = resolve(settings.GEODATA_DIR, "tools");
    const entries = existsSync(tools) ? readdirSync(tools) : [];
    return {
      gamePort: reachable
        ? "TCP erreichbar/belegt; für Setup Spiel regulär stoppen"
        : "kein TCP-Dienst erreichbar",
      router,
      tools: {
        java: entries.some(
          (name) =>
            name.startsWith("jdk-21.0.12.1") &&
            existsSync(
              resolve(
                tools,
                name,
                "bin",
                process.platform === "win32" ? "java.exe" : "java",
              ),
            ),
        ),
        graphhopper: existsSync(resolve(tools, "graphhopper-web-11.0.jar")),
      },
    };
  } catch {
    return {
      status:
        "Netzprüfung benötigt widerspruchsfreie Konfiguration mit Datenpfaden",
    };
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length > 2)
    throw Error(
      "Diagnose ist schreibgeschützt und benötigt keine Optionen. Wiederherstellung erfolgt im regulären Setup.",
    );
  const result = diagnose();
  result.network = await networkDiagnosis({
    programRoot: fileURLToPath(new URL("../", import.meta.url)),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.problem) process.exitCode = 1;
}
