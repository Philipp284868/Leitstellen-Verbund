import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Explicit local AMP template: first bootstrap is operator-provisioned, never
 * fetched anonymously by an updater that has not yet received its credential. */
export async function writePrivateTemplate(source, destination) {
  const folder = resolve(destination, "LOCAL-LeitstellenPrivate-main");
  await mkdir(folder, { recursive: true });
  for (const name of [
    "leitstellen-verbundconfig.json",
    "leitstellen-verbundports.json",
  ])
    await copyFile(resolve(source, name), resolve(folder, name));
  const kvp = (
    await readFile(resolve(source, "leitstellen-verbund.kvp"), "utf8")
  )
    .replace(/^Meta.ConfigVersion=.*$/m, "Meta.ConfigVersion=2")
    .replace(
      /^Meta.Description=.*$/m,
      "Meta.Description=Deutschland-Leitstelle mit lokalem Starter und geschuetztem GitHub-Lesezugang",
    );
  await writeFile(resolve(folder, "leitstellen-verbund.kvp"), kvp);
  const stages = JSON.parse(
    await readFile(resolve(source, "leitstellen-verbundupdates.json"), "utf8"),
  );
  const local = stages.filter((stage) => stage.UpdateSource !== "FetchURL");
  if (
    local.length !== 4 ||
    local.some(
      (stage) =>
        ![
          "SetExecutableFlag",
          "Executable",
          "StartApplication",
          "WaitForStartupComplete",
        ].includes(stage.UpdateSource),
    )
  )
    throw Error("Unerwartete AMP-Vorlage; lokalen Uebergang pruefen.");
  await writeFile(
    resolve(folder, "leitstellen-verbundupdates.json"),
    JSON.stringify(local, null, 2) + "\n",
  );
  return folder;
}
