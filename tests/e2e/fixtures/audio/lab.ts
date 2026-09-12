// Browser-only test entry; never imported by the production client.
export {
  audio,
  AudioController,
  defaultSound,
} from "../../../../src/client/audio/controller";
export {
  SoundGraph,
  BEAT,
  musicTitles,
} from "../../../../src/client/audio/synth";
export { groupFor } from "../../../../src/client/audio/profiles";
export { loadSound, storeSound } from "../../../../src/client/audio/custom";
