import { useSyncExternalStore } from "react";
import { BEAT, SoundGraph, type Cue } from "./synth";
export interface SoundPreferences {
  muted: boolean;
  music: boolean;
  effects: boolean;
  musicVolume: number;
  effectsVolume: number;
}
export const defaultSound: SoundPreferences = {
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
    return {
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
  private snapshot: { preferences: SoundPreferences; status: Status } = {
    preferences: (() => {
      try {
        return parseSound(localStorage.getItem(KEY));
      } catch {
        return { ...defaultSound };
      }
    })(),
    status: "waiting",
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
      p.music ? p.musicVolume / 100 : 0,
      p.effects ? p.effectsVolume / 100 : 0,
    );
    if (!c) {
      if (this.snapshot.status !== "unavailable")
        this.notify(p.muted ? "muted" : "waiting");
      return;
    }
    if (!this.wanted()) {
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
    if (now - (this.recent.get(cue) ?? -Infinity) < interval) return;
    this.recent.set(cue, now);
    this.graph?.cue(cue);
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
