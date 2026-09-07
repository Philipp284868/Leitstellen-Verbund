import type { Save } from "../model";
import { edges } from "../world";
import { DYNAMICS, sample } from "./random";
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
  const roads = Array.from({ length: 3 }, (_, n) => {
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
  if (
    !s.environment ||
    s.environment.period !== Math.floor(s.time / DYNAMICS.weatherPeriod)
  )
    s.environment = environmentAt(s.time);
}
export function weatherWeight(s: Save, template: string) {
  const kind = s.environment?.kind;
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
