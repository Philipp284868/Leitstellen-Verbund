import { createRoot } from "react-dom/client";
import { useState } from "react";
import { GermanyMap } from "../../src/germany/GermanyMap";
import { project } from "../../src/germany/projection";
import type { Save } from "../../src/model";
import { emit } from "../../src/store";

// Deliberately minimal UI contract fixture. Empty map tiles are supplied by the
// test server; this is not real-world geographical or routing acceptance.
const save = {
  world: "germany-1",
  worldSeed: 42,
  time: 1000,
  completed: 0,
  treated: 0,
  player: { id: "controls-fixture", name: "Steuerungsprüfung" },
  buildings: [
    {
      id: "station-fixture",
      name: "Testwache",
      type: "fire",
      pos: project({ lon: 13.405, lat: 52.52 }),
      level: 1,
    },
  ],
  vehicles: [],
  missions: [],
  people: [],
} as unknown as Save;
emit({ mode: "multi", readonly: false });
function App() {
  const [selected, setSelected] = useState(""),
    [placing, setPlacing] = useState("");
  return (
    <>
      <header>
        <b>Isolierte Kartensteuerungsprüfung · keine Geografieabnahme</b>
        <button onClick={() => setPlacing("fire")}>Testbau starten</button>
        <output data-testid="selection">{selected}</output>
      </header>
      <GermanyMap
        s={save}
        selected={selected}
        onSelect={setSelected}
        placing={placing}
        onPlace={() => {
          setSelected("placed");
          setPlacing("");
        }}
        onCancelPlace={() => setPlacing("")}
        friends={[]}
      />
      <input aria-label="Normales Texteingabefeld" />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
