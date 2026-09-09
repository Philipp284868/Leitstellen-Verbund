import { useEffect, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import type { Mission } from "./model";
import { mt } from "./catalog";
import { districtAt } from "./world";
import { IS_GERMANY } from "./world-choice";
import { IncidentIcon } from "./HudIcons";

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
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dockRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [dockRef]);
  const known =
    mission && (!mission.control || mission.control.reportedTemplate);
  const title = known ? mt(mission.template).name : "Einsatzdisposition";
  const org = known ? mt(mission.template).org : "Unbekannt";
  const location =
    mission && (!mission.control || mission.control.locationKnown)
      ? IS_GERMANY
        ? mission.control?.facts.find((f) => f.key === "address")?.text ||
          "Einsatzort auf der Deutschlandkarte"
        : districtAt(mission.pos)
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
          onClose();
        }
      }}
    >
      <header className="dock-heading">
        <span className="dock-symbol" data-org={org}>
          <IncidentIcon org={org} />
        </span>
        <div>
          <strong>{title}</strong>
          <small>{location}</small>
        </div>
        <button aria-label="Schließen" onClick={onClose}>
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
      <div className="dock-content">
        <fieldset disabled={readonly}>{children}</fieldset>
      </div>
    </aside>
  );
}
