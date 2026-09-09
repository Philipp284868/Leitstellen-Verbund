import { useEffect, useState } from "react";
import { audio, useSound, type SoundPreferences } from "./audio/controller";
import { soundStorage } from "./audio/custom";
import {
  channels,
  previewCue,
  customChannel,
  type CustomChannel,
  type SoundChannel,
} from "./audio/profiles";

const bytes = (value: number) =>
  `${(value / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
const length = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")} min`;
export function SoundProfiles({
  draft: p,
  onChange,
}: {
  draft: SoundPreferences;
  onChange: (next: SoundPreferences) => void;
}) {
  const { customSounds, playing, settingsPreview } = useSound();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState("");
  const [pendingEnabled, setPendingEnabled] = useState<
    Partial<Record<CustomChannel, boolean>>
  >({});
  const [storage, setStorage] =
    useState<Awaited<ReturnType<typeof soundStorage>>>(null);
  useEffect(() => {
    void audio
      .refreshCustom()
      .catch((e) =>
        setMessage(
          e instanceof Error
            ? e.message
            : "Der lokale Audiospeicher ist nicht verfügbar.",
        ),
      );
    void soundStorage().then(setStorage);
  }, []);
  const run = async (
    channel: string,
    operation: () => Promise<void>,
    success: string,
  ) => {
    setBusy(channel);
    setMessage("");
    try {
      await operation();
      setMessage(
        settingsPreview
          ? `${success} Änderung vorgemerkt; zum Speichern „Übernehmen“ wählen.`
          : success,
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Audiodatei konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy("");
      setStorage(await soundStorage());
    }
  };
  const disabled = p.muted || !p.effects || !p.masterVolume || !p.effectsVolume;
  return (
    <details className="sound-profiles">
      <summary>Signalregler und eigene Soundprofile</summary>
      <p>
        Eigene WAV-, MP3- und OGG-Dateien bleiben ausschließlich in diesem
        Browser. Es gibt keine feste Dateigröße oder Spieldauer. Entscheidend
        sind der freie Browserspeicher und die vom Browser unterstützten
        Audio-Codecs. Prioritätsalarm und Notfall behalten ihre
        unterschiedlichen Originaltöne.
      </p>
      <p className="sound-storage">
        Eigene Dateien:{" "}
        {bytes(customSounds.reduce((sum, sound) => sum + sound.bytes, 0))}.
        {storage
          ? ` Geschätzt ${bytes(storage.free)} für diese Website frei (${bytes(storage.quota)} Gesamtquota).`
          : " Der Browser stellt keine Speicherschätzung bereit; beim Speichern wird verfügbarer Speicher geprüft."}
      </p>
      <div className="sound-preview">
        <button disabled={!playing} onClick={() => audio.stopCustom()}>
          Eigenen Sound stoppen
        </button>
        {playing && <span role="status">Wiedergabe: {playing}</span>}
      </div>
      {Object.entries(channels).map(([id, name]) => {
        const key = id as SoundChannel,
          custom = customChannel(key);
        const sound = customSounds.find((value) => value.channel === key);
        return (
          <section className="sound-custom" data-sound-channel={key} key={id}>
            <label className="sound-volume">
              {name}lautstärke
              <input
                type="range"
                min="0"
                max="100"
                value={p.channels[key]}
                onChange={(e) =>
                  onChange({
                    ...p,
                    channels: { ...p.channels, [key]: Number(e.target.value) },
                  })
                }
              />
              <output>{p.channels[key]} %</output>
            </label>
            <label>
              <input
                type="checkbox"
                checked={p.channelMuted[key]}
                onChange={(e) =>
                  onChange({
                    ...p,
                    channelMuted: {
                      ...p.channelMuted,
                      [key]: e.currentTarget.checked,
                    },
                  })
                }
              />
              {name} stummschalten
            </label>
            <small>
              {sound
                ? `${sound.name} · ${bytes(sound.bytes)}${sound.duration ? ` · ${length(sound.duration)}` : " · vorhandene Datei"}`
                : "Originalsignal"}
            </small>
            <div className="sound-preview">
              <button
                disabled={disabled || p.channelMuted[key] || !p.channels[key]}
                onClick={() => void audio.preview(previewCue[key])}
              >
                {name} anhören
              </button>
              {!custom && (
                <button
                  disabled={disabled || p.channelMuted[key] || !p.channels[key]}
                  onClick={() => void audio.preview("emergency")}
                >
                  Notfallton anhören
                </button>
              )}
            </div>
            {custom ? (
              <>
                {sound && (
                  <div className="sound-file-actions">
                    <label>
                      <input
                        type="checkbox"
                        checked={pendingEnabled[sound.channel] ?? sound.enabled}
                        disabled={!!busy}
                        onChange={(e) => {
                          const enabled = e.currentTarget.checked;
                          setPendingEnabled((current) => ({
                            ...current,
                            [key]: enabled,
                          }));
                          void run(
                            key,
                            () => audio.enableCustom(key, enabled),
                            enabled
                              ? `${name}: eigene Datei aktiviert.`
                              : `${name}: Originalsignal aktiv, eigene Datei bleibt gespeichert.`,
                          ).finally(() =>
                            setPendingEnabled((current) => {
                              const next = { ...current };
                              delete next[key];
                              return next;
                            }),
                          );
                        }}
                      />
                      Eigene Datei für {name} aktiv
                    </label>
                    <button
                      disabled={!!busy}
                      onClick={() =>
                        void run(
                          key,
                          () => audio.setCustom(key),
                          `${name}: Originalsignal ausgewählt.`,
                        )
                      }
                    >
                      Datei für {name} löschen
                    </button>
                  </div>
                )}
                <label>
                  Datei für {name}
                  <input
                    type="file"
                    accept=".wav,.mp3,.ogg,audio/wav,audio/mpeg,audio/ogg"
                    disabled={!!busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file)
                        void run(
                          key,
                          () => audio.setCustom(key, file),
                          `${name}: eigene Datei lokal geprüft und zugeordnet.`,
                        );
                    }}
                  />
                </label>
                {customSounds.some((value) => value.channel !== key) && (
                  <label>
                    Vorhandenen Sound für {name} zuweisen
                    <select
                      aria-label={`Vorhandenen Sound für ${name} zuweisen`}
                      value=""
                      disabled={!!busy}
                      onChange={(e) => {
                        const source = e.target.value as CustomChannel;
                        if (source)
                          void run(
                            key,
                            () => audio.assignCustom(source, key),
                            `${name}: vorhandene Datei lokal zugewiesen.`,
                          );
                      }}
                    >
                      <option value="">Lokale Datei auswählen</option>
                      {customSounds
                        .filter((value) => value.channel !== key)
                        .map((value) => (
                          <option value={value.channel} key={value.channel}>
                            {value.name} ({channels[value.channel]})
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <p className="sound-protected">
                Geschützter Originalton. Eigene Dateien sind hier nicht
                zuweisbar. Priorität und Notfall unterbrechen nachrangige Funk-,
                Umgebungs- und UI-Sounds; Telefon und Alarmierung bleiben
                hörbar.
              </p>
            )}
          </section>
        );
      })}
      <p role="status">{busy ? "Audiodatei wird lokal geprüft …" : message}</p>
    </details>
  );
}
