import { useRef, useState } from "react";
import { useDialogDirty } from "./dialog-state";

/** Keep a draft on rejection, serialize clicks before React renders, and prevent
 * navigation while a server command is unresolved. Callers clear drafts only
 * after their actual command promise resolves. */
export function useCommandForm(dirty = false, discard?: () => void) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useDialogDirty(dirty, discard, busy);
  async function run(operation: () => Promise<unknown> | void) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
