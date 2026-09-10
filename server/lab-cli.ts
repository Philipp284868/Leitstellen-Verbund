import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { balanceAudit } from "./balance";
import { prepareGeography } from "./germany/runtime";
import { createLab, labSchema, runLab, verifyLab } from "./lab";
const args = process.argv.slice(2),
  command = args[0];
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0 || !args[i + 1]) throw Error(`--${name} fehlt.`);
  return args[i + 1];
};
async function read(path: string) {
  if ((await stat(path)).size > 8 * 1024 * 1024)
    throw Error("Datei größer als 8 MB.");
  return JSON.parse(await readFile(path, "utf8"));
}
if (!["create", "step", "verify", "events", "balance"].includes(command))
  throw Error(
    "Entwicklerlabor: create --seed N --out NEU.json | step --in LAB.json --action AKTION.json --out NEU.json | verify --in LAB.json | events --in LAB.json --out NEU.json | balance --out NEU.json. Nur isolierte Labordateien, keine Serverdatenbank.",
  );
const geography = await prepareGeography({
  geodataDir: process.env.GEODATA_DIR,
  routerUrl: process.env.GRAPHHOPPER_URL,
});
try {
  if (command === "verify")
    console.log(
      JSON.stringify(
        verifyLab(labSchema.parse(await read(arg("in")))),
        null,
        2,
      ),
    );
  else if (command === "balance") {
    const path = resolve(arg("out"));
    await writeFile(path, JSON.stringify(balanceAudit(), null, 2), {
      flag: "wx",
    });
    console.log(`Balancing-Prüfung: ${path}`);
  } else {
    const result =
      command === "create"
        ? createLab(Number(arg("seed")))
        : command === "step"
          ? runLab(
              labSchema.parse(await read(arg("in"))),
              await read(arg("action")),
            )
          : labSchema.parse(await read(arg("in"))).save;
    const output =
      command === "events" && "missions" in result
        ? [...result.missions, ...result.archive]
            .flatMap((m) =>
              (m.control?.events ?? []).map((event) => ({
                mission: m.id,
                ...event,
              })),
            )
            .sort((a, b) => a.at - b.at)
        : result;
    const path = resolve(arg("out"));
    await writeFile(path, JSON.stringify(output, null, 2), { flag: "wx" });
    console.log(`Neue lokale Prüfdatei: ${path}`);
  }
} finally {
  await geography.close();
}
