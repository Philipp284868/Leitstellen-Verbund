import type { z } from "zod";
import { mt } from "../shared/catalog";
import { projectRoad, querySites } from "../shared/germany/world";
import type { Save } from "../shared/model";
import { nodes } from "../shared/world";
import type { environmentSchema } from "./dynamics-schema";
import { DYNAMICS, sample } from "./random";
import {
  localSituation,
  situationStrength,
  situationAffects,
  type WorldSituation,
} from "./world-situation";
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
  return {
    version: 1,
    period,
    kind,
    temperature,
    wind,
    rain,
    visibility,
    density,
    roads: [],
  };
}
export function updateWeather(s: Save) {
  const changed =
    !s.environment ||
    s.environment.period !== Math.floor(s.time / DYNAMICS.weatherPeriod);
  if (changed) {
    s.environment = environmentAt(s.time);
    if (s.buildings.length) {
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
  applySituationWeather(s);
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
    let best: [number, number];
    let roadId: string | undefined;
    let roadName: string | undefined;
    {
      try {
        const section = projectRoad(m.pos).section;
        best = [section.a, section.b];
        roadId = section.id;
        roadName = section.name.slice(0, 256);
      } catch {
        continue;
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
/** Weather is derived from the shared timeline. Local road damage remains until
 * its incident is resolved, even after the weather has recovered. */
function applySituationWeather(s: Save) {
  if (!s.worldSituation || !s.environment) return;
  const e = s.environment,
    state = localSituation(s);
  Object.assign(e, situationWeather(e, state));
  for (const r of e.roads.filter(
    (r) => r.id.startsWith("road-") && r.kind === "jam",
  )) {
    const point = r.position ?? nodes[r.edge[0]];
    const affected = point && situationAffects(s.worldSituation, point);
    const strength = affected ? situationStrength(s.worldSituation) : 0;
    r.delay =
      90 +
      Math.round(
        90 *
          strength *
          (s.worldSituation.profile === "normal" ||
          s.worldSituation.profile === "quiet"
            ? 0
            : 1),
      );
  }
}
function situationWeather(
  e: NonNullable<Save["environment"]>,
  state: WorldSituation | undefined,
) {
  e = { ...e };
  e.kind = "cloud";
  e.wind = 12;
  e.rain = 0;
  e.visibility = 15000;
  const month = new Date(
    (state?.clock ?? e.period * DYNAMICS.weatherPeriod) * 1000,
  ).getUTCMonth();
  e.temperature =
    month < 2 || month > 10 ? 4 : month >= 5 && month <= 7 ? 24 : 15;
  if (!state) return e;
  const strength = situationStrength(state);
  if (strength <= 0 || ["quiet", "normal"].includes(state.profile)) return e;
  if (state.profile === "storm") {
    e.kind = "gale";
    e.wind = 30 + 55 * strength;
    e.rain = 35 * strength;
  }
  if (state.profile === "rain") {
    e.kind = "heavy-rain";
    e.rain = 35 + 50 * strength;
    e.wind = 20 + 10 * strength;
  }
  if (state.profile === "heat") {
    e.kind = "heat";
    e.temperature = 28 + 9 * strength;
    e.rain = 0;
  }
  if (state.profile === "winter") {
    e.kind = "ice";
    e.temperature = -2 - 5 * strength;
    e.visibility = 900;
  }
  if (e.rain > 50) e.visibility = 900;
  return e;
}
/** Route legs use their physical region, including helpers arriving from outside. */
export function weatherAtPoint(
  s: Save,
  point: {
    x: number;
    y: number;
  },
) {
  if (!s.worldSituation || !s.environment) return s.environment;
  return situationWeather(
    s.environment,
    situationAffects(s.worldSituation, point) ? s.worldSituation : undefined,
  );
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
      (hour >= 22 || hour < 6) &&
      (profile.family === "structure-fire" ||
        profile.family === "medical" ||
        has("burglary"))
    )
      weight *= 1.5;
    if (month >= 2 && month <= 4 && (has("allergy") || has("spring")))
      weight *= 2;
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
