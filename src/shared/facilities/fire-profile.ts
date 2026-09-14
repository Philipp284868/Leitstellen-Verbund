import { z } from "zod";
import { euro } from "../money";

export const fireProfileKinds = [
  "ff",
  "ff-paid",
  "bf",
  "shared",
  "works",
  "company",
  "airport",
  "unknown",
] as const;
export const fireProfileSchema = z
  .object({
    version: z.literal(1),
    revision: z.string().min(1).max(80),
    kind: z.enum(fireProfileKinds),
    employment: z.enum(["volunteer", "paid", "mixed", "unknown"]),
    units: z
      .array(
        z
          .object({
            name: z.string().max(160),
            kind: z.enum(["ff", "bf", "works", "company", "airport"]),
          })
          .strict(),
      )
      .max(6),
    evidence: z
      .array(
        z
          .string()
          .url()
          .max(500)
          .refine((value) => {
            const u = new URL(value);
            return u.protocol === "https:" && !u.username && !u.password;
          }),
      )
      .max(12),
    checked: z.string().max(40),
    confidence: z.enum(["official", "osm", "unknown"]),
    reason: z.string().max(600),
  })
  .strict();
export type FireProfile = z.infer<typeof fireProfileSchema>;
export const fireProfileLabels: Record<FireProfile["kind"], string> = {
  ff: "Freiwillige Feuerwehr",
  "ff-paid": "FF mit hauptamtlichem Anteil",
  bf: "Berufsfeuerwehr",
  shared: "Gemeinschaftswache BF / FF",
  works: "Werkfeuerwehr",
  company: "Betriebsfeuerwehr",
  airport: "Flughafenfeuerwehr",
  unknown: "Feuerwehr – Wachtyp ungeklärt",
};
export const FIRE_PRICE_VERSION = 1;
/** Abstrahierte Spielwerte, keine realen Immobilienpreise, Dienstpläne oder Garagenzahlen. */
export const FIRE_GAME_PROFILES = {
  ff: {
    slots: 4,
    people: 36,
    paid: 0,
    turnout: 30,
    level: 1,
    price: euro(450000),
  },
  "ff-paid": {
    slots: 4,
    people: 36,
    paid: 6,
    turnout: 30,
    level: 4,
    price: euro(850000),
  },
  bf: {
    slots: 4,
    people: 18,
    paid: 18,
    turnout: 25,
    level: 6,
    price: euro(1350000),
  },
  shared: {
    slots: 6,
    people: 48,
    paid: 12,
    turnout: 30,
    level: 6,
    price: euro(1550000),
  },
  works: {
    slots: 4,
    people: 18,
    paid: 18,
    turnout: 35,
    level: 6,
    price: euro(1150000),
  },
  company: {
    slots: 3,
    people: 12,
    paid: 12,
    turnout: 40,
    level: 5,
    price: euro(900000),
  },
  airport: {
    slots: 5,
    people: 24,
    paid: 24,
    turnout: 25,
    level: 8,
    price: euro(1750000),
  },
} as const;
export function fireGameProfile(profile?: FireProfile) {
  const employment =
    profile?.kind === "ff"
      ? "volunteer"
      : profile?.kind === "ff-paid" || profile?.kind === "shared"
        ? "mixed"
        : "paid";
  return profile &&
    profile.kind !== "unknown" &&
    profile.employment === employment &&
    profile.confidence !== "unknown" &&
    profile.evidence.length > 0
    ? FIRE_GAME_PROFILES[profile.kind]
    : undefined;
}
export function fireReadinessText(profile: FireProfile) {
  return profile.employment === "volunteer"
    ? "Ehrenamtliche Besatzung sammelt sich nach Alarm."
    : profile.employment === "mixed"
      ? "Diensthabende Grundbesetzung mit freiwilliger Verstärkung."
      : profile.employment === "paid"
        ? "Begrenzte diensthabende Besatzung vor Ort."
        : "Besetzungsform nicht belegt; kein neues typspezifisches Kaufangebot.";
}
export function fireQuote(profile?: FireProfile) {
  const game = fireGameProfile(profile);
  return game && profile
    ? `${profile.revision}:${profile.kind}:price-${FIRE_PRICE_VERSION}:${game.price}`
    : undefined;
}
