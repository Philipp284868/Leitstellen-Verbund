import { useEffect, useRef } from "react";
import { Volume2, VolumeX, Music2, Radio } from "lucide-react";
import { audio, useSound } from "./audio/controller";
import { AudioEvents } from "./audio/events";
import { useGame } from "./store";
import "./Sound.css";
import { SoundProfiles } from "./SoundProfiles";
export function AudioSession() {
  const { save, mode, readonly, user, error } = useGame();
  const { status } = useSound();
  const events = useRef(new AudioEvents()),
    previousError = useRef("");
  useEffect(() => audio.listen(), []);
  useEffect(() => {
    audio.session(!!save && !!user);
  }, [!!save, user?.id]);
  useEffect(() => {
    const cue = events.current.observe(
      save,
      mode,
      !readonly &&
        status === "playing" &&
        document.visibilityState === "visible",
    );
    if (cue) audio.cue(cue);
  }, [save, mode, readonly, status]);
  useEffect(() => {
    const reset = () => events.current.reset();
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, []);
  useEffect(() => {
    if (error && error !== previousError.current) audio.cue("error");
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
export function SoundSettings() {
  const { preferences: p, status } = useSound();
  const labels = {
    waiting: "Startet nach deinem nächsten Klick.",
    playing: "Ton ist aktiv.",
    paused: "Ton pausiert im Hintergrund.",
    muted: "Alle Klänge sind stummgeschaltet.",
    unavailable:
      "Audio ist momentan nicht verfügbar. Du kannst es erneut einschalten.",
  };
  return (
    <section className="sound-settings" aria-labelledby="sound-heading">
      <div className="sound-heading">
        <div>
          <span className="eyebrow">DEINE KLANGKULISSE</span>
          <h3 id="sound-heading">Musik & Spielsound</h3>
        </div>
        <SoundButton />
      </div>
      <p className="sound-status" role="status">
        {labels[status]}
      </p>
      <div className="sound-channel">
        <label>
          <input
            type="checkbox"
            checked={p.music}
            onChange={(e) => audio.preferences({ music: e.target.checked })}
          />
          <Music2 size={18} /> Hintergrundmusik
        </label>
        <span>Nachtschicht · Klavier, Flächen & sanfter Rhythmus</span>
        <label className="sound-volume">
          Musiklautstärke{" "}
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={p.musicVolume}
            disabled={!p.music}
            onChange={(e) =>
              audio.preferences({ musicVolume: Number(e.target.value) })
            }
          />
          <output>{p.musicVolume} %</output>
        </label>
      </div>
      <div className="sound-channel">
        <label>
          <input
            type="checkbox"
            checked={p.effects}
            onChange={(e) => audio.preferences({ effects: e.target.checked })}
          />
          <Radio size={18} /> Soundeffekte
        </label>
        <span>Einsätze, Alarmierung, Funk und Rückmeldungen</span>
        <label className="sound-volume">
          Effektlautstärke{" "}
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={p.effectsVolume}
            disabled={!p.effects}
            onChange={(e) =>
              audio.preferences({ effectsVolume: Number(e.target.value) })
            }
          />
          <output>{p.effectsVolume} %</output>
        </label>
      </div>
      <div className="sound-preview">
        <button
          onClick={() => {
            void audio.unlock().then(() => audio.cue("mission"));
          }}
          disabled={p.muted || !p.effects || p.effectsVolume === 0}
        >
          Einsatzsignal anhören
        </button>
        <button
          onClick={() => {
            void audio.unlock().then(() => audio.cue("radio"));
          }}
          disabled={p.muted || !p.effects || p.effectsVolume === 0}
        >
          Funkprobe
        </button>
      </div>
      <SoundProfiles />
      <p className="sound-hint">
        Gilt für diesen Browser in beiden Spielmodi. Beim Verlassen des aktiven
        Fensters pausiert der Ton. Alle Meldungen bleiben auch als Text
        sichtbar.
      </p>
    </section>
  );
}
