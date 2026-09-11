import { z } from "zod";
import type { Save } from "../model";
import type { Template } from "../catalog";
import { sample } from "./random";

export const situationProfiles = [
  "quiet",
  "normal",
  "storm",
  "rain",
  "heat",
  "winter",
] as const;
export const situationNames = {
  quiet: "Ruhig",
  normal: "Normalbetrieb",
  storm: "Sturm",
  rain: "Starkregen / Hochwasser",
  heat: "Hitze / Trockenheit",
  winter: "Winterglätte",
};
export const situationPhases = [
  "announcement",
  "rising",
  "peak",
  "fading",
  "recovery",
] as const;
export const situationPhaseNames = {
  announcement: "Ankündigung",
  rising: "zunehmend",
  peak: "Hauptphase",
  fading: "abklingend",
  recovery: "Erholung",
};
const time = z.number().finite().nonnegative();
export const situationScopeSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("world"), name: z.string().min(1).max(100) })
    .strict(),
  z
    .object({
      kind: z.literal("circle"),
      name: z.string().min(1).max(100),
      x: time,
      y: time,
      radius: time.positive().max(200000),
    })
    .strict(),
]);
export const worldSituationSchema = z
  .object({
    version: z.literal(1),
    dynamic: z
      .object({
        version: z.literal(1),
        nextAt: time,
        steps: z.number().int().nonnegative(),
        pressure: z.number().min(0).max(1),
        trend: z.enum(["steady", "rising", "falling"]),
      })
      .strict()
      .optional(),
    id: z.string().min(1).max(100),
    seed: z.number().int().nonnegative(),
    sequence: z.number().int().nonnegative(),
    clock: time,
    started: time,
    profile: z.enum(situationProfiles),
    intensity: z.number().min(0.5).max(1),
    scope: situationScopeSchema,
    phase: z.enum(situationPhases),
    phaseStarted: time,
    ends: time,
    history: z
      .array(
        z
          .object({
            id: z.string(),
            profile: z.enum(situationProfiles),
            started: time,
            ended: time,
            scope: situationScopeSchema,
          })
          .strict(),
      )
      .max(24),
  })
  .strict();
