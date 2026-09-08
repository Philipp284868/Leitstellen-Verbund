import type { ReactNode, RefObject } from "react";
import { X } from "lucide-react";
import type { Mission } from "./model";
import { mt } from "./catalog";
import { districtAt } from "./world";
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
  const known =
    mission && (!mission.control || mission.control.reportedTemplate);
  const title = known ? mt(mission.template).name : "Einsatzdisposition";
  const org = known ? mt(mission.template).org : "Unbekannt";
  const location =
    mission && (!mission.control || mission.control.locationKnown)
      ? districtAt(mission.pos)
      : "Ort und Meldebild aufnehmen";
  return (
    <aside
      className="incident-dock"
      ref={dockRef}
      aria-label="Einsatzdisposition"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
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
          ["radio", "FMS"],
          ["arrival", "Anfahrt"],
        ].map(([id, label]) => (
          <button
            key={id}
            disabled={
              id !== "details" && (!mission || mission.phase === "done")
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
