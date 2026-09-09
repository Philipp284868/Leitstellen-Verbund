import type { Cue } from "./synth";
import type { MixerGroup } from "./preferences";
export const channels = {
  pager: "Pieper",
  siren: "Sirene",
  radio: "Funk",
  request: "Sprechwunsch",
  priority: "Prioritätsalarm",
  phone: "Telefon",
  gong: "Alarm",
  events: "Ereignisse",
};
export type SoundChannel = keyof typeof channels;
export type CustomChannel = Exclude<SoundChannel, "priority">;
export const customChannel = (channel: string): channel is CustomChannel =>
  Object.hasOwn(channels, channel) && channel !== "priority";
export const channelFor = (cue: Cue): SoundChannel =>
  cue === "priority" || cue === "emergency"
    ? "priority"
    : cue === "request"
      ? "request"
      : cue === "dme"
        ? "pager"
        : cue === "siren"
          ? "siren"
          : cue === "station" || cue === "gong"
            ? "gong"
            : ["radio", "radioOpen", "radioAck", "arrival", "return"].includes(
                  cue,
                )
              ? "radio"
              : ["phone", "mission", "callAccept", "callEnd", "busy"].includes(
                    cue,
                  )
                ? "phone"
                : "events";
export const groupFor = (cue: Cue): MixerGroup => {
  if (cue === "musicMenu" || cue === "musicGame") return "music";
  if (cue === "ambience") return "ambience";
  const channel = channelFor(cue);
  return channel === "phone"
    ? "phone"
    : ["radio", "request", "priority"].includes(channel)
      ? "radio"
      : ["pager", "siren", "gong"].includes(channel)
        ? "alarm"
        : "ui";
};
export const previewCue: Record<SoundChannel, Cue> = {
  pager: "dme",
  siren: "siren",
  radio: "radio",
  request: "request",
  priority: "priority",
  phone: "phone",
  gong: "station",
  events: "complete",
};
export const defaultChannels = {
  pager: 100,
  siren: 100,
  radio: 100,
  request: 100,
  priority: 100,
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
      request: 85,
      priority: 100,
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
      request: 100,
      priority: 100,
      phone: 90,
      gong: 75,
      events: 45,
    },
  },
};
