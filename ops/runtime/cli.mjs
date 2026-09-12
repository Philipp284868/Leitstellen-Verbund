import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { instance, initialize } from "./instance.mjs";
import { start, stopManaged, recoverLock } from "./launcher.mjs";
import { update } from "./update.mjs";
import { adopt } from "./adopt.mjs";
import { preview, reset } from "./reset.mjs";
import { grantOperator } from "./operator.mjs";

export async function main(args = process.argv.slice(2)) {
  const [action = "start", ...options] = args;
  const root = resolve(
    process.env.LV_INSTANCE_ROOT ||
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        fileURLToPath(import.meta.url)
          .replaceAll("\\", "/")
          .includes("/launcher/")
          ? ".."
          : "../..",
      ),
  );
  if (action === "setup") {
    if (!existsSync(resolve(root, "shared/state/instance.json"))) {
      if (process.env.LV_ADOPT_SOURCE)
        await adopt(root, process.env.LV_ADOPT_SOURCE);
      else
        initialize(root, {
          PUBLIC_URL: process.env.PUBLIC_URL || "http://127.0.0.1:7777",
          PORT: process.env.PORT || "7777",
          HOST: process.env.HOST || "127.0.0.1",
        });
    }
    await stopManaged(instance(root));
    await update(root);
    return 0;
  }
  if (action === "adopt") {
    await adopt(root, options[0]);
    return 0;
  }
  if (action === "bootstrap") {
    initialize(root, {
      PUBLIC_URL: process.env.PUBLIC_URL || "http://127.0.0.1:7777",
      PORT: process.env.PORT || "7777",
      HOST: process.env.HOST || "127.0.0.1",
    });
    return 0;
  }
  const i = instance(root);
  if (action === "grant-operator") {
    await stopManaged(i);
    await grantOperator(root);
    return 0;
  }
  if (action === "start") return start(root);
  if (action === "diagnose") {
    console.log(
      JSON.stringify(
        {
          instance: i.record.id,
          root: i.root,
          data: i.data,
          geodata: i.geo,
          generation: i.record.generation,
          current: i.current,
          locked: existsSync(resolve(i.state, "operation.lock")),
        },
        null,
        2,
      ),
    );
    return 0;
  }
  if (action === "unlock" && options[0] === "--confirm") {
    recoverLock(root);
    return 0;
  }
  if (action === "reset-preview") {
    await stopManaged(i);
    console.log(JSON.stringify(preview(root, options[0]), null, 2));
    return 0;
  }
  if (action === "reset-confirm") {
    await stopManaged(i);
    const request = JSON.parse(
      readFileSync(resolve(i.root, "shared/config/reset-request.json"), "utf8"),
    );
    await reset(root, request.request, request.confirmation);
    return 0;
  }
  if (action === "update") {
    await stopManaged(i);
    await update(root);
    return 0;
  }
  throw Error(
    "Aktionen: start, update, diagnose, reset-preview ID, reset-confirm, unlock --confirm.",
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = await main();
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
