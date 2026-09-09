// Development only: use exactly the production coordinator in a transient SQLite database.
import type { Save } from "../src/model";
import { missionSchema } from "../src/model";
import { Database } from "./database";
import { Game } from "./game";
import { writeWorldSituation } from "./world-situation";
import { createSituation } from "../src/simulation/world-situation";
export function stepLaboratoryWorlds(saves: Save[], seconds: number) {
  const db = new Database("", { memory: true });
  try {
    writeWorldSituation(
      db.sql,
      saves[0].worldSituation ??
        createSituation(saves[0].time, saves[0].seed, "normal"),
    );
    for (const s of saves) {
      db.sql
        .prepare("INSERT INTO users VALUES (?,?,?,?,?)")
        .run(s.player.id, s.player.id, "offline-lab-no-login", "player", 0);
      db.save(s.player.id, s);
    }
    new Game(db).step(seconds, (saves[0].time + seconds) * 1000, {
      generation: false,
      // Historical laboratory presets intentionally control exact weather kinds
      // (including fog). Production always uses the shared situation by default.
      sharedSituation: !!saves[0].worldSituation,
    });
    const result = db.all();
    for (const [owner, s] of result)
      s.archive = db.sql
        .prepare(
          "SELECT data FROM mission_history WHERE owner=? AND mode='multi' ORDER BY completed DESC,id DESC",
        )
        .all(owner)
        .map((row) => missionSchema.parse(JSON.parse(String(row.data))));
    return saves.map((s) => result.get(s.player.id)!);
  } finally {
    db.close();
  }
}
