import {
  groupLevel,
  mixerGroups,
  type MixerGroup,
  type SoundPreferences,
} from "./preferences";

export function smooth(
  param: AudioParam,
  value: number,
  at: number,
  seconds = 0.06,
) {
  if (typeof param.cancelAndHoldAtTime === "function")
    param.cancelAndHoldAtTime(at);
  else {
    param.cancelScheduledValues(at);
    param.setValueAtTime(param.value, at);
  }
  param.linearRampToValueAtTime(value, at + seconds);
}

/** One graph per context; overlapping communication sources own independent duck leases. */
export class AudioMixer {
  readonly groups: Record<MixerGroup, GainNode>;
  readonly master: GainNode;
  readonly output: DynamicsCompressorNode;
  readonly musicDuck: GainNode;
  readonly ambienceDuck: GainNode;
  private ducks = new Set<string>();
  private duckEnabled = true;
  constructor(readonly context: BaseAudioContext) {
    this.master = context.createGain();
    this.master.gain.value = 0.7;
    this.output = context.createDynamicsCompressor();
    this.output.threshold.value = -18;
    this.output.knee.value = 12;
    this.output.ratio.value = 12;
    this.output.attack.value = 0.003;
    this.output.release.value = 0.22;
    this.musicDuck = context.createGain();
    this.ambienceDuck = context.createGain();
    this.musicDuck.connect(this.master);
    this.ambienceDuck.connect(this.master);
    this.groups = Object.fromEntries(
      Object.keys(mixerGroups).map((key) => {
        const node = context.createGain();
        node.gain.value = 0;
        node.connect(
          key === "music"
            ? this.musicDuck
            : key === "ambience"
              ? this.ambienceDuck
              : this.master,
        );
        return [key, node];
      }),
    ) as Record<MixerGroup, GainNode>;
    this.master.connect(this.output);
    this.output.connect(context.destination);
  }
  apply(p: SoundPreferences, hidden = false) {
    const now = this.context.currentTime;
    smooth(this.master.gain, p.muted ? 0 : (p.masterVolume / 100) * 0.7, now);
    for (const key of Object.keys(this.groups) as MixerGroup[])
      smooth(this.groups[key].gain, groupLevel(p, key, hidden), now);
    this.duckEnabled = p.ducking;
    this.refreshDuck();
  }
  duck(id: string, active: boolean) {
    if (active) this.ducks.add(id);
    else this.ducks.delete(id);
    this.refreshDuck();
  }
  private refreshDuck() {
    const lowered = this.duckEnabled && this.ducks.size > 0;
    smooth(
      this.musicDuck.gain,
      lowered ? 0.24 : 1,
      this.context.currentTime,
      lowered ? 0.12 : 0.65,
    );
    smooth(
      this.ambienceDuck.gain,
      lowered ? 0.18 : 1,
      this.context.currentTime,
      lowered ? 0.12 : 0.65,
    );
  }
  get duckCount() {
    return this.ducks.size;
  }
  clearDucks() {
    this.ducks.clear();
    this.refreshDuck();
  }
}
