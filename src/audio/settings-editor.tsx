import {
  audio,
  useSound,
  type SoundPreferences,
  defaultSound,
} from "./controller";
import {
  mixerGroups,
  type MixerGroup,
  exportSoundPreferences,
} from "./preferences";
import { useEffect, useRef, useState } from "react";
import { mixes } from "./profiles";
import { musicTitles, type Cue } from "./synth";
import { SoundProfiles } from "../SoundProfiles";

const probes: Record<MixerGroup, Cue> = {
  music: "musicMenu",
  ambience: "ambience",
  phone: "phone",
  radio: "radioOpen",
  alarm: "dme",
  ui: "complete",
};
const descriptions: Record<MixerGroup, string> = {
  music: `${musicTitles.menu} im Hauptmenü · ${musicTitles.game} im Spiel`,
  ambience: "Leise Büroatmosphäre, unabhängig vom Einsatzgeschehen",
  phone: "Klingeln, Annahme und Gesprächsende",
  radio: "Funk, Sprechwünsche und geschützte Prioritätssignale",
  alarm: "Pieper, Wachalarm, Gong und Sirenenalarmierung",
  ui: "Dezente Bedienung, Erfolge und Fehler",
};
const statusLabels = {
  waiting: "Ton wartet auf deine bewusste Interaktion.",
  playing: "Audio ist aktiv.",
  paused: "Audio pausiert oder ein anderer Tab übernimmt die Ausgabe.",
  muted: "Alle Klänge sind stummgeschaltet.",
  unavailable:
    "Der Browser konnte Audio nicht starten. Erneut aktivieren ist möglich.",
};

