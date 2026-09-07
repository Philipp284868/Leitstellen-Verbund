import { useEffect, useRef, useState } from "react";
import { useGame } from "./store";
export function ReconnectSummary() {
  const { save, readonly, user, mode } = useGame();
  const live = useRef(false),
    identity = useRef("");
  const [summary, setSummary] = useState("");
  useEffect(() => {
    if (!save || !user || readonly) {
      live.current = false;
      return;
    }
    const key = `lv-seen:${user.id}:${mode}:${save.player.id}`;
    if (identity.current !== key) {
      live.current = false;
      identity.current = key;
      setSummary("");
    }
    try {
      if (!live.current) {
        const old = JSON.parse(sessionStorage.getItem(key) ?? "null");
        if (
          old?.generation === save.generation &&
          Number.isSafeInteger(old.sequence) &&
          old.sequence <= save.desk.sequence
        ) {
          const events = [...save.missions, ...save.archive]
            .flatMap((m) => m.control?.events ?? [])
            .filter((e) => Number(e.id.split("-").at(-1)) > old.sequence);
          if (events.length)
            setSummary(
              `${events.length} neue aufgezeichnete Ereignisse seit deiner letzten Verbindung: ${events.filter((e) => e.type === "CALL_RECEIVED").length} Notrufe, ${events.filter((e) => e.type === "MISSION_COMPLETED").length} Abschlüsse, ${events.filter((e) => e.type === "SPEAK_REQUESTED").length} Sprechwünsche.`,
            );
        }
      }
      sessionStorage.setItem(
        key,
        JSON.stringify({
          generation: save.generation,
          sequence: save.desk.sequence,
        }),
      );
    } catch {
      /* Summary is optional when browser storage is unavailable. */
    }
    live.current = true;
  }, [save, readonly, user, mode]);
  if (
    !summary ||
    !save ||
    !user ||
    identity.current !== `lv-seen:${user.id}:${mode}:${save.player.id}`
  )
    return null;
  return (
    <aside className="reconnect-summary" role="status">
      <p>{summary}</p>
      <button onClick={() => setSummary("")}>Zusammenfassung schließen</button>
    </aside>
  );
}
