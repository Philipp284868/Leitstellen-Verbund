import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Database, DATABASE_VERSION } from "../server/database";
import { planEconomyMigration } from "../server/economy-migration";
import { fresh, missionSchema } from "../src/model";
import { newEconomy } from "../src/economy/schema";
import { ledgerBalance } from "../src/economy/ledger";
import { buildReport } from "../src/simulation/reports";
import { legacyMissionRewards, mt } from "../src/catalog";
import { convertLegacyCredits } from "../src/economy/migration";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(resolve(tmpdir(), "lv-euro-migration-"));
  dirs.push(dir);
  const db = new Database(dir),
    s = fresh("Alte Leitstelle", "Nord", 10000);
  s.player.id = "legacy-euro";
  delete s.economy;
  delete s.staffing;
  s.money = 123456;
  s.xp = 5500;
  s.statistics.credits = 4321;
  s.journal = [
    { id: "old", at: 500, amount: -5432, text: "Historischer Kauf" },
  ];
  const m = missionSchema.parse({
    id: "old-mission",
    template: "bin",
    pos: { x: 1000, y: 1000 },
    progress: mt("bin").seconds,
    phase: "done",
    created: 100,
    completed: 500,
    shared: false,
    round: "old-round",
    contributors: [],
    transports: [],
  });
  m.report = buildReport(m);
  m.report.credits = 4321;
  m.report.xp = 120;
  s.archive = [m];
  s.missions = [
    {
      ...structuredClone(m),
      id: "pending",
      phase: "offered",
      completed: 0,
      progress: 0,
      report: undefined,
    },
  ];
  db.sql
    .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
    .run(s.player.id, "legacy-euro", "unused", "player", 1);
  db.sql
    .prepare("INSERT INTO saves VALUES(?,?)")
    .run(s.player.id, JSON.stringify(s));
  db.sql
    .prepare("INSERT INTO mission_history VALUES(?,?,?,?,?,?,?,?)")
    .run(
      s.player.id,
      "multi",
      m.id,
      500,
      "Feuerwehr",
      0,
      "old",
      JSON.stringify(m),
    );
  db.sql
    .prepare("INSERT INTO rewards VALUES(?,?,?)")
    .run("old-reward", s.player.id, 4321);
  db.sql.exec("PRAGMA user_version=13");
  db.close();
  return { dir, s };
}
describe("Offline Euro-/Personal-Datenbankmigration 14", () => {
  it("führt den tatsächlichen CLI-Dry-Run mit bytegleich erhaltener Datenbank aus", () => {
    const { dir } = fixture(),
      file = resolve(dir, "game.sqlite"),
      before = readFileSync(file);
    const result = spawnSync(
      process.execPath,
      [resolve(".tools/legacy-tests/server/cli.js"), "migration-preview"],
      {
        env: {
          ...process.env,
          DATA_DIR: dir,
          PUBLIC_URL: "http://127.0.0.1:7777",
          PORT: "7777",
        },
        encoding: "utf8",
        windowsHide: true,
        timeout: 15000,
      },
    );
    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.readOnly).toBe(true);
    expect(output.targetVersion).toBe(DATABASE_VERSION);
    expect(output.economy.saves[0].converted).toBe(true);
    expect(output.economy.totals.historyAfterCents).toBe("4321000");
    expect(readFileSync(file)).toEqual(before);
    expect(
      readdirSync(dir).filter(
        (f) => f.startsWith("pre-migration-") || f === "server.lock",
      ),
    ).toEqual([]);
  });
  it("prüft ohne Änderung vorab und sichert alle alten Beträge vor der gemeinsamen Transaktion", () => {
    const { dir, s } = fixture(),
      path = resolve(dir, "game.sqlite"),
      read = new DatabaseSync(path, { readOnly: true });
    const original = String(read.prepare("SELECT data FROM saves").get()!.data);
    const plan = planEconomyMigration(read);
    expect(plan.summary.saves[0].oldXp).toBe(5500);
    expect(plan.summary.totals.historyAfterCents).toBe("4321000");
    expect(String(read.prepare("SELECT data FROM saves").get()!.data)).toBe(
      original,
    );
    expect(read.prepare("PRAGMA user_version").get()!.user_version).toBe(13);
    read.close();
    const db = new Database(dir),
      converted = db.all().get(s.player.id)!;
    expect(db.sql.prepare("PRAGMA user_version").get()!.user_version).toBe(
      DATABASE_VERSION,
    );
    expect(converted.xp).toBe(5500);
    expect(converted.economy!.version).toBe(1);
    expect(converted.economy!.priceVersion).toBe(1);
    expect(converted.staffing!.version).toBe(1);
    expect(converted.missions[0].paymentCents).toBe(
      convertLegacyCredits(legacyMissionRewards.get("bin")!),
    );
    expect(converted.archive[0].report!.credits).toBe(4321000);
    expect(converted.statistics.credits).toBe(4321000);
    expect(converted.journal.find((j) => j.id === "old")!.amount).toBe(
      -5432000,
    );
    expect(ledgerBalance(converted)).toBe(converted.money);
    expect(db.sql.prepare("SELECT amount FROM rewards").get()!.amount).toBe(
      4321000,
    );
    expect(
      JSON.parse(
        String(db.sql.prepare("SELECT data FROM mission_history").get()!.data),
      ).report.credits,
    ).toBe(4321000);
    expect(
      db.sql
        .prepare(
          "SELECT name FROM sqlite_master WHERE name IN ('tutorial_progress','training_worlds')",
        )
        .all(),
    ).toHaveLength(2);
    db.close();
    const backup = readdirSync(dir).find((f) =>
      f.startsWith("pre-migration-"),
    )!;
    const preserved = new DatabaseSync(resolve(dir, backup), {
      readOnly: true,
    });
    expect(preserved.prepare("PRAGMA user_version").get()!.user_version).toBe(
      13,
    );
    expect(
      String(preserved.prepare("SELECT data FROM saves").get()!.data),
    ).toBe(original);
    preserved.close();
    const again = new Database(dir),
      after = again.all().get(s.player.id)!;
    expect(after).toEqual(converted);
    expect(
      planEconomyMigration(again.sql).summary.saves[0].compensationCents,
    ).toBe(0);
    again.close();
    expect(
      readdirSync(dir).filter((f) => f.startsWith("pre-migration-")),
    ).toHaveLength(1);
  });
  it("bricht bei einem ungültigen Altbetrag ohne teilweise umgerechnete Konten ab", () => {
    const { dir, s } = fixture(),
      path = resolve(dir, "game.sqlite"),
      raw = new DatabaseSync(path);
    raw
      .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
      .run("bad", "bad", "unused", "player", 1);
    raw.prepare("INSERT INTO saves VALUES(?,?)").run(
      "bad",
      JSON.stringify({
        ...s,
        player: { ...s.player, id: "bad" },
        money: 1000000000001,
      }),
    );
    const before = raw.prepare("SELECT data FROM saves ORDER BY user_id").all();
    raw.close();
    expect(() => new Database(dir)).toThrow("Alt-Creditbetrag");
    const check = new DatabaseSync(path, { readOnly: true });
    expect(check.prepare("PRAGMA user_version").get()!.user_version).toBe(13);
    expect(
      check.prepare("SELECT data FROM saves ORDER BY user_id").all(),
    ).toEqual(before);
    expect(check.prepare("SELECT amount FROM rewards").get()!.amount).toBe(
      4321,
    );
    check.close();
  });
  it("erkennt bereits in Cent gespeicherte Konten auch in gemischten Wartungsbeständen", () => {
    const { dir, s } = fixture(),
      raw = new DatabaseSync(resolve(dir, "game.sqlite"));
    const modern = fresh("Euro", "Süd", 10000);
    modern.player.id = "modern";
    modern.economy = newEconomy(modern.time, modern.money);
    raw
      .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
      .run("modern", "modern", "unused", "player", 1);
    raw
      .prepare("INSERT INTO saves VALUES(?,?)")
      .run("modern", JSON.stringify(modern));
    raw
      .prepare("INSERT INTO rewards VALUES(?,?,?)")
      .run("modern-reward", "modern", 10001);
    raw.close();
    const db = new Database(dir);
    expect(db.all().get("modern")!.money).toBe(modern.money);
    expect(db.all().get(s.player.id)!.money).toBeGreaterThan(s.money * 1000);
    expect(
      db.sql
        .prepare("SELECT amount FROM rewards WHERE id='modern-reward'")
        .get()!.amount,
    ).toBe(10001);
    db.close();
  });
});