export type WorldSituation = z.infer<typeof worldSituationSchema>;
export type SituationProfile = WorldSituation["profile"];
export const SITUATION_POLICY = {
  // Game durations, not forecasts or official warning levels.
  durations: [600, 900, 1800, 900, 1800],
  phaseStrength: {
    announcement: 0,
    rising: 0.5,
    peak: 1,
    fading: 0.35,
    recovery: 0,
  },
  maximumCatchup: 14400,
} as const;
export function situationTimeline(state: WorldSituation) {
  let at = state.started;
  return situationPhases.map((phase, i) => {
    const start = at;
    at += SITUATION_POLICY.durations[i];
    return { phase, start, end: at };
  });
}
function phaseAt(state: WorldSituation) {
  const line = situationTimeline(state);
  const phase = line.find((p) => state.clock < p.end) ?? line.at(-1)!;
  state.phase = phase.phase;
  state.phaseStarted = phase.start;
  state.ends = line.at(-1)!.end;
  return state;
}
export function createSituation(
  clock: number,
  seed = 29092026,
  profile: SituationProfile = "quiet",
  scope: WorldSituation["scope"] = {
    kind: "world",
    name: "Gesamte Serverwelt",
  },
  sequence = 0,
): WorldSituation {
  const state = phaseAt({
    version: 1,
    id: `situation-${sequence}-${seed}`,
    seed,
    sequence,
    clock,
    started: clock,
    profile,
    intensity: 0.65 + sample(seed, "situation-intensity", sequence) * 0.35,
    scope,
    phase: "announcement",
    phaseStarted: clock,
    ends: clock,
    history: [],
  });
  state.dynamic = {
    version: 1,
    nextAt:
      clock +
      180 +
      Math.floor(sample(seed, "situation-change", sequence) * 241),
    steps: 0,
    pressure: profile === "quiet" ? 0.05 : profile === "normal" ? 0.2 : 0.7,
    trend: "steady",
  };
  state.ends = state.dynamic.nextAt;
  state.phase = profile === "quiet" ? "recovery" : "peak";
  return state;
}
export function advanceSituation(input: WorldSituation, seconds: number) {
  const state = structuredClone(input);
  const clock =
    state.clock +
    Math.min(SITUATION_POLICY.maximumCatchup, Math.max(0, seconds));
  // Existing schedules are upgraded once at their saved clock. No old damage,
  // mission or random seed is removed, and subsequent steps are partition-invariant.
  state.dynamic ??= {
    version: 1,
    nextAt: state.clock + 300,
    steps: 0,
    pressure:
      state.profile === "quiet"
        ? 0.05
        : state.profile === "normal"
          ? 0.2
          : situationStrength(state),
    trend: "steady",
  };
  const dynamic = state.dynamic;
  while (clock >= dynamic.nextAt) {
    const at = dynamic.nextAt;
    dynamic.steps++;
    const month = new Date(at * 1000).getUTCMonth();
    const options: SituationProfile[] = [
      "normal",
      "normal",
      "quiet",
      "storm",
      "rain",
      month < 2 || month > 10 ? "winter" : "heat",
    ];
    const previousPressure = dynamic.pressure;
    // Persistent stochastic conditions: no mandatory five-phase cycle.
    const draw = sample(state.seed, "dynamic-profile", dynamic.steps);
    if (draw < 0.16) {
      const profile =
        options[
          Math.floor(
            sample(state.seed, "dynamic-kind", dynamic.steps) * options.length,
          )
        ];
      if (profile !== state.profile) {
        state.history.push({
          id: state.id,
          profile: state.profile,
          started: state.started,
          ended: at,
          scope: state.scope,
        });
        state.history = state.history.slice(-24);
        state.profile = profile;
        state.started = at;
        state.sequence++;
        state.id = `situation-${state.sequence}-${state.seed}`;
      }
    }
    const target =
      state.profile === "quiet"
        ? 0.05
        : state.profile === "normal"
          ? 0.2
          : 0.65;
    dynamic.pressure =
      Math.round(
        Math.max(
          0,
          Math.min(
            1,
            previousPressure +
              (target - previousPressure) * 0.3 +
              (sample(state.seed, "dynamic-pressure", dynamic.steps) - 0.5) *
                0.35,
          ),
        ) * 1000,
      ) / 1000;
    dynamic.trend =
      dynamic.pressure > previousPressure + 0.025
        ? "rising"
        : dynamic.pressure < previousPressure - 0.025
          ? "falling"
          : "steady";
    state.intensity = 0.5 + dynamic.pressure * 0.5;
    state.phase =
      dynamic.trend === "rising"
        ? "rising"
        : dynamic.trend === "falling"
          ? "fading"
          : state.profile === "quiet"
            ? "recovery"
            : "peak";
    state.phaseStarted = at;
    dynamic.nextAt =
      at +
      180 +
      Math.floor(sample(state.seed, "dynamic-spacing", dynamic.steps) * 241);
  }
  state.clock = clock;
  state.ends = dynamic.nextAt;
  return state;
}
export function situationStrength(state: WorldSituation) {
  return state.dynamic
    ? state.dynamic.pressure
    : SITUATION_POLICY.phaseStrength[state.phase] * state.intensity;
}
export function situationLevel(state: WorldSituation) {
  const pressure = situationStrength(state);
  return pressure >= 0.85
    ? "Großlage"
    : pressure >= 0.6
      ? "Schwere Lage"
      : pressure >= 0.3
        ? "Erhöhte Lage"
        : "Normale Lage";
}
export function situationAffects(
  state: WorldSituation | undefined,
  point: { x: number; y: number },
) {
  if (!state) return false;
  const scope = state.scope;
  return (
    scope.kind === "world" ||
    Math.hypot(point.x - scope.x, point.y - scope.y) <= scope.radius
  );
}
export function localSituation(s: Save) {
  const state = s.worldSituation;
  if (
    !state ||
    !s.buildings.some(
      (b) => b.ready <= s.time && situationAffects(state, b.pos),
    )
  )
    return undefined;
  return state;
}
export function situationDemand(s: Save) {
  const state = localSituation(s);
  if (!state) return 1;
  if (!state.dynamic && state.phase === "recovery") return 0.45;
  if (state.profile === "quiet") return 0.55;
  if (state.profile === "normal") return 1;
  return 1 + situationStrength(state) * 3;
}
export function situationCategoryWeight(s: Save, category: string) {
  const state = localSituation(s);
  if (!state || ["quiet", "normal"].includes(state.profile)) return 1;
  const strength = situationStrength(state);
  const favored =
    state.profile === "heat" ? ["medical", "fire"] : ["technical", "medical"];
  return favored.includes(category)
    ? 1 + strength * (category === "technical" ? 1.8 : 0.6)
    : 1;
}
export function situationTemplateWeight(s: Save, t: Template) {
  const state = localSituation(s);
  if (!state) return 1;
  const family = t.profile?.family ?? "",
    tags = t.profile?.tags ?? [];
  const match =
    state.profile === "storm"
      ? tags.includes("storm") ||
        family === "supply" ||
        ["tree", "debris", "power"].includes(t.id)
      : state.profile === "rain"
        ? family === "flood" || ["cellar", "pump", "flood"].includes(t.id)
        : state.profile === "heat"
          ? family === "vegetation" || tags.includes("heat")
          : state.profile === "winter"
            ? family === "traffic" || tags.includes("cold")
            : false;
  return match ? 1 + situationStrength(state) * 3 : 1;
}
