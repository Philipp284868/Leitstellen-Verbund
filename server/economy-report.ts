import {
  buildings,
  capabilities,
  extensions,
  legacyMissionRewards,
  missions,
  vehicles,
} from "../src/catalog";
import { economyBalanceAudit } from "../src/economy/balancing";
import {
  convertLegacyCredits,
  protectionRatio,
} from "../src/economy/migration";
import { ECONOMY_PRICES, priceEntries } from "../src/economy/prices";
import { formatMoney } from "../src/money";
import { WORLD_NAME } from "../src/product";

export function economyPriceReport() {
  const prices = priceEntries().map((p) => {
    const v =
        p.kind === "vehicle" ? vehicles.find((v) => v.id === p.id) : undefined,
      b =
        p.kind === "building"
          ? buildings.find((b) => b.id === p.id)
          : undefined,
      e =
        p.kind === "extension"
          ? extensions.find((e) => e.id === p.id)
          : undefined;
    const extension = v && extensions.find((e) => e.types.includes(v.id));
    return {
      ...p,
      name: v?.name ?? b?.name ?? e!.name,
      prerequisite: v
        ? `Stufe ${v.level}; ${buildings.find((b) => b.id === v.home)!.name}; freier Stellplatz${extension ? `; ${extension.name}` : ""}`
        : b
          ? `Stufe ${b.level}; reale Einrichtung mit geprüfter Zufahrt${b.water ? "; geprüfter Uferzugang" : ""}`
          : `Passende Wache; Stufe ${e!.level}`,
      included: v
        ? `Komplettes Fahrzeug; ${Object.keys(v.skills)
            .map((k) => capabilities[k] ?? k)
            .join(", ")}; passende Gebäudebesatzung`
        : b
          ? `${b.slots} Grundstellplätze; automatische Betriebsbesetzung; Fahrzeuge separat`
          : `Gebäudefunktion ${e!.name}; passende Qualifikation ohne Einzelgebühr`,
      reasoning: v
        ? v.id.startsWith("ab")
          ? "Vollständige Träger-/Containerkombination; Spezialfähigkeiten"
          : v.mode === "air"
            ? "Stark vereinfachter langfristiger Spielpreis; kein belegter Marktpreis"
            : v.training
              ? "Spezialfahrzeug einschließlich Ausrüstung; Funktions-/Kapazitätsabstufung"
              : "Funktions-/Kapazitätsabstufung; erreichbare Grundausstattung"
        : b
          ? "Betriebsfähige Spielanlage; reale Baukosten bewusst komprimiert"
          : "Einmalige Funktionsfreigabe; keine nachträgliche Personalrechnung",
    };
  });
  return {
    version: 1,
    currency: "EUR",
    unit: "cent",
    world: WORLD_NAME,
    conversion: { legacyCreditCents: 1000, protection: protectionRatio() },
    prices,
    other: ECONOMY_PRICES,
    missions: missions.map((m) => ({
      id: m.id,
      name: m.name,
      level: m.level,
      legacyCredits: legacyMissionRewards.get(m.id)!,
      cents: m.reward,
    })),
    scenarios: economyBalanceAudit(),
  };
}
export function priceMarkdown() {
  const r = economyPriceReport();
  const money = (n: number) => formatMoney(n).replaceAll("\u00a0", " ");
  return (
    `# Zentrale Spielpreisliste · Preisversion 1\n\nAutomatisch aus dem tatsächlichen ${r.world}-Katalog erzeugt. Alle neuen Werte sind simulierte Eurobeträge; Quellen, Umfang und bewusst vereinfachte Annahmen stehen in [EURO-WIRTSCHAFT.md](EURO-WIRTSCHAFT.md). Altwerte sind historische virtuelle Credits, keine Euro.\n\n| Position | Alt-Credits | Nur umgerechnet | Neuer Spielpreis | Voraussetzungen | Enthalten / Begründung |\n|---|---:|---:|---:|---|---|\n` +
    r.prices
      .map(
        (p) =>
          `| ${p.name} (${p.id}) | ${p.legacyCredits} | ${money(convertLegacyCredits(p.legacyCredits))} | ${money(p.cents)} | ${p.prerequisite} | ${p.included}. ${p.reasoning}. |`,
      )
      .join("\n") +
    `\n\nWeitere Geldflüsse, vollständige Vergütung je Einsatz-ID und die sechs Szenarien: [EURO-PREISE.json](EURO-PREISE.json).\n`
  );
}
