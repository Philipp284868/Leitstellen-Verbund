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
    <section className="workspace-settings">
      <h3>Arbeitsplatzlayout und Tastatur</h3>
      <p>
        Gilt für diesen Browser. Tastenkürzel öffnen Ansichten; sie alarmieren
        keine Fahrzeuge. In Eingabefeldern bleiben die Tasten normale
        Texteingaben.
      </p>
      <p>
        Einsätze und Notrufe liegen links, das Textprotokoll bleibt unten links.
        Die Größe folgt der Oberflächenskalierung.
      </p>
      <label>
        <input
          type="checkbox"
          checked={p.compact}
          onChange={(e) => change({ ...p, compact: e.target.checked })}
        />{" "}
        Kompakte Einsatzkarten
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
    </section>
  );
}
