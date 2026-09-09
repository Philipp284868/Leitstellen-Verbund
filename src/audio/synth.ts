/** Two original arrangements in D minor, 78 BPM, 64 bars (about 3:17).
 * No recordings or third-party samples. See docs/AUDIO.md. */
import { AudioMixer, smooth } from "./mixer";
export const BEAT = 60 / 78;
export const musicTitles = {
  menu: "Lichter der Region",
  game: "Ruhiger Dienst",
};
export type Cue =
  | "priority"
  | "emergency"
  | "request"
  | "phone"
  | "callAccept"
  | "callEnd"
  | "busy"
  | "radioOpen"
  | "radioAck"
  | "gong"
  | "ambience"
  | "musicMenu"
  | "musicGame"
  | "dme"
  | "siren"
  | "station"
  | "mission"
  | "dispatch"
  | "arrival"
  | "return"
  | "complete"
  | "level"
  | "build"
  | "radio"
  | "error"
  | "click";
export const chords = [
  [50, 57, 60, 64, 69],
  [46, 53, 57, 60, 65],
  [53, 60, 64, 67, 72],
  [48, 55, 60, 62, 67],
  [43, 50, 57, 58, 62],
  [46, 53, 57, 60, 65],
  [50, 57, 60, 64, 69],
  [48, 55, 60, 62, 67],
];
const motifs = [
  [0, 2, 3, 2, 1, 2],
  [2, 3, 4, 3, 2, 1],
  [1, 2, 0, 2, 3, 2],
  [3, 2, 1, 0, 1, 2],
];
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export class SoundGraph {
  readonly mixer: AudioMixer;
  readonly music: GainNode;
  readonly effects: GainNode;
  readonly master: GainNode;
  readonly musicLayers: { menu: GainNode; game: GainNode };
  private musicProgram: GainNode;
  private musicWet = true;
  private musicOut: AudioNode;
  private reverb: ConvolverNode;
  private sources = new Set<AudioScheduledSourceNode>();
  private noise: AudioBuffer;
  private keys = new Map<number, AudioBuffer>();
  constructor(readonly context: BaseAudioContext) {
    const c = context;
    this.mixer = new AudioMixer(c);
    this.music = this.mixer.groups.music;
    this.effects = this.mixer.groups.ui;
    this.master = this.mixer.master;
    this.music.gain.value = 0.28;
    this.effects.gain.value = 0.6;
    this.musicLayers = { menu: c.createGain(), game: c.createGain() };
    this.musicProgram = c.createGain();
    this.musicProgram.connect(this.music);
    this.musicLayers.menu.connect(this.musicProgram);
    this.musicLayers.game.connect(this.musicProgram);
    this.musicLayers.game.gain.value = 0;
    this.musicOut = this.musicLayers.menu;
    this.reverb = c.createConvolver();
    const impulse = c.createBuffer(
      2,
      Math.floor(c.sampleRate * 2.4),
      c.sampleRate,
    );
    let seed = 9127;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed / 4294967296) * 2 - 1;
    };
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = last * 0.45 + rand() * 0.55;
        data[i] = last * (1 - i / data.length) ** 3 * 0.35;
      }
    }
    this.reverb.buffer = impulse;
    const wet = c.createGain();
    wet.gain.value = 0.24;
    this.reverb.connect(wet);
    wet.connect(this.musicProgram);
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = rand();
  }
  private track(
    source: AudioScheduledSourceNode,
    nodes: AudioNode[],
    at: number,
    duration: number,
  ) {
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      for (const n of nodes) n.disconnect();
    };
    source.start(at);
    source.stop(at + duration);
  }
  private envelope(
    destination: AudioNode,
    at: number,
    duration: number,
    volume: number,
    attack = 0.015,
  ) {
    const g = this.context.createGain();
    // A source may begin on a fractional render frame. Its unscheduled gain must
    // already be silent, including the boundary between ramp segments.
    g.gain.value = 0;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(volume, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    g.connect(destination);
    return g;
  }
  private tone(
    freq: number,
    at: number,
    duration: number,
    volume: number,
    destination: AudioNode,
    type: OscillatorType = "sine",
  ) {
    const o = this.context.createOscillator(),
      g = this.envelope(destination, at, duration, volume);
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    this.track(o, [g], at, duration + 0.02);
  }
  private piano(midi: number, at: number, volume: number, pan: number) {
    const c = this.context;
    if (!this.keys.has(midi)) {
      const b = c.createBuffer(1, Math.ceil(c.sampleRate * 2.8), c.sampleRate),
        data = b.getChannelData(0),
        f = frequency(midi);
      for (let i = 0; i < data.length; i++) {
        const t = i / c.sampleRate;
        // Inharmonic upper partials and a rounded hammer envelope produce a soft key tone.
        data[i] =
          (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 1.65) +
            0.3 * Math.sin(2 * Math.PI * f * 2.002 * t) * Math.exp(-t * 3.5) +
            0.1 * Math.sin(2 * Math.PI * f * 3.008 * t) * Math.exp(-t * 5) +
            0.035 * Math.sin(2 * Math.PI * f * 4.016 * t) * Math.exp(-t * 7)) *
          Math.min(1, t / 0.008) *
          Math.min(1, (2.8 - t) / 0.08);
      }
      this.keys.set(midi, b);
    }
    const source = c.createBufferSource(),
      g = c.createGain(),
      p = c.createStereoPanner();
    source.buffer = this.keys.get(midi)!;
    g.gain.value = volume;
    p.pan.value = pan;
    source.connect(g);
    g.connect(p);
    p.connect(this.musicOut);
    if (this.musicWet) p.connect(this.reverb);
    this.track(source, [g, p], at, 2.8);
  }
  private pad(midi: number, at: number, duration: number, pan: number) {
    const c = this.context,
      o = c.createOscillator(),
      g = c.createGain(),
      p = c.createStereoPanner();
    o.type = "sine";
    g.gain.value = 0;
    o.frequency.value = frequency(midi);
    o.detune.value = pan * 5;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.055, at + 1.5);
    g.gain.setValueAtTime(0.055, at + duration - 1.5);
    g.gain.linearRampToValueAtTime(0, at + duration);
    p.pan.value = pan;
    o.connect(g);
    g.connect(p);
    p.connect(this.musicOut);
    if (this.musicWet) p.connect(this.reverb);
    this.track(o, [g, p], at, duration + 0.01);
  }
  private hiss(
    at: number,
    duration: number,
    volume: number,
    destination: AudioNode,
    cutoff = 3500,
  ) {
    const c = this.context,
      source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      g = this.envelope(destination, at, duration, volume, 0.006);
    source.buffer = this.noise;
    source.loop = duration > this.noise.duration;
    filter.type = "bandpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.65;
    source.connect(filter);
    filter.connect(g);
    this.track(source, [filter, g], at, duration + 0.01);
  }
  /** Scheduling a short lookahead keeps playback independent of game speed and snapshot rate. */
  beat(index: number, at: number, inGame: boolean, destination?: AudioNode) {
    this.musicWet = !destination;
    this.musicOut =
      destination ?? (inGame ? this.musicLayers.game : this.musicLayers.menu);
    const bar = Math.floor(index / 4) % 64,
      beat = index % 4,
      chord =
        chords[
          (Math.floor(bar / (inGame ? 4 : 2)) + (inGame ? 4 : 0)) %
            chords.length
        ],
      section = Math.floor(bar / 16);
    if (beat === 0 && bar % 2 === 0)
      for (let i = 0; i < chord.length; i++)
        this.pad(chord[i] + 12, at, BEAT * 8 + 1, (i - 2) * 0.3);
    if (beat === 0)
      this.tone(
        frequency(chord[0] - 12),
        at,
        BEAT * 3,
        inGame ? 0.1 : 0.14,
        this.musicOut,
      );
    const arp = [0, 2, 1, 3];
    if ((section !== 3 || bar % 4 < 2) && (!inGame || beat % 2 === 0))
      this.piano(
        chord[arp[beat]] + 12,
        at + 0.015,
        inGame ? 0.065 : 0.1,
        beat % 2 ? 0.3 : -0.3,
      );
    if (
      bar >= 4 &&
      (inGame ? beat === 2 && bar % 2 === 0 : beat === 0 || beat === 2)
    ) {
      const motif = motifs[Math.floor(bar / 4) % 4],
        note = chord[motif[(bar % 4) * 2 + beat / 2] ?? motif[bar % 6]] + 12;
      this.piano(note, at + BEAT * 0.5, 0.12, 0.12);
      if (section === 1 || section === 2)
        this.piano(note, at + BEAT * 1.25, 0.032, -0.4);
    }
    // The menu is spacious; the dispatch screen adds a quiet pulse, never a siren loop.
    if (inGame && section !== 3) {
      if (beat === 0 || beat === 2) {
        const o = this.context.createOscillator(),
          g = this.envelope(this.musicOut, at, 0.24, 0.045);
        o.frequency.setValueAtTime(100, at);
        o.frequency.exponentialRampToValueAtTime(43, at + 0.18);
        o.connect(g);
        this.track(o, [g], at, 0.26);
      }
      if (beat === 1 || beat === 3)
        this.hiss(at, 0.07, 0.009, this.musicOut, 4800);
    }
  }
  scene(inGame: boolean, at = this.context.currentTime) {
    smooth(this.musicLayers.menu.gain, inGame ? 0 : 1, at, 2.4);
    smooth(this.musicLayers.game.gain, inGame ? 1 : 0, at, 2.4);
  }
  previewMusic(active: boolean) {
    smooth(
      this.musicProgram.gain,
      active ? 0 : 1,
      this.context.currentTime,
      0.2,
    );
  }
  cue(
    cue: Cue,
    at = this.context.currentTime,
    level = 1,
    destination: AudioNode = this.effects,
    finished = () => {},
  ) {
    const before = new Set(this.sources);
    const t = at + 0.008,
      out = destination;
    const notes = (
      values: number[],
      spacing: number,
      duration: number,
      volume = 0.2,
    ) =>
      values.forEach((m, i) =>
        this.tone(frequency(m), t + i * spacing, duration, volume * level, out),
      );
    switch (cue) {
      case "musicMenu":
      case "musicGame":
        for (let beat = 0; beat < 8; beat++)
          this.beat(beat + 32, t + beat * BEAT, cue === "musicGame", out);
        break;
      case "ambience":
        // Quiet ventilation and desk electronics; no incident-dependent ambience.
        this.hiss(t, 4.5, 0.015 * level, out, 260);
        this.tone(90, t, 4.5, 0.004 * level, out);
        this.tone(180, t, 4.5, 0.0015 * level, out);
        break;
      case "callAccept":
        this.hiss(t, 0.025, 0.07 * level, out, 850);
        notes([72, 76], 0.08, 0.1, 0.07);
        break;
      case "callEnd":
        notes([72, 65], 0.09, 0.085, 0.07);
        this.hiss(t + 0.18, 0.025, 0.05 * level, out, 700);
        break;
      case "busy":
        for (let i = 0; i < 3; i++) {
          this.tone(425, t + i * 0.4, 0.18, 0.075 * level, out);
          this.tone(450, t + i * 0.4, 0.18, 0.03 * level, out);
        }
        break;
      case "radioOpen":
        this.hiss(t, 0.13, 0.1 * level, out, 1800);
        this.tone(1050, t + 0.07, 0.04, 0.035 * level, out);
        break;
      case "radioAck":
        this.hiss(t, 0.035, 0.08 * level, out, 2100);
        notes([77, 81], 0.08, 0.09, 0.08);
        break;
      case "gong":
        for (const ratio of [1, 2.76, 5.4])
          this.tone(392 * ratio, t, 1.8 / ratio, (0.11 / ratio) * level, out);
        break;
      case "emergency":
        notes([93, 81, 93, 81, 93, 81], 0.12, 0.11, 0.2);
        break;
      case "request":
        notes([81, 74, 81], 0.15, 0.13, 0.15);
        break;
      case "priority":
        notes([86, 74, 86, 74], 0.16, 0.15, 0.19);
        break;
      case "phone":
        for (let ring = 0; ring < 2; ring++)
          for (let pulse = 0; pulse < 6; pulse++) {
            this.tone(
              880,
              t + ring * 0.7 + pulse * 0.065,
              0.05,
              0.065 * level,
              out,
            );
            this.tone(
              1320,
              t + ring * 0.7 + pulse * 0.065,
              0.05,
              0.045 * level,
              out,
            );
          }
        break;
      case "dme":
        notes([88, 88, 88, 88], 0.12, 0.07, 0.13);
        break;
      case "siren":
        for (const detune of [-2, 2]) {
          const o = this.context.createOscillator(),
            g = this.envelope(out, t, 2.7, 0.055 * level, 0.18);
          o.type = "triangle";
          o.detune.value = detune;
          o.frequency.setValueAtTime(330, t);
          o.frequency.exponentialRampToValueAtTime(680, t + 1.05);
          o.frequency.exponentialRampToValueAtTime(370, t + 2.6);
          o.connect(g);
          this.track(o, [g], t, 2.72);
        }
        break;
      case "station":
        for (const ratio of [1, 2.76, 5.4])
          this.tone(392 * ratio, t, 1.8 / ratio, (0.08 / ratio) * level, out);
        notes([74, 69, 65], 0.22, 0.38, 0.17);
        break;
      case "mission":
        notes([74, 81, 78], 0.14, 0.26, 0.22);
        break;
      case "dispatch":
        notes([62, 69, 74], 0.09, 0.2, 0.17);
        this.hiss(t, 0.09, 0.07 * level, out, 1700);
        break;
      case "arrival":
        notes([69, 74], 0.12, 0.26, 0.13);
        break;
      case "return":
        notes([67, 62], 0.1, 0.2, 0.11);
        break;
      case "complete":
        notes([62, 65, 69, 74], 0.115, 0.6, 0.17);
        break;
      case "level":
        notes([62, 65, 69, 74, 77, 81], 0.12, 0.75, 0.18);
        break;
      case "build":
        notes([57, 64, 69], 0.07, 0.3, 0.13);
        break;
      case "radio":
        this.hiss(t, 0.1, 0.1 * level, out, 2100);
        notes([79, 76], 0.095, 0.1, 0.09);
        break;
      case "error":
        notes([50, 49], 0.14, 0.2, 0.16);
        break;
      case "click":
        this.tone(650, t, 0.045, 0.065 * level, out);
        break;
    }
    const playing = new Set([...this.sources].filter((s) => !before.has(s)));
    let notified = false;
    const done = () => {
      if (!playing.size && !notified) {
        notified = true;
        finished();
      }
    };
    for (const source of playing) {
      const cleanup = source.onended;
      source.onended = (event) => {
        cleanup?.call(source, event);
        playing.delete(source);
        done();
      };
    }
    return {
      stop: () => {
        for (const source of playing) {
          try {
            source.stop();
          } catch {
            /* Already ended. */
          }
        }
      },
      get active() {
        return playing.size > 0;
      },
    };
  }
  sample(buffer: AudioBuffer, level = 1) {
    const source = this.context.createBufferSource(),
      gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = level;
    source.connect(gain);
    gain.connect(this.effects);
    this.track(
      source,
      [gain],
      this.context.currentTime + 0.008,
      buffer.duration,
    );
  }
  volumes(music: number, effects: number) {
    const t = this.context.currentTime;
    this.music.gain.setTargetAtTime(music * 0.8, t, 0.08);
    this.effects.gain.setTargetAtTime(effects * 0.8, t, 0.03);
  }
  stop() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already ended */
      }
    }
    this.sources.clear();
  }
}
