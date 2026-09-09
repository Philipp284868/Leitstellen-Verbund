import type { Save } from "../model";
import { IS_GERMANY } from "../world-choice";
import { projectRoad, querySites } from "../germany/world";
import { edges, nodes, distance } from "../world";
import { DYNAMICS, sample } from "./random";
import { mt } from "../catalog";
import type { z } from "zod";
import type { environmentSchema } from "./dynamics-schema";
export const weatherNames = {
  sun: "Sonnig",
  cloud: "Bewölkt",
  rain: "Regen",
  "heavy-rain": "Starkregen",
  storm: "Gewitter",
  gale: "Sturm",
  hurricane: "Orkan",
  fog: "Nebel",
  snow: "Schnee",
  ice: "Glatteis",
  heat: "Hitze",
  frost: "Frost",
};
export const roadNames = {
  jam: "Stau",
  construction: "Baustelle",
  accident: "Unfall",
  closure: "Vollsperrung",
  obstacle: "Hindernis",
  crossing: "Bahnübergang",
  flood: "Überflutete Straße",
};
export function environmentAt(time: number): z.infer<typeof environmentSchema> {
  const period = Math.floor(time / DYNAMICS.weatherPeriod),
    day = new Date(time * 1000),
    month = day.getUTCMonth(),
    hour = day.getUTCHours(),
    winter = month < 2 || month > 10,
    summer = month >= 5 && month <= 7;
  const options: (keyof typeof weatherNames)[] = [
    "sun",
    "sun",
    "cloud",
    "cloud",
    "rain",
    "rain",
    "heavy-rain",
    "fog",
    "storm",
    "gale",
    winter ? "snow" : "sun",
    winter ? "ice" : summer ? "heat" : "cloud",
    winter ? "frost" : "sun",
  ];
  const draw = sample(27082026, "weather", period);
  const kind =
    draw > 0.998 ? "hurricane" : options[Math.floor(draw * options.length)];
  const wind =
    kind === "hurricane"
      ? 125
      : kind === "gale"
        ? 80
        : kind === "storm"
          ? 60
          : 8 + Math.floor(sample(27082026, "wind", period) * 20);
  const rain =
    kind === "heavy-rain"
      ? 80
      : kind === "storm"
        ? 60
        : kind === "rain"
          ? 35
          : 0;
  const visibility =
    kind === "fog" ? 150 : kind === "snow" ? 500 : rain > 50 ? 900 : 15000;
  const density =
    (hour >= 7 && hour < 9) || (hour >= 16 && hour < 19)
      ? 1.7
      : hour < 6 || hour > 22
        ? 0.35
        : 0.9;
  const temperature =
    kind === "heat"
      ? 36
      : kind === "ice" || kind === "frost"
        ? -5
        : kind === "snow"
          ? -1
          : winter
            ? 4
            : summer
              ? 24
              : 15;
  const eventKinds = [
    "jam",
    "construction",
    "accident",
    "closure",
    "obstacle",
    "crossing",
    "flood",
  ] as const;
  const roads = Array.from({ length: IS_GERMANY ? 0 : 3 }, (_, n) => {
    const kind =
      eventKinds[
        Math.floor(
          sample(27082026, `road-kind-${n}`, period) * eventKinds.length,
        )
      ];
    return {
      id: `road-${period}-${n}`,
      kind,
      edge: edges[
        Math.floor(sample(27082026, `road-edge-${n}`, period) * edges.length)
      ],
      start: period * DYNAMICS.weatherPeriod,
      until: (period + 1) * DYNAMICS.weatherPeriod,
      delay: kind === "crossing" ? 45 : 90,
      blocked: kind === "closure" || kind === "flood",
    };
  });
  return {
    version: 1,
    period,
    kind,
    temperature,
    wind,
    rain,
    visibility,
    density,
    roads,
  };
}
export function updateWeather(s: Save) {
  const changed =
    !s.environment ||
    s.environment.period !== Math.floor(s.time / DYNAMICS.weatherPeriod);
  if (changed) {
    s.environment = environmentAt(s.time);
    if (IS_GERMANY && s.buildings.length) {
      const bases = [...s.buildings].sort((a, b) => a.id.localeCompare(b.id));
      const period = s.environment.period;
      for (let n = 0; n < Math.min(3, bases.length); n++) {
        const sites = querySites(bases[n].pos, 400, 32);
        if (!sites.length) continue;
        const p =
          sites[
            Math.floor(sample(s.seed, `road-site-${n}`, period) * sites.length)
          ];
        try {
          const section = projectRoad(p).section;
          s.environment.roads.push({
            id: `road-${period}-${n}`,
            kind: "jam",
            edge: [section.a, section.b],
            roadId: section.id,
            roadName: section.name.slice(0, 256),
            position: { x: p.x, y: p.y },
            start: period * DYNAMICS.weatherPeriod,
            until: (period + 1) * DYNAMICS.weatherPeriod,
            delay: 90,
            blocked: false,
          });
        } catch {
          /* No verified driveable edge: do not invent a road event. */
        }
      }
    }
  }
  if (!s.environment)
    throw Error("Wetterzustand konnte nicht erstellt werden.");
  // Local incident closures survive weather-period changes and disappear after
  // the corresponding danger has been removed. No unrelated desk is exposed.
  s.environment.roads = s.environment.roads.filter(
    (r) => !r.id.startsWith("major-road:"),
  );
  const related = s.operations.campaign?.missions || [];
  for (const m of s.missions
    .filter(
      (m) =>
        related.includes(m.id) ||
        m.major?.kind === "flood" ||
        m.major?.kind === "storm",
    )
    .slice(0, 6)) {
    if (
      !m.dynamics?.hazards.some(
        (h) =>
          !h.resolved &&
          ["water", "weather", "technical", "electricity", "traffic"].includes(
            h.kind,
          ),
      )
    )
      continue;
    let best = edges[0],
      nearest = Infinity;
    let roadId: string | undefined;
    let roadName: string | undefined;
    if (IS_GERMANY) {
      try {
        const section = projectRoad(m.pos).section;
        best = [section.a, section.b];
        roadId = section.id;
        roadName = section.name.slice(0, 256);
      } catch {
        continue;
      }
    }
    for (const edge of IS_GERMANY ? [] : edges) {
      const d =
        distance(nodes[edge[0]], m.pos) + distance(nodes[edge[1]], m.pos);
      if (d < nearest) {
        best = edge;
        nearest = d;
      }
    }
    s.environment.roads.push({
      id: `major-road:${m.id}`,
      kind:
        m.template === "cellar" || m.major?.kind === "flood"
          ? "flood"
          : "obstacle",
      edge: best,
      ...(roadId
        ? { roadId, roadName, position: { x: m.pos.x, y: m.pos.y } }
        : {}),
      start: m.created,
      until: s.time + 1200,
      delay: 120,
      blocked: true,
    });
  }
}
export function weatherWeight(s: Save, template: string) {
  const kind = s.environment?.kind;
  const profile = mt(template).profile;
  if (profile) {
    const date = new Date(s.time * 1000),
      month = date.getUTCMonth(),
      hour = date.getUTCHours(),
      weekend = [0, 6].includes(date.getUTCDay());
    const has = (tag: string) => profile.tags.includes(tag);
    let weight =
      profile.variant === "reported" ? 4 : profile.variant === "access" ? 2 : 1;
    if (
      ["gale", "hurricane", "storm"].includes(kind || "") &&
      (has("storm") || profile.family === "supply")
    )
      weight *= 3;
    if (
      ["rain", "heavy-rain"].includes(kind || "") &&
      profile.family === "flood"
    )
      weight *= 3;
    if (
      ["rain", "heavy-rain", "ice", "snow", "fog"].includes(kind || "") &&
      profile.family === "traffic"
    )
      weight *= 2;
    if (
      kind === "heat" &&
      (profile.family === "vegetation" ||
        has("heat") ||
        profile.site === "water")
    )
      weight *= 3;
    if (
      ["ice", "snow", "frost"].includes(kind || "") &&
      (has("cold") || profile.family === "traffic")
    )
      weight *= 2;
    if (
      month >= 5 &&
      month <= 7 &&
      (profile.family === "vegetation" ||
        has("heat") ||
        profile.site === "water")
    )
      weight *= 2;
    if ((month < 2 || month > 10) && (has("cold") || has("electrical")))
      weight *= 2;
    if (
      ((month >= 8 && month <= 10) || (month >= 2 && month <= 4)) &&
      has("storm")
    )
      weight *= 2;
    if (profile.site === "public" && (weekend || (hour >= 17 && hour < 23)))
      weight *= 2;
    if (has("children") && !weekend && hour >= 7 && hour < 16) weight *= 3;
    if (has("violence") && (hour >= 21 || hour < 5)) weight *= 2;
    if (
      profile.family === "traffic" &&
      ((hour >= 7 && hour < 9) || (hour >= 16 && hour < 19))
    )
      weight *= 2;
    if (profile.site === "industrial" && !weekend && hour >= 6 && hour < 18)
      weight *= 2;
    return weight;
  }
  if (
    ["gale", "hurricane", "storm"].includes(kind || "") &&
    ["tree", "debris", "power"].includes(template)
  )
    return 3;
  if (
    ["rain", "heavy-rain", "ice", "snow"].includes(kind || "") &&
    ["cellar", "crash", "traffic"].includes(template)
  )
    return 3;
  if (kind === "heat" && ["field", "forest", "sick"].includes(template))
    return 3;
  return 1;
}
