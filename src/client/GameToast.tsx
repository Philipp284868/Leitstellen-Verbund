import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { Bell, TriangleAlert } from "lucide-react";
import { gameToasts } from "./toast-queue";
export function GameToast() {
  const toast = useSyncExternalStore(gameToasts.subscribe, gameToasts.snapshot);
  useEffect(() => gameToasts.attach(), []);
  useLayoutEffect(() => {
    if (toast) gameToasts.shown(toast.id);
  }, [toast?.id]);
  if (!toast) return null;
  const Icon = toast.priority === "critical" ? TriangleAlert : Bell;
  return (
    <div
      className="game-toast"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-toast-id={toast.id}
      data-priority={toast.priority}
    >
      <Icon size={18} />
      <span>{toast.text}</span>
    </div>
  );
}
