import type { DatabaseSync } from "node:sqlite";
import type { WaterAuthority } from "../../simulation/water-authority";
import type { WaterSource } from "../../shared/germany/water";
/** Shared finite flow, not multiplied by vehicle count. A five-second hydraulic buffer
 * matches the fixed simulation quantum; its remaining volume survives a restart. */
export class SharedWater implements WaterAuthority {
  constructor(
    private sql: DatabaseSync,
    private consumers: (source: string) => number = () => 1,
  ) {}
  draw(
    source: WaterSource,
    consumer: string,
    at: number,
    litres: number,
    seconds: number,
  ) {
    if (!this.sql.isTransaction)
      throw Error("Wasserentnahme benötigt eine Spieltransaktion.");
    if (source.usable === false || litres <= 0 || seconds <= 0) return 0;
    const rate = source.flowLpm / 60,
      maximum = rate * 5;
    const priorDraw = this.sql
      .prepare(
        "SELECT at,litres FROM water_consumers WHERE source=? AND consumer=?",
      )
      .get(source.id, consumer);
    if (priorDraw && Number(priorDraw.at) > at) return 0;
    const already =
      Number(priorDraw?.at) === at ? Number(priorDraw!.litres) : 0;
    const previous = this.sql
      .prepare("SELECT at,litres FROM water_flow WHERE source=?")
      .get(source.id);
    const available = previous
      ? Math.min(
          maximum,
          Number(previous.litres) +
            Math.max(0, at - Number(previous.at)) * rate,
        )
      : maximum;
    const used = Math.max(
      0,
      Math.min(
        litres,
        available,
        (rate * seconds) / Math.max(1, this.consumers(source.id)) - already,
      ),
    );
    this.sql
      .prepare(
        "INSERT INTO water_flow VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET at=excluded.at,litres=excluded.litres",
      )
      .run(
        source.id,
        Math.max(at, Number(previous?.at ?? 0)),
        available - used,
      );
    this.sql
      .prepare(
        "INSERT INTO water_consumers VALUES(?,?,?,?) ON CONFLICT(source,consumer) DO UPDATE SET at=excluded.at,litres=excluded.litres",
      )
      .run(source.id, consumer, at, already + used);
    this.sql
      .prepare("DELETE FROM water_consumers WHERE source=? AND at<?")
      .run(source.id, at - 30);
    return used;
  }
}
