import {
  buildings,
  vehicles,
  extensions,
  bt,
  vehicleHomeAllowed,
} from "./catalog";
import { formatMoney } from "./money";
import type { Save } from "./model";
import { unlocked, upgradeLevel, upgradeUnlocked } from "./progression-state";

/** The display is derived from the actual catalogue and the purchase gates. */
export function unlockMatrix(s: Save) {
  const items = [
    ...buildings
      .filter((b) => b.id !== "hospital")
      .map((b) => ({
        id: `building:${b.id}`,
        name: b.name,
        level: b.level,
        available: unlocked(s, "building", b.id),
        detail: `${formatMoney(b.price)} · passenden realen Standort kaufen${b.water ? " · Zugang zum Wasser" : ""}`,
      })),
    ...vehicles.map((v) => {
      const extension = extensions.find((e) => e.types.includes(v.id));
      return {
        id: `vehicle:${v.id}`,
        name: v.name,
        level: v.level,
        available: unlocked(s, "vehicle", v.id),
        detail: [
          formatMoney(v.price),
          buildings
            .filter((b) => vehicleHomeAllowed(v, b.id))
            .map((b) => b.name)
            .join(" / "),
          "freier Stellplatz",
          extension?.name,
          v.stationKinds
            ? "passende Werk-, Betriebs- oder Flughafenfeuerwehr"
            : "",
          `automatische Besatzung${v.training ? ": " + v.training : ""}`,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }),
    ...extensions.map((e) => ({
      id: `extension:${e.id}`,
      name: e.name,
      level: e.level,
      available: unlocked(s, "extension", e.id),
      detail: `${formatMoney(e.price)} · ${bt(e.home).name} in Betrieb`,
    })),
    ...buildings
      .filter((b) => b.id !== "hospital")
      .flatMap((b) =>
        Array.from({ length: 9 }, (_, i) => {
          const current = i + 1;
          return {
            id: `upgrade:${b.id}:${current + 1}`,
            name: `${b.name} · Ausbau ${current + 1}`,
            level: upgradeLevel(b.id, current),
            available: upgradeUnlocked(s, b.id, current),
            detail: `${b.name} auf Ausbaustufe ${current} · Betrieb bereit · Ausbaukosten gemäß Gebäudeansicht`,
          };
        }),
      ),
  ];
  return items.sort(
    (a, b) => a.level - b.level || a.name.localeCompare(b.name, "de"),
  );
}
