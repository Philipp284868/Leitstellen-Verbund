import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { candidate, fetchBytes } from "./channel.mjs";
import { instance, assertGeneration } from "./instance.mjs";
import { assertSpace, directory, hash, removeManaged } from "./files.mjs";
import { unpack } from "./archive.mjs";
import { stopManaged } from "./launcher.mjs";
import { update, assertCompatibility } from "./update.mjs";
import { assertNoPendingReset } from "./reset.mjs";

/** Resolve access, verify the complete archive, then stop our own process.
 * A revoked credential, broken asset or invalid archive leaves the running
 * application alone. No signed URL or credential is written to the journal. */
export async function managedUpdate(
  root,
  {
    resolveCandidate = candidate,
    download = fetchBytes,
    stop = stopManaged,
    activate = update,
  } = {},
) {
  const i = instance(root);
  await assertNoPendingReset(i);
  if (i.record.initialized) assertGeneration(i);
  const c = await resolveCandidate({ root });
  if (i.current?.sha256 === c.sha256) {
    console.log("Bereits aktuell. Laufende Anwendung und Daten unverändert.");
    return { unchanged: true };
  }
  if (i.current && c.sequence <= i.current.sequence)
    throw Error("Updatekanal ist älter als die installierte Version.");
  assertSpace(i.root, c.size * 5 + 128 * 1024 * 1024);
  const bytes = await download(c.url, 256 * 1024 * 1024, root);
  if (bytes.length !== c.size || hash(bytes) !== c.sha256)
    throw Error(
      "Paketgröße oder Prüfsumme falsch. Laufende Anwendung bleibt erhalten.",
    );
  const work = directory(
    resolve(i.root, "staging", "preflight-" + randomUUID()),
  );
  try {
    const manifest = unpack(bytes, resolve(work, "app"));
    assertCompatibility(manifest, c);
  } finally {
    removeManaged(i.root, work);
  }
  console.log(
    "Downloadzugang und vollständiges Paket geprüft. Anwendung wird kontrolliert beendet.",
  );
  await stop(instance(root));
  // update rechecks generation, sequence, hash and package under its own lock.
  return activate(root, {
    resolveCandidate: async () => c,
    download: async () => bytes,
  });
}
