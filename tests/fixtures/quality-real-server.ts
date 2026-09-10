import { buyRealFacility } from "./real-facility";
// Isolated acceptance harness. Commands arrive only over the parent process IPC channel.
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Auth } from "../../server/auth";
import { Database } from "../../server/database";
import { prepareGeography } from "../../server/germany/runtime";
import { startServer } from "../../server/index";
import { mt } from "../../src/catalog";
import { apply, generate, tick } from "../../src/engine";
import { project } from "../../src/germany/projection";
import { fresh, validate } from "../../src/model";
import { xpForLevel } from "../../src/progression";
import { attachIncident } from "../../src/simulation/calls";
import { fundTestBudget } from "../money-fixture";
mkdirSync(".tools/test-runs", { recursive: true });
const dataDir = mkdtempSync(resolve(tmpdir(), "lv-quality-real-"));
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
  password = "Review-" + randomUUID();
const ids: string[] = [];
for (const [username, name, station] of [
  ["quality-main", "Mara König", "Leitstelle Berlin-Mitte"],
  ["quality-neighbor", "Jonas Weber", "Leitstelle Berlin-West"],
  ["quality-member", "Lea Fischer", "Disponentin Berlin-Mitte"],
  ["quality-new", "Emil Braun", "Standort noch offen"],
])
  ids.push(await auth.create(username, password, name, station));
for (let index = 0; index < 2; index++) {
  const old = db.all().get(ids[index])!;
  const s = fresh(
    old.player.name,
    old.player.station,
    Date.now() / 1000 - 10000,
  );
  s.player.id = ids[index];
  s.seed = 124;
  s.xp = xpForLevel(30);
  fundTestBudget(s, 10000000);
  s.tutorial = 6;
  s.missionWait = 100000;
  for (const [kind, lon, lat, types] of (index === 0
    ? [
        ["fire", 13.405, 52.52, ["hlf", "tlf", "dlk", "elw", "rw"]],
        ["ems", 13.422, 52.515, ["rtw", "nef", "ktw"]],
        ["police", 13.395, 52.51, ["fustw"]],
      ]
    : [["fire", 13.35, 52.515, ["hlf", "tlf"]]]) as [
    string,
    number,
    number,
    string[],
  ][]) {
    buyRealFacility(s, kind, project({ lon, lat }));
    const home = s.buildings.at(-1)!;
    tick(s, home.ready + 1, {}, false, false);
    if (kind === "fire")
      home.organization = {
        kind: "bf",
        turnout: 30,
        crew: "normal",
        reserve: 0,
      };
    for (let j = 0; j < 3; j++) {
      apply(s, { type: "upgrade", id: home.id });
      tick(s, home.ready + 1, {}, false, false);
    }
    if (kind === "fire")
      apply(s, { type: "extension", id: home.id, kind: "technical" });
    if (kind === "ems")
      apply(s, { type: "extension", id: home.id, kind: "doctor" });
    tick(s, home.ready + 1, {}, false, false);
    for (const type of types) {
      apply(s, { type: "buy", kind: type, home: home.id });
    }
  }
  tick(s, Date.now() / 1000, {}, false, false);
  fundTestBudget(s, index ? 630000 : 842350);
  if (index === 0) {
    generate(s);
    const m = s.missions[0];
    m.template = "field";
    m.paymentCents = mt("field").reward;
    const p = geography!.provider.nearest(
      project({ lon: 13.412, lat: 52.526 }),
    );
    m.pos = { x: p.x, y: p.y };
    s.seed = 124;
    attachIncident(s, m);
  }
  s.missionWait = 100000;
  db.save(ids[index], validate(s));
}
db.sql.prepare("INSERT INTO desk_members VALUES (?,?)").run(ids[2], ids[0]);
db.close();
let app = startServer(config, resolve("dist/client"), geography);
await app.listen();
const address = app.http.address();
if (!address || typeof address === "string") throw Error("No port");
config.port = address.port;
config.publicUrl = `http://127.0.0.1:${address.port}`;
const ready = {
  type: "ready",
  origin: config.publicUrl,
  password,
  ids,
  dataDir,
};
writeFileSync(".tools/quality-real-connection.json", JSON.stringify(ready));
process.send?.(ready);
console.log(
  JSON.stringify({ type: "ready", origin: config.publicUrl, dataDir }),
);
process.on(
  "message",
  async (message: {
    type: string;
    id?: number;
    seconds?: number;
    userIndex?: number;
  }) => {
    try {
      if (message.type === "shutdown") {
        await app.close();
        process.exit(0);
      }
      if (message.type === "advance") app.game.step(message.seconds ?? 1);
      const userIndex = message.userIndex ?? 3;
      if (
        !Number.isInteger(userIndex) ||
        userIndex < 0 ||
        userIndex >= ids.length
      )
        throw Error("Unknown fixture user");
      if (message.type === "practice-advance") {
        const row = app.db.sql
          .prepare("SELECT updated_at FROM training_worlds WHERE user_id=?")
          .get(ids[userIndex]);
        if (!row) throw Error("Start practice through the UI first");
        app.tutorial.step(
          Number(row.updated_at) + (message.seconds ?? 1) * 1000,
        );
        app.db.sql
          .prepare("UPDATE training_worlds SET updated_at=? WHERE user_id=?")
          .run(Date.now(), ids[userIndex]);
      }
      if (message.type === "restart") {
        await app.close();
        geography = await prepareGeography(config);
        app = startServer(config, resolve("dist/client"), geography);
        await app.listen();
      }
      if (
        message.type === "practice-save" ||
        message.type === "practice-advance" ||
        message.type === "save" ||
        message.type === "advance" ||
        message.type === "restart"
      )
        process.send?.({
          type: "reply",
          id: message.id,
          save: message.type.startsWith("practice-")
            ? app.tutorial.trainingSave(ids[userIndex])
            : app.db.all().get(ids[0]),
        });
    } catch (error) {
      process.send?.({ type: "reply", id: message.id, error: String(error) });
    }
  },
);
process.once("disconnect", () => void app.close().then(() => process.exit(0)));
