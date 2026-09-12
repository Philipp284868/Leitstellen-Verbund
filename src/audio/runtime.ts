import { useSyncExternalStore } from "react";
import { BEAT, SoundGraph, type Cue } from "./synth";
import {
  channelFor,
  customChannel,
  groupFor,
  type CustomChannel,
  type SoundChannel,
} from "./profiles";
import { AudioOwnership } from "./ownership";
import { smooth } from "./mixer";
import { StreamedSignal } from "./stream";
import {
  customSounds,
  storeSound,
  storeSounds,
  loadSound,
  inspectSound,
  soundStorage,
  type CustomSound,
  type SoundInfo,
} from "./custom";
import {
  AUDIO_SETTINGS_KEY,
  groupLevel,
  parseSound,
  importSoundPreferences,
  type MixerGroup,
  type SoundPreferences,
} from "./preferences";
export { defaultSound, parseSound, type SoundPreferences } from "./preferences";

type Status = "waiting" | "playing" | "paused" | "muted" | "unavailable";
type PendingCue = {
  cue: Cue;
  id: string;
  radio: string;
  preview: boolean;
  at: number;
  priority: number;
  interrupted: boolean;
  sequence: number;
};
type Voice = PendingCue & {
  group: MixerGroup;
  channel: SoundChannel;
  custom: boolean;
  name: string;
  gain: GainNode;
  stop: () => void;
  timer?: ReturnType<typeof setTimeout>;
};
const priority = (cue: Cue) =>
  cue === "emergency"
    ? 100
    : cue === "priority"
      ? 90
      : groupFor(cue) === "alarm"
        ? 70
        : ["phone", "request"].includes(cue)
          ? 60
          : groupFor(cue) === "radio"
            ? 50
            : cue === "ambience"
              ? 1
              : 20;
const communication = (cue: Cue) => ["phone", "radio"].includes(groupFor(cue));
const caps: Record<MixerGroup, number> = {
  music: 1,
  ambience: 2,
  phone: 3,
  radio: 1,
  alarm: 4,
  ui: 4,
};

