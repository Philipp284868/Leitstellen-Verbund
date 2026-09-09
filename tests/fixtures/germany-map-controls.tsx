import { createRoot } from "react-dom/client";
import { useState } from "react";
import { GermanyMap } from "../../src/germany/GermanyMap";
import { project } from "../../src/germany/projection";
import type { Save } from "../../src/model";
import { emit } from "../../src/store";
import { ECONOMY_PRICES } from "../../src/economy/prices";

// Deliberately minimal UI contract fixture. Empty map tiles are supplied by the
// test server; this is not real-world geographical or routing acceptance.
const save = {
  world: "germany-1",
  worldSeed: 42,
  time: 1000,
  money: ECONOMY_PRICES.start,
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
  desk: { fleet: {} },
  vehicles: [],
  missions: [],
  people: [],
} as unknown as Save;
if (new URLSearchParams(location.search).has("fleet")) {
  save.vehicles = ["lf", "dlk", "rtw"].map((type, i) => ({
    id: `vehicle-${i}`,
    type,
    name: `Funkrufname ${type.toUpperCase()}`,
    home: "station-fixture",
    status: "ready",
    path: [save.buildings[0].pos],
    depart: 0,
    arrive: 0,
    mission: null,
    assignment: "",
    personnel: [],
    equipment: [],
    service: 100,
  })) as unknown as Save["vehicles"];
  save.desk.fleet = Object.fromEntries(
    save.vehicles.map((v) => [v.id, { code: 2 }]),
  ) as Save["desk"]["fleet"];
}
emit({ mode: "multi", readonly: false });
function App() {
  const [selected, setSelected] = useState(""),
    [placing, setPlacing] = useState(""),
    [inspected, setInspected] = useState(0),
    [hidden, setHidden] = useState(false);
  return (
    <>
      <header>
        <b>Isolierte Kartensteuerungsprüfung · keine Geografieabnahme</b>
        <button onClick={() => setPlacing("fire")}>Testbau starten</button>
        <button onClick={() => setHidden(!hidden)}>
          Testarbeitsansicht umschalten
        </button>
        <output data-testid="selection">{selected}</output>
        <output data-testid="inspection-count">{inspected}</output>
      </header>
      <GermanyMap
        s={save}
        selected={selected}
        onSelect={setSelected}
        inspectionsHidden={hidden}
        onInspect={() => {
          setInspected((n) => n + 1);
          setSelected("");
          setHidden(false);
        }}
        placing={placing}
        onPlace={() => {
          setSelected("placed");
          setPlacing("");
        }}
        onCancelPlace={() => setPlacing("")}
        friends={[]}
        ownDeskId="own-desk"
        presence={
          new URLSearchParams(location.search).has("presence")
            ? [
                {
                  id: "one",
                  name: "Anna",
                  deskId: "own-desk",
                  deskName: "Testleitstelle",
                  status: "online",
                  location: {
                    ...save.buildings[0].pos,
                    label: "Testwache",
                    source: "station",
                  },
                },
                {
                  id: "two",
                  name: "Ben",
                  deskId: "own-desk",
                  deskName: "Testleitstelle",
                  status: "reconnecting",
                  location: {
                    ...save.buildings[0].pos,
                    label: "Testwache",
                    source: "station",
                  },
                },
                {
                  id: "three",
                  name: "Clara",
                  deskId: "other-desk",
                  deskName: "Nachbarleitstelle",
                  status: "online",
                  location: {
                    ...save.buildings[0].pos,
                    label: "Nachbarwache",
                    source: "station",
                  },
                },
                {
                  id: "four",
                  name: "Ohne Standort",
                  deskId: "empty",
                  deskName: "Noch im Aufbau",
                  status: "online",
                  location: null,
                },
              ]
            : []
        }
      />
      <input aria-label="Normales Texteingabefeld" />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
