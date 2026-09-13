import {
  Menu,
  Search,
  Truck,
  Building2,
  ListChecks,
  Users,
  Archive,
  ChartNoAxesCombined,
  Trophy,
  Newspaper,
  Settings,
  LifeBuoy,
  LogOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { requestDialogTransition } from "./dialog-state";
import { useGame } from "./store";
const items = [
  ["search", "Suchen …", Search],
  ["fleet", "Fahrzeuge", Truck],
  ["stations", "Standorte", Building2],
  ["aaos", "AAO & Disposition", ListChecks],
  ["friends", "Verbund", Users],
  ["archive", "Einsatzarchiv", Archive],
  ["statistics", "Statistiken", ChartNoAxesCombined],
  ["players", "Leaderboard", Trophy],
  ["news", "Changelogs", Newspaper],
  ["settings", "Einstellungen", Settings],
  ["support", "Support", LifeBuoy],
] as const;
export function HudNavigation({
  panel,
  onSearch,
  onMenu,
  onOpen,
}: {
  panel: (id: string) => void;
  onSearch: () => void;
  onMenu: () => void;
  onOpen: () => void;
}) {
  const { readonly } = useGame();
  const [opened, setOpened] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    nav = useRef<HTMLElement>(null);
  const close = () => {
    setOpened(false);
    trigger.current?.focus({ preventScroll: true });
  };
  const act = (fn: () => void) =>
    requestDialogTransition(() => {
      close();
      fn();
    });
  useEffect(() => {
    if (!opened) return;
    nav.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      } else if (
        ["ArrowDown", "ArrowUp", "Home", "End", "Tab"].includes(e.key)
      ) {
        const buttons = [
          ...(nav.current?.querySelectorAll<HTMLButtonElement>("button") ?? []),
        ];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        buttons[
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? buttons.length - 1
              : (i +
                  (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)
                    ? -1
                    : 1) +
                  buttons.length) %
                buttons.length
        ]?.focus();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [opened]);
  return (
    <div className="control-menu-anchor">
      {opened && (
        <div
          className="hud-dismiss"
          aria-hidden="true"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            close();
          }}
        />
      )}
      <button
        ref={trigger}
        className="control-menu-button"
        aria-label="Leitstellenmenü"
        aria-expanded={opened}
        aria-controls="control-menu"
        onClick={() => {
          if (opened) close();
          else {
            onOpen();
            setOpened(true);
          }
        }}
      >
        <Menu size={21} />
        <span>Menü</span>
        {readonly && <small className="offline-badge">Offline</small>}
      </button>
      {opened && (
        <nav
          id="control-menu"
          ref={nav}
          className="control-menu"
          aria-label="Leitstellenmenü"
        >
          <div className="control-menu-scroll">
            {readonly && (
              <p className="menu-connection-state">
                Serververbindung verloren. Aktionen sind gesperrt.{" "}
                <button onClick={() => window.location.reload()}>
                  Neu verbinden
                </button>
                <button onClick={() => act(() => panel("support"))}>
                  Support öffnen
                </button>
              </p>
            )}
            {items.map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() =>
                  act(() => (id === "search" ? onSearch() : panel(id)))
                }
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>
          <button className="return-menu" onClick={() => act(onMenu)}>
            <LogOut size={18} />
            Zurück zum Hauptmenü
          </button>
        </nav>
      )}
    </div>
  );
}
