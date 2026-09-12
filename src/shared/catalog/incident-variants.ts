import type { Template, Skills } from "../catalog";
import { incidentTopics, type IncidentTopic } from "./incident-topics";
import type { IncidentProfile, IncidentFamily } from "./incident-profile";

const bases: Record<IncidentFamily, Skills> = {
  "small-fire": { fire: 1 },
  "vehicle-fire": { fire: 1, water: 1 },
  vegetation: { fire: 2, water: 2 },
  "structure-fire": { fire: 2, water: 1 },
  "industry-fire": { fire: 3, water: 3, air: 1, command: 1 },
  technical: { rescue: 1 },
  collapse: { rescue: 2, technical: 2, logistics: 1 },
  traffic: { police: 1 },
  hazmat: { hazmat: 2, measure: 1 },
  "water-rescue": { diver: 2 },
  flood: { pump: 2 },
  medical: { medical: 2, transport: 1 },
  police: { police: 2 },
  crowd: { police: 1, crowd: 3 },
  supply: { technical: 1, logistics: 2 },
};
const fireFamilies = new Set<IncidentFamily>([
  "small-fire",
  "vehicle-fire",
  "vegetation",
  "structure-fire",
  "industry-fire",
]);
const orgs: Record<IncidentFamily, Template["org"]> = {
  "small-fire": "Feuerwehr",
  "vehicle-fire": "Feuerwehr",
  vegetation: "Feuerwehr",
  "structure-fire": "Feuerwehr",
  "industry-fire": "Feuerwehr",
  technical: "Feuerwehr",
  collapse: "Verbund",
  traffic: "Verbund",
  hazmat: "Feuerwehr",
  "water-rescue": "Verbund",
  flood: "THW",
  medical: "Rettungsdienst",
  police: "Polizei",
  crowd: "Polizei",
  supply: "THW",
};
const siteNames: Record<IncidentProfile["site"], string> = {
  street: "Straßenbereich",
  residential: "Wohnbereich",
  commercial: "Gewerbebereich",
  industrial: "Betriebsbereich",
  forest: "Waldbereich",
  field: "offene Fläche",
  rail: "Bahnanlage",
  public: "öffentlich zugänglicher Bereich",
  water: "bestätigter Gewässerzugang",
  construction: "Baustelle",
  school: "Schule",
  hospital: "Krankenhaus",
  shopping: "Einkaufszentrum",
  parking: "Parkhaus oder Parkplatz",
  motorway: "Autobahn",
  airport: "Flughafen",
};
export function buildIncidentVariant(
  topic: IncidentTopic,
  variant: IncidentProfile["variant"],
): Template {
  const has = (tag: string) => topic.tags.includes(tag);
  const extended = variant === "extended",
    access = variant === "access";
  const severity = Math.min(3, topic.size + Number(extended)) as 1 | 2 | 3;
  const r: Skills = { ...bases[topic.family] };
  const need = (skill: string, n = 1) => {
    r[skill] = Math.max(r[skill] || 0, n);
  };
  const burning = fireFamilies.has(topic.family) || has("fire");
  let patients =
    topic.family === "medical" || has("injury") || has("medical") ? 1 : 0;
  if (has("many")) patients = extended ? 8 : 4;
  else if (
    extended &&
    (patients || has("public") || (burning && topic.site === "residential"))
  )
    patients = 2;
  if (burning) {
    need("fire", severity);
    if (severity > 1 || has("container")) need("water", severity);
  }
  if (has("height")) need("ladder");
  if (has("tunnel")) need("air", 3);
  if (has("spill")) need("rescue", 1);
  if (has("search")) need("police", 3);
  if (has("lift")) need("technical", 1);
  if (has("battery")) need("water", 3);
  if (access) need("rescue", Math.min(3, Math.max(r.rescue || 0, topic.size)));
  if (has("trapped") || has("collapse")) need("rescue", 2);
  if (has("collapse")) {
    need("technical", 2);
    need("logistics");
  }
  if (has("chemical")) {
    need("hazmat", 2);
    need("measure");
  }
  if (has("gas") || has("unknown")) need("measure");
  if (has("contamination")) need("decon", extended ? 2 : 1);
  if ((has("fuel") || has("rubber") || has("oil")) && severity >= 3)
    need("foam");
  if (has("electrical")) need("power");
  if (has("light")) need("lighting", 2);
  if (has("security") || has("violence") || has("armed"))
    need("police", has("armed") ? 4 : 2);
  if (has("traffic") || has("rail")) need("police");
  if (has("boat")) need("boat", 2);
  if (has("water")) need("pump", 2);
  if (has("evacuation")) {
    need("care", 2);
    need("logistics", 2);
  }
  if (extended && severity >= 2) need("command");
  if (has("load") || (extended && topic.family === "supply"))
    need("technical", 2);
  if (patients) {
    need("medical", Math.min(10, patients * 2));
    need("transport", Math.min(6, patients));
  }
  if (
    has("critical") ||
    has("cpr") ||
    has("cardiac") ||
    has("stroke") ||
    has("birth") ||
    (extended && patients)
  )
    need("doctor");
  if (patients >= 4) {
    need("medicalCommand");
    need("care");
  }
  const intensive =
    topic.family === "medical" &&
    extended &&
    (has("critical") || has("cpr") || has("unconscious"));
  if (intensive) need("intensive", patients);
  const profile: IncidentProfile = {
    version: 1,
    topic: topic.name,
    family: topic.family,
    variant,
    site: topic.site,
    tags: [...topic.tags],
    severity,
    requirements: r,
    patientCount: patients,
    patient: {
      health: has("cpr")
        ? 10
        : has("critical")
          ? extended
            ? 24
            : 32
          : has("unconscious")
            ? 34
            : has("respiratory") || has("cardiac") || has("stroke")
              ? 48
              : has("vulnerable")
                ? 45
                : has("seizure")
                  ? 52
                  : has("poison")
                    ? 56
                    : has("allergy")
                      ? 60
                      : has("burn")
                        ? 62
                        : has("pain")
                          ? 68
                          : extended
                            ? 57
                            : 78,
      ageMin: has("infant")
        ? 0
        : has("child") || has("children")
          ? 2
          : has("birth")
            ? 20
            : 16,
      ageMax: has("infant")
        ? 0
        : has("child") || has("children")
          ? 12
          : has("birth")
            ? 42
            : 90,
      bloodLoss: has("bleeding") ? 35 : has("injury") && extended ? 18 : 0,
      temperature: has("cold") ? 33 : has("heat") ? 39.5 : 37,
      care: has("cpr")
        ? "cpr"
        : has("bleeding")
          ? "bleeding"
          : has("cold") || has("heat")
            ? "temperature"
            : has("respiratory") || has("smoke") || has("allergy")
              ? "oxygen"
              : "standard",
      intensive,
      deterioration: has("poison")
        ? 0.06
        : has("seizure")
          ? 0.045
          : has("allergy")
            ? 0.04
            : has("respiratory")
              ? 0.05
              : has("cardiac")
                ? 0.035
                : has("stroke")
                  ? 0.03
                  : 0.025,
      initialPain: has("pain")
        ? 8
        : has("burn")
          ? 7
          : has("injury")
            ? 6
            : has("cpr") || has("unconscious")
              ? 0
              : 3,
    },
    hazards: [],
    observations: [],
    people: patients
      ? `${patients} hilfsbedürftige Person${patients === 1 ? "" : "en"} gemeldet; telefonische Angaben müssen vor Ort überprüft werden.`
      : "Bislang keine Verletzten gemeldet; weitere Betroffene sind nicht ausgeschlossen.",
    followups: [],
    bystander:
      burning &&
      topic.family === "small-fire" &&
      variant === "reported" &&
      !has("electrical"),
  };
  const hazard = (
    kind: string,
    skill: string,
    initial = 22 + severity * 6,
    growth = 0.015,
  ) => {
    if (profile.hazards.some((h) => h.kind === kind && h.skill === skill))
      return;
    profile.hazards.push({
      kind,
      skill,
      initial,
      growth,
      required: Math.min(20, r[skill] || 1),
    });
  };
  if (burning) {
    hazard("fire", "fire", 20 + severity * 7, 0.025 + severity * 0.006);
    hazard("smoke", "fire", 12 + severity * 6);
    hazard("heat", "fire", 10 + severity * 4);
    const fuel =
      has("battery") || has("electrical")
        ? "Elektrokabel"
        : has("paper")
          ? "Papier"
          : has("textile")
            ? "Textilien"
            : has("straw")
              ? "Stroh"
              : has("vegetation")
                ? "Vegetation"
                : has("chemical")
                  ? "Chemikalien"
                  : has("rubber")
                    ? "Reifen"
                    : has("fuel")
                      ? "Kraftstoff"
                      : has("oil")
                        ? "Öl"
                        : has("insulation")
                          ? "Dämmstoff"
                          : topic.family === "small-fire"
                            ? "Müll"
                            : topic.family === "vehicle-fire"
                              ? "Fahrzeuge"
                              : topic.family === "structure-fire" &&
                                  !has("wood")
                                ? "Möbel"
                                : "Holz";
    const indoor = ["structure-fire", "industry-fire"].includes(topic.family);
    profile.fire = {
      fuel,
      indoor,
      area:
        (has("container")
          ? 8
          : topic.family === "vegetation"
            ? 80
            : indoor
              ? 18
              : 4) *
        topic.size *
        (extended ? 3 : 1),
      sections: indoor
        ? [
            topic.name.replace(/brand$/i, ""),
            "Nebenbereich",
            "Treppenraum / Fluchtweg",
            "Obergeschoss",
            "Dachbereich",
          ]
        : [
            "Ausgangsbereich",
            topic.family === "vegetation"
              ? "Angrenzende Vegetation"
              : "Angrenzende Fassade",
            "Nachbarbereich",
          ],
    };
    if (r.foam) hazard("fuel", "foam", 25 + severity * 8);
    if (indoor && severity >= 2) hazard("collapse", "fire", 18, 0.015);
    profile.followups.push({
      template: topic.family === "small-fire" ? "flat" : "sick",
      trigger: "fire",
      threshold: 76,
      delay: 120,
    });
  }
  if (r.hazmat) hazard("hazmat", "hazmat");
  if (r.measure) hazard("uncertainty", "measure", 30, 0);
  if (r.decon) hazard("contamination", "decon", 40, 0.015);
  if (has("gas")) hazard("gas", "hazmat", 35, 0.02);
  if (r.rescue) hazard("technical", "rescue", 20 + severity * 6, 0.006);
  if (r.technical) hazard("collapse", "technical", 25, 0.008);
  if (r.pump) hazard("water", "pump", 30 + severity * 6, 0.03);
  if (r.diver) hazard("water", "diver", 36, 0.012);
  if (r.police)
    hazard(
      has("violence") || has("armed")
        ? "violence"
        : topic.family === "traffic" || has("traffic")
          ? "traffic"
          : "security",
      "police",
      has("armed") ? 48 : 25,
      has("armed") ? 0.02 : 0.003,
    );
  if (r.crowd) hazard("crowd", "crowd", 30);
  if (r.care) hazard("exposure", "care", 25, 0.01);
  if (r.power) hazard("electricity", "power", 32, 0.005);
  if (r.lighting) hazard("visibility", "lighting", 30, 0);
  if (has("tunnel")) hazard("visibility", "air", 35, 0.015);
  if (has("spill")) hazard("fuel", "rescue", 30, 0.01);
  // 12 profile hazards + 3 weather/light hazards fit the established 15-hazard snapshot.
  if (profile.hazards.length > 12)
    throw Error(`Zu viele Profilgefahren: ${topic.id}.`);
  if (has("storm"))
    profile.followups.push({
      template: "crash",
      trigger: "technical",
      threshold: 65,
      delay: 90,
    });
  if (has("electrical"))
    profile.followups.push({
      template: "supply",
      trigger: "electricity",
      threshold: 65,
      delay: 120,
    });
  if (topic.family === "hazmat")
    profile.followups.push({
      template: "sick",
      trigger: "hazmat",
      threshold: 70,
      delay: 120,
    });
  if (patients >= 4) profile.major = "manv";
  else if (severity === 3 && extended)
    profile.major = burning
      ? "fire"
      : topic.family === "flood"
        ? "flood"
        : topic.family === "crowd"
          ? "crowd"
          : has("storm") || topic.family === "supply"
            ? "storm"
            : undefined;
  if (profile.major) need("command");
  const variantText = extended
    ? "Lage ausgeweitet"
    : access
      ? "Zugang erschwert"
      : "erste Meldung";
  profile.observations = [
    `${topic.name} im ${siteNames[topic.site]}. ${access ? "Der unmittelbare Zugang ist versperrt; technische Rettung wird benötigt." : extended ? "Mehrere Bereiche sind betroffen; zusätzliche Kräfte werden benötigt." : "Der Schaden erscheint zunächst örtlich begrenzt."}`,
    patients
      ? `Eine weitere anrufende Person bestätigt ${patients} Betroffene. ${has("unconscious") || has("cpr") ? "Mindestens eine Person reagiert nicht." : "Medizinische Hilfe wird benötigt."}`
      : burning
        ? "Weitere Beobachtung: Rauch erreicht den angrenzenden Bereich. Ausbreitung und Fluchtwege müssen erkundet werden."
        : "Weitere Beobachtung: Der betroffene Bereich ist nicht sicher zugänglich. Die Absicherung muss erweitert werden.",
    profile.fire
      ? `Gemeldet wird brennendes Material aus dem Bereich ${profile.fire.fuel}; die tatsächliche Ausdehnung wird erst durch die Erkundung bestätigt.`
      : r.measure
        ? "Die Stoffidentität ist noch unklar. Messergebnisse stehen aus."
        : r.care
          ? "Weitere unversorgte Personen benötigen einen sicheren Aufenthaltsbereich."
          : "Die Lage wurde aus einer zweiten Blickrichtung beobachtet; der rückwärtige Zugang ist ebenfalls betroffen.",
  ];
  const seconds = 25 + topic.size * 20 + (extended ? 35 : access ? 20 : 0);
  return {
    id: `case-${topic.id}-${variant}`,
    name: `${topic.name} – ${variantText}`,
    org:
      patients && topic.family !== "medical" ? "Verbund" : orgs[topic.family],
    requirements: r,
    seconds,
    reward:
      6000 + Object.values(r).reduce((a, b) => a + b, 0) * 1400 + seconds * 60,
    patients,
    level:
      topic.family === "medical" || patients
        ? 4
        : ["police", "crowd", "traffic"].includes(topic.family)
          ? 7
          : ["supply", "collapse", "flood"].includes(topic.family)
            ? 15
            : topic.family === "water-rescue"
              ? 20
              : topic.family === "hazmat"
                ? 24
                : 1,
    water: !!r.boat,
    description: profile.observations[0],
    profile,
  };
}
/** Static, versioned IDs retain the chosen situation across saves and reconnects. */
export const incidentVariants: Template[] = [
  ...new Map(incidentTopics.map((t) => [t.id, t])).values(),
].flatMap((t) =>
  (["reported", "access", "extended"] as const).map((variant) =>
    buildIncidentVariant(t, variant),
  ),
);
