import data from "./fire-profile-data.json" with { type: "json" };
import { createHash } from "node:crypto";
import corrections from "./fire-profile-corrections.json" with { type: "json" };
import {
  fireProfileSchema,
  type FireProfile,
} from "../../shared/facilities/fire-profile";
const entries = data.records as Record<
  string,
  { kind: string; employment: string; name: string; reason: string }
>;
export const FIRE_PROFILE_REVISION =
  "fire-1-" +
  createHash("sha256")
    .update(JSON.stringify([data, corrections]))
    .digest("hex");
export const preparedFireSources = [
  ...new Set([
    ...Object.keys(entries),
    ...corrections.entries.flatMap((entry) => entry.sources),
  ]),
];
// Only an explicitly evidenced shared physical watch building establishes identity.
export const sharedFireBuildings = corrections.entries
  .filter((entry) => entry.kind === "shared")
  .map((entry) => entry.sources);
/** Prepared once at build; no network and no OSM full import at login/start. */
export function catalogFireProfile(sources: readonly string[]): FireProfile {
  const correction = corrections.entries.find((entry) =>
    entry.sources.some((source) => sources.includes(source)),
  );
  if (correction) {
    const facts = { ...correction } as Partial<typeof correction>;
    delete facts.sources;
    return fireProfileSchema.parse({
      ...facts,
      version: 1,
      revision: FIRE_PROFILE_REVISION,
      checked: corrections.checked,
      confidence: "official",
    });
  }
  const known = sources
    .map((source) => ({ source, entry: entries[source] }))
    .filter((x) => x.entry);
  const kinds = new Set(
    known.map((x) => `${x.entry.kind}:${x.entry.employment}`),
  );
  const unique = kinds.size === 1 ? known[0]?.entry : undefined;
  return fireProfileSchema.parse({
    version: 1,
    revision: FIRE_PROFILE_REVISION,
    kind: unique?.kind ?? "unknown",
    employment: unique?.employment ?? "unknown",
    units: unique
      ? known
          .flatMap((x) =>
            x.entry.kind === "shared"
              ? [
                  { name: x.entry.name, kind: "bf" },
                  { name: x.entry.name, kind: "ff" },
                ]
              : [
                  {
                    name: x.entry.name,
                    kind: x.entry.kind === "ff-paid" ? "ff" : x.entry.kind,
                  },
                ],
          )
          .slice(0, 6)
      : [],
    evidence: sources
      .filter((s) => /^(node|way|relation):\d+$/.test(s))
      .slice(0, 10)
      .map((s) => `https://www.openstreetmap.org/${s.replace(":", "/")}`),
    checked: data.snapshot,
    confidence: unique ? "osm" : "unknown",
    reason:
      unique?.reason ??
      "Wachtyp und Besetzung nicht hinreichend belegt. Bestehender Spielbetrieb bleibt erhalten; neue typspezifische Käufe benötigen Klärung.",
  });
}
