// Browser-only test entry; never imported by the production client.
export {
  audio,
  AudioController,
  defaultSound,
} from "../../../../src/audio/controller";
export { SoundGraph, BEAT, musicTitles } from "../../../../src/audio/synth";
export { groupFor } from "../../../../src/audio/profiles";
export { loadSound, storeSound } from "../../../../src/audio/custom";
