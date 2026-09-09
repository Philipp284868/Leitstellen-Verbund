import { useEffect, useRef } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { audio, useSound } from "./audio/controller";
import { AudioEvents } from "./audio/events";
import { useGame } from "./store";
import "./Sound.css";
export function AudioSession() {
  const { save, mode, readonly, user, error } = useGame();
  const { status } = useSound();
  const events = useRef(new AudioEvents()),
    previousError = useRef("");
  useEffect(() => audio.listen(), []);
  useEffect(() => {
    audio.session(!!save && !!user, user?.id ?? "");
  }, [!!save, user?.id]);
  useEffect(() => {
    const cues = events.current.observeAll(
      save,
      mode,
      !readonly && status === "playing",
    );
    const calls = readonly
      ? []
      : (save?.missions.flatMap((m) => m.control?.calls ?? []) ?? []);
    const ringing = calls.filter((c) => c.state === "ringing").map((c) => c.id);
    audio.communications(
      ringing,
      calls.filter((c) => c.state === "active").map((c) => c.id),
    );
    for (const event of cues) {
      // A still-ringing call is reconstructed from current state, never replayed from history.
      if ((event.cue === "phone" || event.cue === "mission") && ringing.length)
        continue;
      audio.cue(event.cue, event);
    }
  }, [save, mode, readonly, status]);
  useEffect(() => {
    if (error && error !== previousError.current)
      audio.cue(
        /Gespräch.*bereits|bereits.*Gespräch|bereits angenommen/i.test(error)
          ? "busy"
          : "error",
      );
    previousError.current = error;
  }, [error]);
  return null;
}
export function SoundButton() {
  const { preferences: p, status } = useSound(),
    off = p.muted || status !== "playing";
  return (
    <button
      className="sound-toggle"
      aria-label={off ? "Ton einschalten" : "Ton stummschalten"}
      title={off ? "Ton einschalten" : "Ton stummschalten"}
      aria-pressed={!off}
      onClick={() => audio.toggle()}
    >
      {off ? <VolumeX size={20} /> : <Volume2 size={20} />}
    </button>
  );
}
