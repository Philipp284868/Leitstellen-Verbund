import type { Cue } from "./synth";
export const channels = {
  pager: "Pieper",
  siren: "Sirene",
  radio: "Funk",
  phone: "Telefon",
  gong: "Alarmgong",
  events: "Ereignisse",
};
export type SoundChannel = keyof typeof channels;
export const channelFor = (cue: Cue): SoundChannel =>
  cue === "dme"
    ? "pager"
    : cue === "siren"
      ? "siren"
      : cue === "station"
        ? "gong"
        : ["radio", "arrival", "return", "priority"].includes(cue)
          ? "radio"
          : ["phone", "mission"].includes(cue)
            ? "phone"
            : "events";
export const previewCue: Record<SoundChannel, Cue> = {
  pager: "dme",
  siren: "siren",
  radio: "radio",
  phone: "phone",
  gong: "station",
  events: "complete",
};
export const defaultChannels = {
  pager: 100,
  siren: 100,
  radio: 100,
  phone: 100,
  gong: 100,
  events: 100,
};
export const mixes = {
  standard: {
    name: "Standard",
    masterVolume: 100,
    musicVolume: 35,
    effectsVolume: 65,
    channels: defaultChannels,
  },
  night: {
    name: "Ruhige Nachtschicht",
    masterVolume: 75,
    musicVolume: 25,
    effectsVolume: 50,
    channels: {
      pager: 65,
      siren: 40,
      radio: 85,
      phone: 75,
      gong: 65,
      events: 40,
    },
  },
  radio: {
    name: "Funk im Vordergrund",
    masterVolume: 100,
    musicVolume: 15,
    effectsVolume: 70,
    channels: {
      pager: 80,
      siren: 65,
      radio: 100,
      phone: 90,
      gong: 75,
      events: 45,
    },
  },
};
