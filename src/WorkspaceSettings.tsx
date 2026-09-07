import {
  shortcutNames,
  defaultWorkspace,
  type WorkspacePreferences,
  type Shortcut,
} from "./workspace";
export function WorkspaceSettings({
  value: p,
  change,
}: {
  value: WorkspacePreferences;
  change: (p: WorkspacePreferences) => void;
}) {
  return (
    <details className="workspace-settings">
      <summary>Arbeitsplatzlayout und Tastatur</summary>
      <p>
        Gilt für diesen Browser. Tastenkürzel öffnen Ansichten; sie alarmieren
        keine Fahrzeuge. In Eingabefeldern bleiben die Tasten normale
        Texteingaben.
      </p>
      <label>
        Einsatzspalte
        <select
          aria-label="Einsatzspalte"
          value={p.side}
          onChange={(e) => change({ ...p, side: e.target.value })}
        >
          <option value="left">Links von der Karte</option>
          <option value="right">Rechts von der Karte</option>
        </select>
      </label>
      <label>
        Breite der Einsatzspalte
        <select
          aria-label="Breite der Einsatzspalte"
          value={p.width}
          onChange={(e) => change({ ...p, width: Number(e.target.value) })}
        >
          {[280, 320, 380].map((n) => (
            <option key={n} value={n}>
              {n} Pixel
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={p.compact}
          onChange={(e) => change({ ...p, compact: e.target.checked })}
        />{" "}
        Kompakte Einsatzkarten
      </label>
      <label>
        <input
          type="checkbox"
          checked={p.queueBottom}
          onChange={(e) => change({ ...p, queueBottom: e.target.checked })}
        />{" "}
        Notruf- und Funkübersicht unter der Einsatzliste
      </label>
      <label>
        <input
          type="checkbox"
          checked={p.stationsTop}
          onChange={(e) => change({ ...p, stationsTop: e.target.checked })}
        />{" "}
        Wachen oberhalb der Karte
      </label>
      <div className="shortcut-grid">
        {Object.entries(shortcutNames).map(([id, name]) => (
          <label key={id}>
            {name}
            <input
              aria-label={`Taste: ${name}`}
              maxLength={1}
              value={p.keys[id as Shortcut]}
              onChange={(e) => {
                const key = e.target.value.toLowerCase();
                if (!/^[a-z0-9]?$/.test(key)) return;
                const keys = { ...p.keys };
                for (const k of Object.keys(keys) as Shortcut[])
                  if (key && keys[k] === key) keys[k] = "";
                keys[id as Shortcut] = key;
                change({ ...p, keys });
              }}
            />
          </label>
        ))}
      </div>
      <button onClick={() => change(structuredClone(defaultWorkspace))}>
        Arbeitsplatz zurücksetzen
      </button>
    </details>
  );
}
