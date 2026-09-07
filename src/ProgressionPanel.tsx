import { useEffect, useRef, useState } from "react";
import { buildings, vehicles, extensions, bt } from "./catalog";
import { progress } from "./progression";
import type { Save } from "./model";
export function Progression({ s }: { s: Save }) {
  const p = progress(s.xp),
    previous = useRef({ generation: s.generation, level: p.level });
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const old = previous.current;
    if (old.generation === s.generation && p.level > old.level)
      setNotice(
        `Stufe ${old.level} → ${p.level} erreicht. Neue Kaufmöglichkeiten im Katalog.`,
      );
    previous.current = { generation: s.generation, level: p.level };
  }, [p.level, s.generation]);
  const upcoming = [
    ...buildings.map((b) => ({
      id: "b-" + b.id,
      name: b.name,
      level: b.level,
      detail: `${b.price.toLocaleString("de-DE")} Credits`,
    })),
    ...vehicles.map((v) => ({
      id: "v-" + v.id,
      name: v.name,
      level: v.level,
      detail: `${bt(v.home).name}, Stellplatz, ${v.crew} Personal${v.training ? ", " + v.training : ""}`,
    })),
    ...extensions.map((e) => ({
      id: "e-" + e.id,
      name: e.name,
      level: e.level,
      detail: bt(e.home).name,
    })),
  ].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "de"));
  return (
    <details className="progression-details">
      <summary>Fortschritt & Freischaltungen · Stufe {p.level}</summary>
      {notice && (
        <p role="status">
          {notice} <button onClick={() => setNotice("")}>Schließen</button>
        </p>
      )}
      <p>
        {s.xp.toLocaleString("de-DE")} Gesamt-XP · noch {p.required - p.current}{" "}
        bis Stufe {p.level + 1}
      </p>
      {!!s.progression?.compensation && (
        <p>
          Einmaliger Bestandsschutz: {s.progression.compensation} XP
          Migrationsausgleich. Erspielte XP bleiben erhalten.
        </p>
      )}
      <ol>
        {upcoming.map((u) => (
          <li key={u.id}>
            <strong>
              {u.level <= p.level ? "✓" : "Stufe " + u.level} · {u.name}
            </strong>
            <br />
            {u.detail}
          </li>
        ))}
      </ol>
      <p>
        Nach der letzten Freischaltung läuft der Level-Fortschritt weiter.
        Freischaltungen schenken keine Fahrzeuge.
      </p>
    </details>
  );
}
