import { buyRealFacility } from "./real-facility";
// Isolated real-geography acceptance fixture. IPC controls only fixture events, time and restart.
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Auth } from "../../src/server/auth";
import { Database } from "../../src/server/database";
import { prepareGeography } from "../../src/server/germany/runtime";
import { startServer } from "../../src/server/index";
import { apply, tick } from "../../src/shared/engine";
import { project } from "../../src/shared/germany/projection";
import {
  fresh,
  validate,
  type Mission,
  type Save,
} from "../../src/shared/model";
import { xpForLevel } from "../../src/shared/progression";
import { attachIncident } from "../../src/simulation/calls";
import { attachDynamics } from "../../src/simulation/dynamics";
import { breakVehicle } from "../../src/simulation/faults";
import { vehiclePosition } from "../../src/shared/vehicle-position";
import { fundTestBudget } from "../money-fixture";

const dataDir = mkdtempSync(resolve(tmpdir(), "lv-incident-real-"));
const config = {
  host: "127.0.0.1",
  port: 0,
  publicUrl: "http://127.0.0.1:0",
  dataDir,
  secure: false,
  trustedProxies: [],
  geodataDir: resolve(
    process.env.GEODATA_DIR || "../leitstellen-deutschland-geodata",
  ),
  routerUrl: process.env.ROUTER_URL || "http://127.0.0.1:8989",
};
let geography = await prepareGeography(config);
const db = new Database(dataDir),
  auth = new Auth(db),
  password = "Acceptance-" + randomUUID();
const owner = await auth.create(
  "incident-main",
  password,
  "Mara König",
  "Leitstelle Berlin-Mitte",
);
const member = await auth.create(
  "incident-member",
  password,
  "Lea Fischer",
  "Leitstelle Berlin-Mitte",
);
const s = fresh(
  "Mara König",
  "Leitstelle Berlin-Mitte",
  Date.now() / 1000 - 10000,
);
s.player.id = owner;
s.generation = "a2200000-1111-4222-8333-444444444444";
s.seed = 124;
s.xp = xpForLevel(30);
fundTestBudget(s, 10000000);

s.missionWait = 100000;
for (const [kind, lon, lat, types] of [
  ["fire", 13.405, 52.52, ["tlf", "dlk", "hlf"]],
  ["ems", 13.422, 52.515, ["rtw", "nef"]],
] as [string, number, number, string[]][]) {
  buyRealFacility(s, kind, project({ lon, lat }));
  const home = s.buildings.at(-1)!;
  tick(s, home.ready + 1, {}, false, false);
  if (kind === "fire")
    home.organization = { kind: "bf", turnout: 30, crew: "normal", reserve: 0 };
  for (let i = 0; i < 2; i++) {
    apply(s, { type: "upgrade", id: home.id });
    tick(s, home.ready + 1, {}, false, false);
  }
  if (kind === "ems") {
    apply(s, { type: "extension", id: home.id, kind: "doctor" });
    tick(s, home.ready + 1, {}, false, false);
  }
  for (const type of types) {
    apply(s, { type: "buy", kind: type, home: home.id });
  }
}
tick(s, Date.now() / 1000, {}, false, false);
s.missions = [];
function scenario(
  save: Save,
  template: "bin" | "sick",
  lon: number,
  lat: number,
  residual = false,
) {
  const anchor = geography!.provider.nearest(project({ lon, lat }));
  const m: Mission = {
    id: randomUUID(),
    template,
    pos: { x: anchor.x, y: anchor.y },
    progress: 0,
    phase: "offered",
    created: save.time,
    completed: 0,
    shared: false,
    round: randomUUID(),
    contributors: [],
    transports: [],
  };
  save.missions.push(m);
  attachIncident(save, m);
  attachDynamics(save, m);
  // This fixture proves withdrawal while unrelated work is still outstanding.
  // It does not grant work progress or bypass the ordinary dispatch/arrival/assessment path.
  if (residual)
    m.tasks!.entries.push({
      id: "fixture-ladder-work",
      skill: "ladder",
      required: 1,
      seconds: 900,
      progress: 0,
      done: false,
      completedAt: 0,
    });
  m.dynamics!.nextEvent = save.time + 100000;
  save.missionWait = 100000;
  return m.id;
}
const first = scenario(s, "bin", 13.412, 52.526, true);
fundTestBudget(s, 842350);
db.save(owner, validate(s));
db.sql.prepare("INSERT INTO desk_members VALUES (?,?)").run(member, owner);
db.close();
let app = startServer(config, resolve("dist/client"), geography);
await app.listen();
const address = app.http.address();
if (!address || typeof address === "string") throw Error("No HTTP port");
config.port = address.port;
config.publicUrl = `http://127.0.0.1:${address.port}`;
process.send?.({
  type: "ready",
  origin: config.publicUrl,
  password,
  owner,
  member,
  first,
  dataDir,
});
console.log(
  JSON.stringify({ type: "ready", origin: config.publicUrl, dataDir }),
);
process.on(
  "message",
  async (message: {
    type: string;
    id?: number;
    seconds?: number;
    scenario?: "fire" | "medical";
  }) => {
    try {
      if (message.type === "shutdown") {
        await app.close();
        process.exit(0);
      }
      if (message.type === "advance")
        app.game.step(message.seconds ?? 1, Date.now(), { generation: false });
      if (message.type === "scenario") {
        const save = app.db.all().get(owner)!;
        if (message.scenario === "medical")
          scenario(save, "sick", 13.421, 52.521);
        else scenario(save, "bin", 13.421, 52.529);
        app.db.save(owner, validate(save));
      }
      if (message.type === "fault") {
        const save = app.db.all().get(owner)!,
          v = save.vehicles.find((v) => v.type === "tlf")!;
        breakVehicle(save, v, "technical");
        app.db.save(owner, validate(save));
      }
      if (message.type === "restart") {
        await app.close();
        geography = await prepareGeography(config);
        app = startServer(config, resolve("dist/client"), geography);
        await app.listen();
      }
      const save = app.db.all().get(owner)!;
      process.send?.({
        type: "reply",
        id: message.id,
        save,
        positions: Object.fromEntries(
          save.vehicles.map((v) => [v.id, vehiclePosition(v, save.time)]),
        ),
      });
    } catch (error) {
      process.send?.({ type: "reply", id: message.id, error: String(error) });
    }
  },
);
process.once("disconnect", () => void app.close().then(() => process.exit(0)));