export function AudioSettingsEditor({
  draft: p,
  onChange,
}: {
  draft: SoundPreferences;
  onChange: (next: SoundPreferences) => void;
}) {
  const { status, error, previewing } = useSound();
  const [fileMessage, setFileMessage] = useState(""),
    [fileError, setFileError] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const change = (values: Partial<SoundPreferences>) =>
    onChange({ ...p, ...values });
  const volume = (
    name: string,
    value: number,
    set: (n: number) => void,
    disabled = false,
  ) => (
    <label className="sound-volume">
      {name}
      <input
        aria-label={name}
        type="range"
        min="0"
        max="100"
        step="1"
        value={value}
        disabled={disabled}
        onChange={(e) => set(Number(e.currentTarget.value))}
      />
      <output>{value} %</output>
    </label>
  );
  return (
    <section
      className="sound-settings sound-editor"
      aria-label="Audioeinstellungen"
    >
      <div className="sound-heading">
        <div>
          <span className="eyebrow">KLANG DER LEITSTELLE</span>
          <h3>Musik & Spielsound</h3>
        </div>
        <button type="button" onClick={() => void audio.unlock()}>
          Audio aktivieren
        </button>
      </div>
      <p className="sound-status" role="status">
        {statusLabels[status]}
      </p>
      {error && (
        <p className="sound-error" role="alert">
          {error}
        </p>
      )}
      <div className="sound-master">
        {volume("Gesamtlautstärke", p.masterVolume, (masterVolume) =>
          change({ masterVolume }),
        )}
        <label>
          <input
            type="checkbox"
            checked={p.muted}
            onChange={(e) => change({ muted: e.target.checked })}
          />
          Alles stummschalten
        </label>
        <label>
          <input
            type="checkbox"
            checked={p.effects}
            onChange={(e) => change({ effects: e.target.checked })}
          />
          Soundeffekte
        </label>
        {volume(
          "Effektlautstärke",
          p.effectsVolume,
          (effectsVolume) => change({ effectsVolume }),
          !p.effects,
        )}
      </div>
      <div className="sound-mixes" aria-label="Klangprofile">
        {Object.entries(mixes).map(([id, mix]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              const { name: _, ...values } = mix;
              void _;
              change({
                ...values,
                ducking: true,
                groupVolumes: {
                  ...p.groupVolumes,
                  ambience: id === "night" ? 12 : 25,
                },
                groupMuted: { ...defaultSound.groupMuted },
              });
            }}
          >
            {mix.name}
          </button>
        ))}
      </div>
      <div className="sound-group-grid">
        {(Object.keys(mixerGroups) as MixerGroup[]).map((group) => {
          const muted = p.groupMuted[group] || (group === "music" && !p.music);
          return (
            <section
              className="sound-mix-group"
              key={group}
              data-audio-group={group}
            >
              <div>
                <h4>{mixerGroups[group]}</h4>
                <p>{descriptions[group]}</p>
              </div>
              {volume(
                group === "music"
                  ? "Musiklautstärke"
                  : `${mixerGroups[group]}lautstärke`,
                group === "music" ? p.musicVolume : p.groupVolumes[group],
                (value) =>
                  group === "music"
                    ? change({ musicVolume: value })
                    : change({
                        groupVolumes: { ...p.groupVolumes, [group]: value },
                      }),
              )}
              <div className="sound-preview">
                <label>
                  <input
                    type="checkbox"
                    checked={muted}
                    onChange={(e) =>
                      change({
                        ...(group === "music"
                          ? { music: !e.target.checked }
                          : {}),
                        groupMuted: {
                          ...p.groupMuted,
                          [group]: e.target.checked,
                        },
                      })
                    }
                  />
                  {mixerGroups[group]} stummschalten
                </label>
                <button
                  type="button"
                  disabled={
                    p.muted ||
                    muted ||
                    !p.masterVolume ||
                    (group !== "music" && !p.effects)
                  }
                  onClick={() => void audio.preview(probes[group])}
                >
                  {mixerGroups[group]} anhören
                </button>
                {group === "music" && (
                  <button
                    type="button"
                    disabled={p.muted || muted || !p.masterVolume}
                    onClick={() => void audio.preview("musicGame")}
                  >
                    Spielmusik anhören
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <div className="sound-preview">
        <button
          type="button"
          disabled={!previewing}
          onClick={() => audio.stopPreview()}
        >
          Hörprobe stoppen
        </button>
        <span>Hörproben enden spätestens nach sechs Sekunden.</span>
      </div>
      <div className="sound-behavior">
        <label>
          Inaktiver Tab
          <select
            value={p.background}
            onChange={(e) =>
              change({
                background: e.target.value as SoundPreferences["background"],
              })
            }
          >
            <option value="pause">Alles pausieren</option>
            <option value="communications">
              Nur Kommunikation und Alarmierung
            </option>
            <option value="continue">Audio weiterlaufen lassen</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={p.ducking}
            onChange={(e) => change({ ducking: e.target.checked })}
          />
          Musik und Umgebung bei Kommunikation absenken
        </label>
        <label>
          <input
            type="checkbox"
            checked={p.parallelRadio}
            onChange={(e) => change({ parallelRadio: e.target.checked })}
          />
          Leitstellenfunk und Nachbarfunk gleichzeitig hören
        </label>
        <p>
          Innerhalb eines Funkkanals bleiben Meldungen geordnet. Vollständig
          angehaltene Tabs können vom Browser keine Audioausgabe erhalten.
        </p>
      </div>
      <SoundProfiles draft={p} onChange={onChange} />
      <details className="sound-profiles">
        <summary>Audioeinstellungen sichern</summary>
        <p>
          Die JSON-Sicherung enthält nur gespeicherte Regler, Mutes und
          Hintergrundregeln. Eigene Audiodateien bleiben getrennt; bewahre ihre
          Originaldateien auf.
        </p>
        <button
          type="button"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([exportSoundPreferences(audio.savedPreferences())], {
                type: "application/json",
              }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "leitstellen-audio-einstellungen.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setFileError("");
            setFileMessage(
              "Gespeicherte Audioeinstellungen zum Download bereitgestellt.",
            );
          }}
        >
          Gespeicherte Audioeinstellungen exportieren
        </button>
        <label>
          Audioeinstellungen aus JSON prüfen
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (!file) return;
              setFileError("");
              try {
                const next = await audio.readPreferences(file);
                if (!mounted.current) return;
                onChange(next);
                setFileMessage(
                  "Sicherung geprüft und als Vorschau geladen. Zum Speichern übernehmen.",
                );
              } catch (reason) {
                setFileError(
                  reason instanceof Error ? reason.message : String(reason),
                );
              }
            }}
          />
        </label>
        {fileMessage && <p role="status">{fileMessage}</p>}
        {fileError && (
          <p role="alert" className="sound-error">
            {fileError}
          </p>
        )}
      </details>
      <p className="sound-hint">
        Diese Einstellungen gelten nur für diesen Browser und diese
        Spieladresse. Änderungen sind eine Vorschau bis „Übernehmen“.
        „Verwerfen“ stellt auch die vorherigen Dateizuordnungen wieder her. Alle
        wichtigen Hinweise bleiben sichtbar.
      </p>
    </section>
  );
}
