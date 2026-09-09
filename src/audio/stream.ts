/** At most one custom recording is streamed. No decoded recording is retained in RAM. */
export class StreamedSignal {
  private current: {
    player: HTMLAudioElement;
    source: MediaElementAudioSourceNode;
    gain: GainNode;
    url: string;
  } | null = null;
  constructor(
    private context: AudioContext,
    private destination: AudioNode,
  ) {}
  async play(blob: Blob, level: number, ended: () => void, failed: () => void) {
    this.stop();
    const player = new Audio(),
      url = URL.createObjectURL(blob);
    let source: MediaElementAudioSourceNode;
    try {
      source = this.context.createMediaElementSource(player);
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    const gain = this.context.createGain();
    // Conservative sample gain plus the existing compressor avoids amplifying user recordings.
    gain.gain.value = level * 0.35;
    source.connect(gain);
    gain.connect(this.destination);
    const current = { player, source, gain, url };
    this.current = current;
    const finish = () => {
      if (this.current !== current) return;
      this.stop();
      ended();
    };
    player.onended = finish;
    player.onerror = () => {
      if (this.current !== current) return;
      this.stop();
      failed();
    };
    player.preload = "metadata";
    player.src = url;
    try {
      await player.play();
    } catch (error) {
      if (this.current !== current) return; // An intentional stop is not a playback failure.
      this.stop();
      throw error;
    }
  }
  volume(level: number) {
    this.current?.gain.gain.setTargetAtTime(
      level * 0.35,
      this.context.currentTime,
      0.03,
    );
  }
  stop() {
    const current = this.current;
    this.current = null;
    if (!current) return;
    current.player.onended = current.player.onerror = null;
    current.player.pause();
    current.player.removeAttribute("src");
    current.player.load();
    current.source.disconnect();
    current.gain.disconnect();
    URL.revokeObjectURL(current.url);
  }
}
