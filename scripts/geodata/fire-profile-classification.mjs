/** Two concordant OSM hints; employment and legal organisation are independent. */
export function classifyFireProfile(tags) {
  const type = (tags["fire_station:type"] || "").toLowerCase();
  const team = (tags["fire_station:team"] || "").toLowerCase();
  const name = `${tags.name || ""} ${tags.operator || ""}`;
  const ff = /freiwillig|\bFF\b/i.test(name),
    bf = /berufsfeuer|\bBF\b/i.test(name);
  if (
    ["voluntary", "volunteer"].includes(type) &&
    ff &&
    !bf &&
    ["", "voluntary", "volunteer", "professional", "paid", "mixed"].includes(
      team,
    )
  )
    return {
      kind: ["professional", "paid", "mixed"].includes(team) ? "ff-paid" : "ff",
      employment: ["professional", "paid", "mixed"].includes(team)
        ? "mixed"
        : "volunteer",
      reason:
        "Expliziter OSM-Typtag freiwillig und passende Einheits-/Betreiberangabe; keine amtliche Einzelprüfung.",
    };
  if (
    ["professional", "occupation"].includes(type) &&
    bf &&
    !ff &&
    ["", "professional", "paid"].includes(team)
  )
    return {
      kind: "bf",
      employment: "paid",
      reason:
        "OSM-Typtag und ausdrückliche Berufsfeuerwehr-Bezeichnung stimmen überein; keine amtliche Einzelprüfung.",
    };
  if (type === "mixed" && ff && bf)
    return {
      kind: "shared",
      employment: "mixed",
      reason:
        "OSM kennzeichnet den gemeinsamen Standort und beide Organisationsformen ausdrücklich.",
    };
  const specials = {
    works: ["works", "industrial", "plant"],
    company: ["company", "concern"],
    airport: ["airport", "aerodrome"],
  };
  const labels = {
    works: /werkfeuer/i,
    company: /betriebsfeuer/i,
    airport: /flughafenfeuer|airport fire/i,
  };
  for (const [kind, values] of Object.entries(specials))
    if (
      values.includes(type) &&
      labels[kind].test(name) &&
      ["professional", "paid"].includes(team)
    )
      return {
        kind,
        employment: "paid",
        reason:
          "Spezialfunktion, Betreiberbezeichnung und hauptamtliche Besetzungsangabe im OSM-Datensatz belegt.",
      };
  return {
    kind: "unknown",
    employment: "unknown",
    reason:
      "Organisationsform und Besetzung fehlen oder sind nicht widerspruchsfrei belegt. Name oder allgemeiner professional-Hinweis reichen allein nicht.",
  };
}

/** Persist only public institutional source facts, never private personnel details. */
export function osmFireProfile(records, snapshot) {
  const candidates = records.map((r) => ({
    source: r.source,
    name: (r.tags.name || r.tags.operator || "Feuerwehr").slice(0, 160),
    ...classifyFireProfile(r.tags),
  }));
  const known = candidates.filter((c) => c.kind !== "unknown");
  const same =
    known.length > 0 &&
    known.every(
      (c) => c.kind === known[0].kind && c.employment === known[0].employment,
    );
  const profile = same
    ? known[0]
    : {
        kind: "unknown",
        employment: "unknown",
        reason:
          "Organisationsform und Besetzung ungeklärt oder widersprüchlich; kein typspezifisches Kaufangebot.",
      };
  const units = same
    ? known.flatMap((c) =>
        c.kind === "shared"
          ? [
              { name: c.name, kind: "bf" },
              { name: c.name, kind: "ff" },
            ]
          : [{ name: c.name, kind: c.kind === "ff-paid" ? "ff" : c.kind }],
      )
    : [];
  return {
    version: 1,
    revision: `osm-${snapshot}-rules-1`,
    kind: profile.kind,
    employment: profile.employment,
    units: units.slice(0, 6),
    evidence: [...new Set(records.map((r) => r.source))]
      .filter((s) => /^(node|way|relation):\d+$/.test(s))
      .slice(0, 12)
      .map((s) => `https://www.openstreetmap.org/${s.replace(":", "/")}`),
    checked: snapshot,
    confidence: same ? "osm" : "unknown",
    reason: profile.reason,
  };
}