export class AudioController {
  private custom = new Map<CustomChannel, SoundInfo>();
  private staged = new Map<CustomChannel, CustomSound | null>();
  private editing = false;
  private applying = false;
  private editEpoch = 0;
  private fileOperations = 0;
  private refreshing: Promise<void> | null = null;
  private context: AudioContext | null = null;
  private graph: SoundGraph | null = null;
  private active = false;
  private focused = false;
  private unlocked = false;
  private inGame = false;
  private fadeUntil = 0;
  private beat = 0;
  private next = 0;
  private nextAmbience = 0;
  private nextRing = 0;
  private lastLease = 0;
  private ringing: string[] = [];
  private talking = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private recent = new Map<string, number>();
  private voices = new Map<string, Voice>();
  private queue = new Map<string, PendingCue[]>();
  private counter = 0;
  private ownership = new AudioOwnership(() => this.sync());
  private customBus: BroadcastChannel | null = null;
  private saved: SoundPreferences = (() => {
    try {
      return parseSound(localStorage.getItem(AUDIO_SETTINGS_KEY));
    } catch {
      return parseSound(null);
    }
  })();
  private snapshot = {
    preferences: this.saved,
    status: "waiting" as Status,
    customNames: {} as Partial<Record<SoundChannel, string>>,
    customSounds: [] as SoundInfo[],
    playing: "",
    activeVoices: 0,
    queuedVoices: 0,
    previewing: false,
    settingsPreview: false,
    filesDirty: false,
    filesBusy: false,
    error: "",
    interrupted: [] as string[],
  };
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  };
  state = () => this.snapshot;
  private publish(change: Partial<typeof this.snapshot> = {}) {
    this.snapshot = { ...this.snapshot, ...change };
    this.listeners.forEach((f) => f());
  }
  private notify(status: Status) {
    if (status !== this.snapshot.status) this.publish({ status });
  }
  savedPreferences = () => structuredClone(this.saved);
  beginSettingsPreview() {
    if (this.editing) return;
    this.editing = true;
    this.editEpoch++;
    this.staged.clear();
    this.publish({ settingsPreview: true, filesDirty: false, error: "" });
  }
  endSettingsPreview() {
    this.discardPreferences();
    this.editing = false;
    this.publish({ settingsPreview: false });
  }
  previewPreferences(draft: SoundPreferences) {
    this.publish({ preferences: parseSound(JSON.stringify(draft)), error: "" });
    this.sync();
  }
  async applyPreferences(draft: SoundPreferences) {
    if (this.fileOperations)
      throw Error("Bitte die laufende Audiodateiprüfung abwarten.");
    if (this.applying)
      throw Error("Die Audioeinstellungen werden bereits gespeichert.");
    this.applying = true;
    const value = parseSound(JSON.stringify(draft)),
      old = JSON.stringify(this.saved);
    try {
      localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(value));
      try {
        await storeSounds(this.staged);
      } catch (error) {
        try {
          localStorage.setItem(AUDIO_SETTINGS_KEY, old);
        } catch {
          throw Error(
            "Audiodateien wurden nicht übernommen; die lokalen Regler konnten nicht zurückgeschrieben werden. Bitte erneut speichern.",
          );
        }
        throw error;
      }
      const changedFiles = this.staged.size > 0;
      this.saved = value;
      this.staged.clear();
      this.publish({ preferences: value, filesDirty: false, error: "" });
      this.stopPreview();
      this.sync();
      if (changedFiles) {
        await this.refreshCustom().catch(() =>
          this.publish({
            error:
              "Einstellungen gespeichert; die lokale Dateiliste konnte nicht erneut gelesen werden.",
          }),
        );
        this.customBus?.postMessage("changed");
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Die Audioeinstellungen konnten lokal nicht gespeichert werden.";
      this.publish({ error: message });
      throw Error(message);
    } finally {
      this.applying = false;
    }
  }
  discardPreferences() {
    this.editEpoch++;
    this.staged.clear();
    this.stopPreview();
    this.stopCustom();
    this.publish({
      preferences: this.savedPreferences(),
      filesDirty: false,
      error: "",
    });
    void this.refreshCustom().catch(() => {});
    this.sync();
  }
  preferences(change: Partial<SoundPreferences>) {
    const value = parseSound(
      JSON.stringify({ ...this.snapshot.preferences, ...change }),
    );
    this.previewPreferences(value);
    if (!this.editing) void this.applyPreferences(value).catch(() => {});
  }
  scene(inGame: boolean) {
    if (this.inGame === inGame) return;
    this.inGame = inGame;
    this.fadeUntil = (this.context?.currentTime ?? 0) + 2.4;
    this.graph?.scene(inGame);
  }
  session(active: boolean, account = "default") {
    this.active = active;
    this.ownership.session(active ? account : "");
    if (!active) {
      this.beat = 0;
      this.recent.clear();
      this.communications([], []);
    }
    this.sync();
  }
  communications(ringing: readonly string[], talking: readonly string[]) {
    if (this.ringing[0] !== ringing[0]) this.nextRing = 0;
    this.ringing = [...ringing];
    const next = new Set(talking);
    for (const id of this.talking)
      if (!next.has(id)) this.graph?.mixer.duck(`call:${id}`, false);
    this.talking = next;
    for (const id of next) this.graph?.mixer.duck(`call:${id}`, true);
    for (const voice of [...this.voices.values()])
      if (
        voice.id.startsWith("ring:") &&
        !ringing.some((id) => voice.id.startsWith(`ring:${id}:`))
      )
        this.stopVoice(voice.id);
  }
  private hidden() {
    return document.visibilityState !== "visible" || !this.focused;
  }
  private wanted() {
    return (
      this.active &&
      this.unlocked &&
      !this.snapshot.preferences.muted &&
      this.ownership.owns() &&
      (!this.hidden() || this.snapshot.preferences.background !== "pause")
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
        this.graph.scene(this.inGame);
        this.context.onstatechange = () => {
          if (this.context?.state === "running" && this.wanted())
            this.notify("playing");
          else if (this.snapshot.status === "playing") this.notify("paused");
        };
        void this.refreshCustom().catch((e) =>
          this.publish({ error: String(e) }),
        );
      }
      this.unlocked = true;
      this.focused = true;
      this.ownership.claim();
      if (this.wanted()) await this.context.resume();
      this.sync();
    } catch {
      this.notify("unavailable");
    }
  }
  toggle() {
    if (["waiting", "unavailable", "paused"].includes(this.snapshot.status)) {
      this.preferences({ muted: false });
      void this.unlock();
    } else {
      const muted = !this.snapshot.preferences.muted;
      this.preferences({ muted });
      if (!muted) void this.unlock();
    }
  }
  private sync = () => {
    const c = this.context,
      p = this.snapshot.preferences;
    this.graph?.mixer.apply(
      p,
      typeof document === "undefined" ? false : this.hidden(),
    );
    for (const voice of [...this.voices.values()]) {
      if (
        !groupLevel(p, voice.group, this.hidden()) ||
        (!["music", "ambience"].includes(voice.group) &&
          (p.channelMuted[voice.channel] || !p.channels[voice.channel]))
      )
        this.stopVoice(voice.id);
      else
        smooth(
          voice.gain.gain,
          ["music", "ambience"].includes(voice.group)
            ? 1
            : p.channels[voice.channel] / 100,
          c?.currentTime ?? 0,
        );
    }
    if (!c) {
      if (this.snapshot.status !== "unavailable")
        this.notify(p.muted ? "muted" : "waiting");
      return;
    }
    if (!this.wanted()) {
      this.stopAll();
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.graph?.stop();
      this.graph?.mixer.clearDucks();
      this.next = this.nextAmbience = 0;
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
    for (const id of this.talking) this.graph?.mixer.duck(`call:${id}`, true);
    if (!this.timer) {
      this.next = c.currentTime + 0.06;
      this.pump();
      this.timer = setInterval(this.pump, 100);
    }
  };
  private pump = () => {
    const c = this.context;
    if (!c || !this.wanted() || c.state !== "running") {
      if (c) this.sync();
      return;
    }
    if (Date.now() - this.lastLease > 1000) {
      this.lastLease = Date.now();
      this.ownership.renew();
    }
    if (this.next < c.currentTime - 0.1) this.next = c.currentTime + 0.03;
    const p = this.snapshot.preferences;
    while (this.next < c.currentTime + 0.18) {
      if (
        groupLevel(p, "music", this.hidden()) > 0 &&
        ![...this.voices.values()].some((v) => v.group === "music")
      ) {
        this.graph?.beat(this.beat, this.next, this.inGame);
        if (c.currentTime < this.fadeUntil)
          this.graph?.beat(this.beat, this.next, !this.inGame);
      }
      this.beat = (this.beat + 1) % 256;
      this.next += BEAT;
    }
    if (
      c.currentTime >= this.nextAmbience &&
      groupLevel(p, "ambience", this.hidden()) > 0
    ) {
      this.cue("ambience");
      this.nextAmbience = c.currentTime + 4;
    }
    if (this.ringing.length && c.currentTime >= this.nextRing) {
      if (![...this.voices.values()].some((v) => v.id.startsWith("ring:")))
        this.cue("phone", {
          id: `ring:${this.ringing[0]}:${Math.floor(c.currentTime / 6)}`,
        });
      this.nextRing = c.currentTime + 6;
    }
    for (const channel of this.queue.keys()) this.drain(channel);
  };
  cue(
    cue: Cue,
    options: {
      id?: string;
      radio?: string;
      preview?: boolean;
      priority?: number;
    } = {},
  ) {
    const c = this.context,
      p = this.snapshot.preferences,
      group = groupFor(cue),
      channel = channelFor(cue);
    if (
      !c ||
      c.state !== "running" ||
      !this.wanted() ||
      !groupLevel(p, group, this.hidden()) ||
      (!["music", "ambience"].includes(group) &&
        (p.channelMuted[channel] || !p.channels[channel]))
    )
      return;
    const now = c.currentTime,
      id = options.id ?? `cue:${++this.counter}`;
    if (this.recent.has(id)) return;
    if (
      cue === "click" &&
      now - (this.recent.get("last-click") ?? -Infinity) < 0.08
    )
      return;
    this.recent.set(id, now);
    if (cue === "click") this.recent.set("last-click", now);
    if (this.recent.size > 1000)
      for (const key of [...this.recent.keys()].slice(0, 200))
        this.recent.delete(key);
    const pending: PendingCue = {
      cue,
      id,
      radio: options.radio ?? "dispatch",
      preview: options.preview ?? false,
      at: now,
      priority: options.priority ?? priority(cue),
      interrupted: false,
      sequence: ++this.counter,
    };
    if (group === "radio") {
      const queue = this.queue.get("dispatch") ?? [];
      const active = [...this.voices.values()].find((v) => v.group === "radio");
      if (
        active &&
        pending.priority >= 100 &&
        active.priority < 100 &&
        !active.interrupted &&
        now - active.at < 60
      ) {
        this.stopVoice(active.id);
        queue.push({
          cue: active.cue,
          id: active.id,
          radio: active.radio,
          preview: active.preview,
          at: active.at,
          priority: active.priority,
          interrupted: true,
          sequence: active.sequence,
        });
        this.publish({
          interrupted: [
            ...new Set([...this.snapshot.interrupted, active.id]),
          ].slice(-200),
        });
      }
      if (queue.length >= 160) {
        this.publish({
          error:
            "Funkwarteschlange ausgelastet. Weitere Meldungen bleiben im Funkverlauf abrufbar.",
        });
        return;
      }
      queue.push(pending);
      this.queue.set("dispatch", queue);
      this.voiceState();
      this.drain("dispatch");
      return;
    }
    this.start(pending);
  }
  private start(pending: PendingCue) {
    if (!this.wanted() || !this.graph || !this.context) return;
    const group = groupFor(pending.cue),
      channel = channelFor(pending.cue);
    const p = this.snapshot.preferences;
    if (
      !groupLevel(p, group, this.hidden()) ||
      (!["music", "ambience"].includes(group) &&
        (p.channelMuted[channel] || !p.channels[channel]))
    )
      return;
    const same = [...this.voices.values()].filter((v) => v.group === group);
    if (same.length >= caps[group]) {
      if (priority(pending.cue) > Math.min(...same.map((v) => priority(v.cue))))
        this.stopVoice(
          same.sort((a, b) => priority(a.cue) - priority(b.cue))[0].id,
        );
      else return;
    }
    if (this.voices.size >= 16) {
      const low = [...this.voices.values()].sort(
        (a, b) => priority(a.cue) - priority(b.cue),
      )[0];
      if (priority(low.cue) >= priority(pending.cue)) return;
      this.stopVoice(low.id);
    }
    const gain = this.context.createGain();
    gain.gain.value = ["music", "ambience"].includes(group)
      ? 1
      : p.channels[channel] / 100;
    gain.connect(this.graph.mixer.groups[group]);
    const voice: Voice = {
      ...pending,
      group,
      channel,
      gain,
      custom: false,
      name: "",
      stop: () => {},
    };
    this.voices.set(voice.id, voice);
    if (communication(voice.cue)) this.graph.mixer.duck(voice.id, true);
    if (group === "music") this.graph.previewMusic(true);
    this.voiceState();
    const end = () => this.finishVoice(voice.id);
    const signalEnded = () => {
      if (this.voices.get(voice.id) !== voice || !this.wanted()) return;
      end();
    };
    const original = () => {
      if (this.voices.get(voice.id) !== voice || !this.wanted()) return;
      voice.custom = false;
      voice.name = "";
      this.voiceState();
      const handle = this.graph!.cue(
        voice.cue,
        undefined,
        1,
        gain,
        signalEnded,
      );
      voice.stop = handle.stop;
    };
    if (
      customChannel(channel) &&
      this.custom.get(channel)?.enabled &&
      !["music", "ambience"].includes(group) &&
      !["callAccept", "callEnd", "busy"].includes(voice.cue)
    ) {
      voice.custom = true;
      void this.customValue(channel)
        .then(async (sound) => {
          if (this.voices.get(voice.id) !== voice || !this.wanted()) return;
          if (!sound?.enabled) {
            original();
            return;
          }
          const stream = new StreamedSignal(this.context!, gain);
          voice.name = sound.name;
          voice.stop = () => stream.stop();
          this.voiceState();
          await stream.play(sound.blob, 1, signalEnded, original);
        })
        .catch(() => {
          this.publish({
            error:
              "Eigene Audiodatei nicht abspielbar; Originalsignal verwendet.",
          });
          original();
        });
    } else original();
    voice.timer = setTimeout(
      () => {
        if (!voice.preview)
          this.publish({
            error:
              "Funk-/Audiosignal nach Zeitlimit beendet; Meldung bleibt im Verlauf abrufbar.",
          });
        this.stopVoice(voice.id);
        this.drain("dispatch");
      },
      voice.preview ? 6000 : 30000,
    );
  }
  private finishVoice(id: string) {
    const voice = this.voices.get(id);
    if (!voice) return;
    if (voice.timer) clearTimeout(voice.timer);
    this.voices.delete(id);
    voice.gain.disconnect();
    this.graph?.mixer.duck(id, false);
    if (voice.group === "music") this.graph?.previewMusic(false);
    this.voiceState();
    this.drain(voice.radio);
  }
  private stopVoice(id: string) {
    const voice = this.voices.get(id);
    if (!voice) return;
    this.voices.delete(id);
    if (voice.timer) clearTimeout(voice.timer);
    voice.stop();
    voice.gain.disconnect();
    this.graph?.mixer.duck(id, false);
    if (voice.group === "music") this.graph?.previewMusic(false);
    this.voiceState();
  }
  private drain(channel: string) {
    void channel;
    if ([...this.voices.values()].some((v) => v.group === "radio")) return;
    const queue = this.queue.get("dispatch");
    if (!queue) return;
    const now = this.context?.currentTime ?? 0;
    queue.sort((a, b) => {
      const agedA = now - a.at >= 60,
        agedB = now - b.at >= 60;
      return (
        Number(agedB) - Number(agedA) ||
        (agedA && agedB ? 0 : b.priority - a.priority) ||
        a.at - b.at ||
        a.sequence - b.sequence
      );
    });
    let next: PendingCue | undefined;
    while (
      (next = queue.shift()) &&
      (this.context?.currentTime ?? 0) - next.at > 180
    ) {
      /* Never replay stale sound backlog. */
    }
    if (!queue.length) this.queue.delete("dispatch");
    if (next) this.start(next);
    this.voiceState();
  }
  private voiceState() {
    this.publish({
      playing: [...this.voices.values()]
        .filter((v) => v.custom && v.name)
        .map((v) => v.name)
        .join(" · "),
      activeVoices: this.voices.size,
      queuedVoices: [...this.queue.values()].reduce((n, q) => n + q.length, 0),
      previewing: [...this.voices.values()].some((v) => v.preview),
    });
  }
  private stopAll() {
    this.queue.clear();
    for (const id of [...this.voices.keys()]) this.stopVoice(id);
  }
  async preview(cue: Cue) {
    await this.unlock();
    this.stopPreview();
    this.cue(cue, { preview: true });
  }
  stopPreview() {
    for (const v of [...this.voices.values()])
      if (v.preview) this.stopVoice(v.id);
    for (const [key, q] of this.queue)
      this.queue.set(
        key,
        q.filter((v) => !v.preview),
      );
    this.voiceState();
  }
  stopCustom() {
    for (const v of [...this.voices.values()])
      if (v.custom) this.stopVoice(v.id);
  }
  private async customValue(channel: CustomChannel) {
    return this.staged.has(channel)
      ? (this.staged.get(channel) ?? undefined)
      : loadSound(channel);
  }
  refreshCustom() {
    if (!this.refreshing)
      this.refreshing = customSounds()
        .then((sounds) => {
          const values = new Map(sounds.map((s) => [s.channel, s]));
          for (const [key, sound] of this.staged) {
            if (sound) {
              const { blob: _, ...info } = sound;
              void _;
              values.set(key, info);
            } else values.delete(key);
          }
          this.custom = values;
          const customSounds = [...values.values()];
          this.publish({
            customSounds,
            customNames: Object.fromEntries(
              customSounds.map((s) => [s.channel, s.name]),
            ),
          });
        })
        .finally(() => {
          this.refreshing = null;
        });
    return this.refreshing;
  }
  private async saveCustom(channel: CustomChannel, value: CustomSound | null) {
    if (this.applying) throw Error("Bitte das laufende Speichern abwarten.");
    if (this.editing) {
      this.staged.set(channel, value);
      this.publish({ filesDirty: true });
    } else await storeSound(channel, value ?? undefined);
    for (const voice of [...this.voices.values()])
      if (voice.custom && voice.channel === channel) this.stopVoice(voice.id);
    await this.refreshing;
    await this.refreshCustom();
    if (!this.editing) this.customBus?.postMessage("changed");
  }
  async setCustom(channel: CustomChannel, file?: File) {
    return this.fileOperation(async (valid) => {
      if (!customChannel(channel))
        throw Error("Prioritäts- und Notfallsignale bleiben im Original.");
      if (!file) {
        valid();
        await this.saveCustom(channel, null);
        return;
      }
      const quota = await soundStorage(),
        old = await this.customValue(channel);
      if (quota && file.size > quota.free + (old?.bytes ?? 0))
        throw Error(
          "Für diese Datei reicht der geschätzte freie Browserspeicher nicht. Die bisherige Datei bleibt erhalten.",
        );
      const duration = await inspectSound(file);
      valid();
      await this.saveCustom(channel, {
        channel,
        name: file.name.slice(0, 160),
        blob: file,
        bytes: file.size,
        duration,
        enabled: true,
      });
    });
  }
  async enableCustom(channel: CustomChannel, enabled: boolean) {
    return this.fileOperation(async (valid) => {
      const value = await this.customValue(channel);
      valid();
      if (value) await this.saveCustom(channel, { ...value, enabled });
    });
  }
  async assignCustom(from: CustomChannel, to: CustomChannel) {
    return this.fileOperation(async (valid) => {
      const value = await this.customValue(from);
      valid();
      if (!value) throw Error("Diese lokale Datei ist nicht mehr vorhanden.");
      await this.saveCustom(to, { ...value, channel: to, enabled: true });
    });
  }
  async readPreferences(file: File) {
    return this.fileOperation(async (valid) => {
      if (file.size > 64 * 1024)
        throw Error("Die JSON-Sicherung darf höchstens 64 KB groß sein.");
      const result = importSoundPreferences(await file.text());
      valid();
      return result;
    });
  }
  private async fileOperation<T>(operation: (valid: () => void) => Promise<T>) {
    if (this.applying) throw Error("Bitte das laufende Speichern abwarten.");
    const epoch = this.editEpoch;
    this.fileOperations++;
    this.publish({ filesBusy: true });
    try {
      return await operation(() => {
        if (epoch !== this.editEpoch)
          throw Error("Die Dateiprüfung wurde mit der Vorschau verworfen.");
      });
    } finally {
      this.fileOperations--;
      this.publish({ filesBusy: this.fileOperations > 0 });
    }
  }
  listen() {
    this.focused = document.hasFocus();
    try {
      if (typeof BroadcastChannel !== "undefined") {
        this.customBus = new BroadcastChannel("lv-local-audio-files-v2");
        this.customBus.onmessage = () => {
          if (!this.editing) {
            this.stopCustom();
            void this.refreshCustom().catch(() => {});
          }
        };
      }
    } catch {
      /* Local files still work without cross-tab notifications. */
    }
    const gesture = (event: Event) => {
      if (
        event.isTrusted &&
        !(
          event.target instanceof Element &&
          event.target.closest(".sound-toggle")
        )
      )
        void this.unlock();
    };
    const visibility = () => this.sync();
    const blur = () => {
      this.focused = false;
      this.sync();
    };
    const focus = () => {
      this.focused = true;
      if (this.unlocked) this.ownership.claim();
      this.sync();
    };
    const click = (event: MouseEvent) => {
      if (
        event.isTrusted &&
        event.target instanceof Element &&
        event.target.closest(".app button:not(:disabled),.app summary") &&
        !event.target.closest(".sound-toggle,.sound-preview")
      )
        this.cue("click");
    };
    const storage = (event: StorageEvent) => {
      if (event.key === AUDIO_SETTINGS_KEY) {
        this.saved = parseSound(event.newValue);
        if (!this.editing) {
          this.publish({ preferences: this.savedPreferences() });
          this.sync();
        }
      } else if (event.key?.startsWith("lv-audio-owner-v2:")) this.sync();
    };
    window.addEventListener("click", gesture);
    window.addEventListener("keydown", gesture);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blur);
    window.addEventListener("click", click);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("click", gesture);
      window.removeEventListener("keydown", gesture);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blur);
      window.removeEventListener("click", click);
      window.removeEventListener("storage", storage);
      this.customBus?.close();
      this.customBus = null;
      this.session(false);
      this.ownership.close();
      this.context?.close().catch(() => {});
      this.context = null;
      this.graph = null;
      this.unlocked = false;
    };
  }
}
export const audio = new AudioController();
export const useSound = () =>
  useSyncExternalStore(audio.subscribe, audio.state);
