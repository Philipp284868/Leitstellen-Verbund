import { useDevicePreferences } from "./device-preferences";
import { useEffect, useRef, useState } from "react";
import { useGame } from "./store";
import { openNavigation, navigation } from "./navigation";
export function ReconnectSummary() {
  const { save, readonly, user, mode } = useGame();
  const preferences = useDevicePreferences();
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
          const openCalls = save.missions
            .flatMap((m) => m.control?.calls ?? [])
            .filter(
              (c) => c.state === "ringing" || c.state === "dropped",
            ).length;
          const openRadio = save.missions
            .flatMap((m) => m.control?.radio ?? [])
            .filter((r) => r.state === "open");
          const urgent = openRadio.filter(
            (r) => r.reason === "request" || r.priority !== "NORMAL",
          ).length;
          if (events.length || openCalls || openRadio.length)
            setSummary(
              `Wieder verbunden. Jetzt offen: ${openCalls} Notrufe, ${openRadio.length} Sprechwünsche${urgent ? `, darunter ${urgent} dringende Meldungen oder Nachforderungen` : ""}. Seit der letzten Verbindung wurden ${events.filter((e) => e.type === "MISSION_COMPLETED").length} Einsätze abgeschlossen. ${events.length} protokollierte Änderungen sind im Einsatzverlauf nachlesbar.`,
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
    !preferences.reconnectSummary ||
    !summary ||
    !save ||
    !user ||
    identity.current !== `lv-seen:${user.id}:${mode}:${save.player.id}`
  )
    return null;
  return (
    <aside className="reconnect-summary" role="status">
      <p>{summary}</p>
      <button
        onClick={() =>
          openNavigation(navigation.find((n) => n.id === "archive")!)
        }
      >
        Einsatzarchiv öffnen
      </button>
      <button onClick={() => setSummary("")}>Zusammenfassung schließen</button>
    </aside>
  );
}
