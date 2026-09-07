import { useState } from "react";
import { audio, useSound } from "./audio/controller";
import {
  channels,
  mixes,
  previewCue,
  type SoundChannel,
} from "./audio/profiles";
export function SoundProfiles() {
  const { preferences: p, customNames } = useSound();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState("");
  const upload = async (channel: SoundChannel, file?: File) => {
    setBusy(channel);
    setMessage("");
    try {
      await audio.setCustom(channel, file);
      setMessage(
        file
          ? `${channels[channel]}: eigene Datei im Browser gespeichert.`
          : `${channels[channel]}: Originalsignal wiederhergestellt.`,
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Audiodatei konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy("");
    }
  };
  return (
    <details className="sound-profiles">
      <summary>Signalregler und eigene Soundprofile</summary>
      <label className="sound-volume">
        Gesamtlautstärke
        <input
          type="range"
          min="0"
          max="100"
          value={p.masterVolume}
          onChange={(e) =>
            audio.preferences({ masterVolume: Number(e.target.value) })
          }
        />
        <output>{p.masterVolume} %</output>
      </label>
      <div className="sound-mixes">
        {Object.entries(mixes).map(([id, mix]) => (
          <button
            key={id}
            onClick={() => {
              const { name, ...values } = mix;
              audio.preferences(values);
              setMessage(`Klangprofil ${name} angewendet.`);
            }}
          >
            {mix.name}
          </button>
        ))}
      </div>
      <p>
        Eigene WAV-, MP3- oder OGG-Signale: bis 2 MB und 15 Sekunden. Nur im
        Browser gespeichert; keine Übertragung an den Spielserver. Verwende
        Dateien, die du nutzen darfst. Prioritätsmeldungen behalten ihren
        eindeutigen Originalton.
      </p>
      {Object.entries(channels).map(([id, name]) => {
        const key = id as SoundChannel;
        return (
          <section className="sound-custom" key={id}>
            <label className="sound-volume">
              {name}lautstärke
              <input
                type="range"
                min="0"
                max="100"
                value={p.channels[key]}
                onChange={(e) =>
                  audio.preferences({
                    channels: { ...p.channels, [key]: Number(e.target.value) },
                  })
                }
              />
              <output>{p.channels[key]} %</output>
            </label>
            <small>{customNames[key] ?? "Originalsignal"}</small>
            <div className="sound-preview">
              <button
                disabled={
                  p.muted || !p.effects || !p.masterVolume || !p.channels[key]
                }
                onClick={() =>
                  void audio.unlock().then(() => audio.cue(previewCue[key]))
                }
              >
                {name} anhören
              </button>
              <button
                disabled={!!busy || !customNames[key]}
                onClick={() => void upload(key)}
              >
                Original {name}
              </button>
            </div>
            <label>
              Datei für {name}
              <input
                type="file"
                accept=".wav,.mp3,.ogg,audio/wav,audio/mpeg,audio/ogg"
                disabled={!!busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void upload(key, file);
                }}
              />
            </label>
          </section>
        );
      })}
      <p role="status">{busy ? "Audiodatei wird geprüft …" : message}</p>
    </details>
  );
}
