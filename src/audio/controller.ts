import { useSyncExternalStore } from "react";
import { BEAT, SoundGraph, type Cue } from "./synth";
import {
  defaultChannels,
  channelFor,
  customChannel,
  type CustomChannel,
  type SoundChannel,
} from "./profiles";
import { StreamedSignal } from "./stream";
import {
  customSounds,
  storeSound,
  loadSound,
  inspectSound,
  soundStorage,
  type SoundInfo,
} from "./custom";
export interface SoundPreferences {
  masterVolume: number;
  channels: Record<SoundChannel, number>;
  muted: boolean;
  music: boolean;
  effects: boolean;
  musicVolume: number;
  effectsVolume: number;
}
export const defaultSound: SoundPreferences = {
  masterVolume: 100,
  channels: { ...defaultChannels },
  muted: false,
  music: true,
  effects: true,
  musicVolume: 35,
  effectsVolume: 65,
};
const KEY = "lv-audio-v1";
export function parseSound(value: string | null): SoundPreferences {
  try {
    const v = JSON.parse(value ?? "{}");
    const volume = (v: unknown, fallback: number) =>
      typeof v === "number" && Number.isFinite(v)
        ? Math.max(0, Math.min(100, v))
        : fallback;
    return {
      masterVolume: volume(v.masterVolume, 100),
      channels: Object.fromEntries(
        Object.entries(defaultChannels).map(([k, n]) => [
          k,
          volume(v.channels?.[k], n),
        ]),
      ) as Record<SoundChannel, number>,
      muted: typeof v.muted === "boolean" ? v.muted : false,
      music: typeof v.music === "boolean" ? v.music : true,
      effects: typeof v.effects === "boolean" ? v.effects : true,
      musicVolume:
        typeof v.musicVolume === "number" && Number.isFinite(v.musicVolume)
          ? Math.max(0, Math.min(100, v.musicVolume))
          : 35,
      effectsVolume:
        typeof v.effectsVolume === "number" && Number.isFinite(v.effectsVolume)
          ? Math.max(0, Math.min(100, v.effectsVolume))
          : 65,
    };
  } catch {
    return { ...defaultSound };
  }
}
type Status = "waiting" | "playing" | "paused" | "muted" | "unavailable";
class AudioController {
  private custom = new Map<CustomChannel, SoundInfo>();
  private stream: StreamedSignal | null = null;
  private playingChannel: SoundChannel | null = null;
  private playback = 0;
  private protectedUntil = 0;
  private refreshing: Promise<void> | null = null;
  private context: AudioContext | null = null;
  private graph: SoundGraph | null = null;
  private active = false;
  private focused = false;
  private ownsAudio = true;
  private channel: BroadcastChannel | null = null;
  private unlocked = false;
  private inGame = false;
  private beat = 0;
  private next = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private recent = new Map<Cue, number>();
  private snapshot: {
    preferences: SoundPreferences;
    status: Status;
    customNames: Partial<Record<SoundChannel, string>>;
    customSounds: SoundInfo[];
    playing: string;
  } = {
    preferences: (() => {
      try {
        return parseSound(localStorage.getItem(KEY));
      } catch {
        return { ...defaultSound };
      }
    })(),
    status: "waiting",
    customNames: {},
    customSounds: [],
    playing: "",
  };
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  };
  state = () => this.snapshot;
  private notify(status = this.snapshot.status) {
    if (status === this.snapshot.status) return;
    this.snapshot = { ...this.snapshot, status };
    this.listeners.forEach((f) => f());
  }
  preferences(change: Partial<SoundPreferences>) {
    this.snapshot = {
      ...this.snapshot,
      preferences: parseSound(
        JSON.stringify({ ...this.snapshot.preferences, ...change }),
      ),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.snapshot.preferences));
    } catch {
      /* settings still work for this visit */
    }
    this.listeners.forEach((f) => f());
    this.sync();
  }
  scene(inGame: boolean) {
    this.inGame = inGame;
  }
  session(active: boolean) {
    this.active = active;
    if (!active) {
      this.beat = 0;
      this.recent.clear();
    }
    this.sync();
  }
  private wanted() {
    return (
      this.active &&
      this.ownsAudio &&
      this.unlocked &&
      !this.snapshot.preferences.muted &&
      document.visibilityState === "visible" &&
      this.focused
    );
  }
  async unlock() {
    if (!this.active || this.snapshot.preferences.muted) return;
    try {
      if (!this.context) {
        if (typeof AudioContext === "undefined") {
          this.notify("unavailable");
          return;
        }
        this.context = new AudioContext();
        this.graph = new SoundGraph(this.context);
        this.stream = new StreamedSignal(this.context, this.graph.effects);
        void this.refreshCustom().catch(() => {});
        this.context.onstatechange = () => {
          if (this.context?.state === "running" && this.wanted())
            this.notify("playing");
          else if (
            this.context?.state !== "running" &&
            this.snapshot.status === "playing"
          )
            this.notify("paused");
        };
      }
      this.unlocked = true;
      this.focused = true;
      this.claim();
      if (this.wanted()) await this.context.resume();
      this.sync();
    } catch {
      this.notify("unavailable");
    }
  }
  toggle() {
    if (
      this.snapshot.status === "waiting" ||
      this.snapshot.status === "unavailable" ||
      this.snapshot.status === "paused"
    ) {
      this.preferences({ muted: false });
      void this.unlock();
    } else {
      this.preferences({ muted: !this.snapshot.preferences.muted });
      if (!this.snapshot.preferences.muted) void this.unlock();
    }
  }
  private sync = () => {
    const c = this.context,
      p = this.snapshot.preferences;
    this.graph?.volumes(
      p.music ? (p.musicVolume * p.masterVolume) / 10000 : 0,
      p.effects ? (p.effectsVolume * p.masterVolume) / 10000 : 0,
    );
    if (
      !p.effects ||
      !p.effectsVolume ||
      !p.masterVolume ||
      (this.playingChannel && !p.channels[this.playingChannel])
    )
      this.stopCustom();
    else if (this.playingChannel)
      this.stream?.volume(p.channels[this.playingChannel] / 100);
    if (!c) {
      if (this.snapshot.status !== "unavailable")
        this.notify(p.muted ? "muted" : "waiting");
      return;
    }
    if (!this.wanted()) {
      this.stopCustom();
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.graph?.stop();
      this.next = 0;
      void c.suspend().catch(() => {});
      this.notify(p.muted ? "muted" : "paused");
      return;
    }
    if (c.state !== "running") {
      void c
        .resume()
        .then(() => {
          if (c.state === "running") this.sync();
          else this.notify("paused");
        })
        .catch(() => this.notify("unavailable"));
      return;
    }
    this.notify("playing");
    if (!this.timer) {
      this.next = c.currentTime + 0.06;
      this.pump();
      this.timer = setInterval(this.pump, 100);
    }
  };
  private pump = () => {
    const c = this.context;
    if (!c || !this.wanted() || c.state !== "running") return;
    if (this.next < c.currentTime - 0.1) this.next = c.currentTime + 0.03;
    while (this.next < c.currentTime + 0.18) {
      const p = this.snapshot.preferences;
      if (p.music && p.musicVolume > 0)
        this.graph?.beat(this.beat, this.next, this.inGame);
      this.beat = (this.beat + 1) % 256;
      this.next += BEAT;
    }
  };
  cue(cue: Cue) {
    const c = this.context,
      p = this.snapshot.preferences;
    if (
      !c ||
      c.state !== "running" ||
      !this.wanted() ||
      !p.effects ||
      !p.masterVolume ||
      p.effectsVolume === 0
    )
      return;
    const now = c.currentTime,
      interval =
        cue === "click"
          ? 0.08
          : cue === "radio"
            ? 2
            : cue === "error"
              ? 1
              : 1.2;
    const protectedCue = cue === "priority" || cue === "emergency";
    if (now < this.protectedUntil && cue !== "emergency") return;
    if (now - (this.recent.get(cue) ?? -Infinity) < interval) return;
    this.recent.set(cue, now);
    const channel = channelFor(cue),
      level = p.channels[channel] / 100;
    if (!level) return;
    if (protectedCue) {
      this.stopCustom();
      this.protectedUntil = now + 1.2;
      this.graph?.cue(cue, undefined, level);
    } else if (customChannel(channel) && this.custom.get(channel)?.enabled) {
      this.stopCustom();
      const token = this.playback;
      const fallback = () => {
        if (token === this.playback && this.wanted()) {
          this.stopCustom();
          this.graph?.cue(cue, undefined, level);
        }
      };
      void loadSound(channel)
        .then(async (sound) => {
          if (token !== this.playback || !this.wanted()) return;
          if (!sound?.enabled) {
            this.graph?.cue(cue, undefined, level);
            return;
          }
          this.playingChannel = channel;
          this.snapshot = { ...this.snapshot, playing: sound.name };
          this.listeners.forEach((f) => f());
          await this.stream?.play(
            sound.blob,
            level,
            () => this.stopCustom(),
            fallback,
          );
        })
        .catch(fallback);
    } else this.graph?.cue(cue, undefined, level);
  }
  async preview(cue: Cue) {
    await this.unlock();
    const delay = this.protectedUntil - (this.context?.currentTime ?? 0);
    if (delay > 0 && cue !== "emergency")
      await new Promise<void>((resolve) =>
        setTimeout(resolve, delay * 1000 + 20),
      );
    // Explicit testing must work even just after a normal event of the same kind.
    this.recent.delete(cue);
    this.cue(cue);
  }
  stopCustom() {
    this.playback++;
    this.stream?.stop();
    this.playingChannel = null;
    if (this.snapshot.playing) {
      this.snapshot = { ...this.snapshot, playing: "" };
      this.listeners.forEach((f) => f());
    }
  }
  refreshCustom() {
    if (!this.refreshing)
      this.refreshing = customSounds()
        .then((sounds) => {
          this.custom = new Map(sounds.map((sound) => [sound.channel, sound]));
          this.snapshot = {
            ...this.snapshot,
            customSounds: sounds,
            customNames: Object.fromEntries(
              sounds.map((sound) => [sound.channel, sound.name]),
            ),
          };
          this.listeners.forEach((f) => f());
        })
        .finally(() => {
          this.refreshing = null;
        });
    return this.refreshing;
  }
  async setCustom(channel: CustomChannel, file?: File) {
    if (!customChannel(channel))
      throw Error("Prioritäts- und Notfallsignale bleiben im Original.");
    if (!file) {
      await storeSound(channel);
    } else {
      const quota = await soundStorage();
      const old = (await customSounds()).find(
        (sound) => sound.channel === channel,
      );
      if (quota && file.size > quota.free + (old?.bytes ?? 0))
        throw Error(
          "Für diese Datei reicht der geschätzte freie Browserspeicher nicht. Die bisherige Datei bleibt erhalten.",
        );
      const duration = await inspectSound(file);
      await storeSound(channel, {
        channel,
        name: file.name.slice(0, 160),
        blob: file,
        bytes: file.size,
        duration,
        enabled: true,
      });
    }
    this.stopCustom();
    await this.refreshing;
    await this.refreshCustom();
    this.channel?.postMessage("sounds-changed");
  }
  async enableCustom(channel: CustomChannel, enabled: boolean) {
    const value = await loadSound(channel);
    if (!value) return;
    await storeSound(channel, { ...value, enabled });
    this.stopCustom();
    await this.refreshing;
    await this.refreshCustom();
    this.channel?.postMessage("sounds-changed");
  }
  async assignCustom(from: CustomChannel, to: CustomChannel) {
    const value = await loadSound(from);
    if (!value) throw Error("Diese lokale Datei ist nicht mehr vorhanden.");
    await storeSound(to, { ...value, channel: to, enabled: true });
    this.stopCustom();
    await this.refreshing;
    await this.refreshCustom();
    this.channel?.postMessage("sounds-changed");
  }
  private claim() {
    if (!this.active || !this.unlocked || this.snapshot.preferences.muted)
      return;
    this.ownsAudio = true;
    this.channel?.postMessage("claim");
  }
  listen() {
    try {
      if (typeof BroadcastChannel !== "undefined") {
        this.channel = new BroadcastChannel("lv-audio-focus-v1");
        this.channel.onmessage = (e) => {
          if (e.data === "sounds-changed") {
            this.stopCustom();
            void this.refreshCustom().catch(() => {});
          }
          if (e.data === "claim") {
            this.ownsAudio = false;
            this.sync();
          }
        };
      }
    } catch {
      this.channel = null;
    }
    const gesture = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(".sound-toggle"))
        return;
      if (e.isTrusted) void this.unlock();
    };
    const visibility = () => this.sync();
    const blur = () => {
      this.focused = false;
      this.sync();
    };
    const focus = () => {
      this.focused = true;
      this.claim();
      this.sync();
    };
    const click = (e: MouseEvent) => {
      if (
        e.isTrusted &&
        e.target instanceof Element &&
        e.target.closest(".app button:not(:disabled), .app summary") &&
        !e.target.closest(".sound-toggle, .sound-preview")
      )
        this.cue("click");
    };
    const storage = (e: StorageEvent) => {
      if (e.key === KEY) {
        this.snapshot = {
          ...this.snapshot,
          preferences: parseSound(e.newValue),
        };
        this.listeners.forEach((f) => f());
        this.sync();
      }
    };
    window.addEventListener("click", gesture);
    window.addEventListener("keydown", gesture);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", focus);
    window.addEventListener("click", click);
    window.addEventListener("blur", blur);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("click", gesture);
      window.removeEventListener("keydown", gesture);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", focus);
      window.removeEventListener("click", click);
      this.channel?.close();
      this.channel = null;
      window.removeEventListener("blur", blur);
      window.removeEventListener("storage", storage);
      this.session(false);
    };
  }
}
export const audio = new AudioController();
export const useSound = () =>
  useSyncExternalStore(audio.subscribe, audio.state);
