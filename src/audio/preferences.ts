import { defaultChannels, type SoundChannel } from "./profiles";

export const AUDIO_SETTINGS_KEY = "lv-audio-v1";
export const mixerGroups = {
  music: "Musik",
  ambience: "Leitstellenumgebung",
  phone: "Telefon",
  radio: "Funk / Sprache",
  alarm: "Alarmierung",
  ui: "UI / Hinweise",
} as const;
export type MixerGroup = keyof typeof mixerGroups;
export interface SoundPreferences {
  version: 2;
  masterVolume: number;
  channels: Record<SoundChannel, number>;
  channelMuted: Record<SoundChannel, boolean>;
  groupVolumes: Record<MixerGroup, number>;
  groupMuted: Record<MixerGroup, boolean>;
  muted: boolean;
  music: boolean;
  effects: boolean;
  musicVolume: number;
  effectsVolume: number;
  background: "pause" | "communications" | "continue";
  ducking: boolean;
  parallelRadio: boolean;
}
export const defaultSound: SoundPreferences = {
  version: 2,
  masterVolume: 100,
  channels: { ...defaultChannels },
  channelMuted: Object.fromEntries(
    Object.keys(defaultChannels).map((k) => [k, false]),
  ) as Record<SoundChannel, boolean>,
  groupVolumes: {
    music: 100,
    ambience: 25,
    phone: 100,
    radio: 100,
    alarm: 100,
    ui: 75,
  },
  groupMuted: {
    music: false,
    ambience: false,
    phone: false,
    radio: false,
    alarm: false,
    ui: false,
  },
  muted: false,
  music: true,
  effects: true,
  musicVolume: 35,
  effectsVolume: 65,
  background: "pause",
  ducking: true,
  parallelRadio: false,
};
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const volume = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.round(Math.max(0, Math.min(100, v)))
    : fallback;
const bool = (v: unknown, fallback: boolean) =>
  typeof v === "boolean" ? v : fallback;
export function parseSound(value: string | null): SoundPreferences {
  let v: Record<string, unknown> = {};
  try {
    v = object(JSON.parse(value ?? "{}"));
  } catch {
    /* Invalid legacy settings receive safe defaults. */
  }
  return {
    version: 2,
    masterVolume: volume(v.masterVolume, defaultSound.masterVolume),
    channels: Object.fromEntries(
      Object.entries(defaultChannels).map(([k, n]) => [
        k,
        volume(object(v.channels)[k], n),
      ]),
    ) as Record<SoundChannel, number>,
    channelMuted: Object.fromEntries(
      Object.keys(defaultChannels).map((k) => [
        k,
        bool(object(v.channelMuted)[k], false),
      ]),
    ) as Record<SoundChannel, boolean>,
    groupVolumes: Object.fromEntries(
      Object.entries(defaultSound.groupVolumes).map(([k, n]) => [
        k,
        volume(object(v.groupVolumes)[k], n),
      ]),
    ) as Record<MixerGroup, number>,
    groupMuted: Object.fromEntries(
      Object.keys(mixerGroups).map((k) => [
        k,
        bool(object(v.groupMuted)[k], false),
      ]),
    ) as Record<MixerGroup, boolean>,
    muted: bool(v.muted, false),
    music: bool(v.music, true),
    effects: bool(v.effects, true),
    musicVolume: volume(v.musicVolume, 35),
    effectsVolume: volume(v.effectsVolume, 65),
    background: ["pause", "communications", "continue"].includes(
      String(v.background),
    )
      ? (v.background as SoundPreferences["background"])
      : "pause",
    ducking: bool(v.ducking, true),
    parallelRadio: bool(v.parallelRadio, false),
  };
}
export function groupLevel(
  p: SoundPreferences,
  group: MixerGroup,
  hidden = false,
) {
  if (p.muted || p.groupMuted[group] || (hidden && p.background === "pause"))
    return 0;
  if (
    hidden &&
    p.background === "communications" &&
    ["music", "ambience", "ui"].includes(group)
  )
    return 0;
  const gain = p.groupVolumes[group] / 100;
  return group === "music"
    ? p.music
      ? (gain * p.musicVolume) / 100
      : 0
    : p.effects
      ? (gain * p.effectsVolume) / 100
      : 0;
}

export function exportSoundPreferences(preferences: SoundPreferences) {
  return JSON.stringify(
    {
      format: "leitstellen-audio-settings",
      version: 2,
      preferences: parseSound(JSON.stringify(preferences)),
    },
    null,
    2,
  );
}
/** Import is a nonmutating migration/preview; applying remains the caller's explicit action. */
export function importSoundPreferences(text: string): SoundPreferences {
  if (new TextEncoder().encode(text).length > 64 * 1024)
    throw Error(
      "Die Audiodatei mit Einstellungen ist zu groß. Erwartet wird eine kleine JSON-Sicherung, keine Musikdatei.",
    );
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error("Keine gültige JSON-Sicherung der Audioeinstellungen.");
  }
  const record = object(value);
  if (
    record.format !== "leitstellen-audio-settings" ||
    (record.version !== 1 && record.version !== 2) ||
    !record.preferences ||
    typeof record.preferences !== "object" ||
    Array.isArray(record.preferences)
  )
    throw Error(
      "Diese Datei ist keine unterstützte Sicherung der Audioeinstellungen.",
    );
  return parseSound(JSON.stringify(record.preferences));
}
