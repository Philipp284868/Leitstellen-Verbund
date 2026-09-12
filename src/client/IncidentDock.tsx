import { X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { DialogDrafts, registerDialogGuard } from "./dialog-state";
import { IncidentIcon } from "./HudIcons";
import { missionPresentation } from "./mission-presentation";
import type { Mission } from "../shared/model";
export function IncidentDock({
  mission,
  dockRef,
  tab,
  onSection,
  onClose,
  readonly,
  children,
}: {
  mission?: Mission;
  dockRef: RefObject<HTMLElement | null>;
  tab: string;
  onSection: (id: string) => void;
  onClose: () => void;
  readonly: boolean;
  children: ReactNode;
}) {
  const entries = useRef(
    new Map<
      symbol,
      {
        dirty: boolean;
        discard?: () => void;
        blocked?: boolean;
      }
    >(),
  );
  const [pending, setPending] = useState<(() => void) | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  const guard = useRef((transition: () => void) => {
    if ([...entries.current.values()].some((e) => e.blocked)) return;
    if ([...entries.current.values()].some((e) => e.dirty)) {
      if (!pendingRef.current) {
        pendingRef.current = transition;
        setPending(() => transition);
      }
    } else transition();
  });
  useEffect(() => registerDialogGuard(guard.current), []);
  const close = () => guard.current(onClose);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dockRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [dockRef]);
  const presentation = mission && missionPresentation(mission);
  const title = presentation?.name ?? "Einsatzdisposition";
  const org = presentation?.org ?? "Unbekannt";
  const location =
    mission && (!mission.control || mission.control.locationKnown)
      ? mission.control?.facts.find((f) => f.key === "address")?.text ||
        "Einsatzort auf der Deutschlandkarte"
      : "Ort und Meldebild aufnehmen";
  return (
    <aside
      className="incident-dock"
      ref={dockRef}
      tabIndex={-1}
      aria-label="Einsatzdisposition"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (pending) {
            pendingRef.current = null;
            setPending(null);
          } else close();
        }
      }}
    >
      <header className="dock-heading">
        <span
          className="dock-symbol"
          data-org={org}
          style={{ background: presentation?.color }}
        >
          <IncidentIcon org={org} category={presentation?.category} />
        </span>
        <div>
          <strong>{title}</strong>
          <small>{location}</small>
        </div>
        <button aria-label="Schließen" disabled={!!pending} onClick={close}>
          <X size={18} />
        </button>
      </header>
      <nav className="dock-tabs" aria-label="Einsatzabschnitte">
        {[
          ["details", "Details"],
          ["vehicles", "Fahrzeuge"],
          ["radio", "Funk"],
          ["arrival", "Anfahrt"],
          ["history", "Protokoll"],
        ].map(([id, label]) => (
          <button
            key={id}
            disabled={
              id !== "details" &&
              id !== "history" &&
              (!mission || mission.phase === "done")
            }
            aria-pressed={tab === id}
            onClick={() => onSection(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {pending && (
        <div
          className="draft-confirm"
          role="alertdialog"
          aria-label="Ungespeicherte Disposition"
        >
          <strong>Auswahl noch nicht übernommen</strong>
          <p>
            Die Fahrzeugauswahl und nicht gesendete Eingaben werden beim
            Verwerfen zurückgesetzt.
          </p>
          <div className="inline">
            <button
              onClick={() => {
                pendingRef.current = null;
                setPending(null);
              }}
            >
              Weiter bearbeiten
            </button>
            <button
              className="danger"
              onClick={() => {
                const next = pendingRef.current;
                for (const entry of entries.current.values()) entry.discard?.();
                entries.current.clear();
                pendingRef.current = null;
                setPending(null);
                next?.();
              }}
            >
              Änderungen verwerfen
            </button>
          </div>
        </div>
      )}
      <div className="dock-content">
        <fieldset disabled={readonly} inert={!!pending}>
          <DialogDrafts entries={entries.current}>{children}</DialogDrafts>
        </fieldset>
      </div>
    </aside>
  );
}
