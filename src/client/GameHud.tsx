import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { requestDialogTransition } from "./dialog-state";
import { MapView } from "./germany/GermanyMap";
import { IncidentDock } from "./IncidentDock";
import { useNetwork, usePresence } from "./network";
import { Topbar } from "./Topbar";
import { CompactDesk, type CompactDeskProps } from "./CompactDesk";
import { GameToast } from "./GameToast";
type Props = Omit<CompactDeskProps, "panel"> & {
  setModal: (id: string) => void;
  notice: string;
  onMenu: () => void;
  detail: ReactNode;
  showDetail: boolean;
  onCloseDetail: () => void;
  onCloseDetailKeepSelection: () => void;
  activePanel: string;
};
export function GameHud({
  setModal,
  onMenu,
  detail,
  showDetail,
  onCloseDetail,
  onCloseDetailKeepSelection,
  activePanel,
  ...props
}: Props) {
  const { s, selected, open, readonly } = props;
  const net = useNetwork(),
    presence = usePresence();
  const [layers, setLayers] = useState(false),
    [tab, setTab] = useState("details");
  const dock = useRef<HTMLElement>(null);
  const [inspectionContainer, setInspectionContainer] =
    useState<HTMLDivElement | null>(null);
  const working = !!activePanel && activePanel !== "mission";
  useEffect(() => {
    if (working || showDetail) setLayers(false);
  }, [working, showDetail]);
  useEffect(() => setTab("details"), [selected]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && layers) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setLayers(false);
        document
          .querySelector<HTMLButtonElement>('[aria-label="Leitstellenmenü"]')
          ?.focus();
      }
    };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [layers]);
  const focusSection = (section: string) => {
    setTab(section);
    if (section === "history") {
      const history =
        dock.current?.querySelector<HTMLDetailsElement>(".incident-history");
      if (history) history.open = true;
    }
    (
      dock.current?.querySelector<HTMLElement>(
        `[data-hud-section="${section}"]`,
      ) ?? dock.current?.querySelector<HTMLElement>(".incident-desk")
    )?.scrollIntoView({ block: "start", behavior: "instant" });
  };
  const choose = useCallback(
    (id: string) =>
      requestDialogTransition(() => {
        setLayers(false);
        open(id);
        setTab("details");
      }),
    [open],
  );
  const inspect = useCallback(() => {
    setLayers(false);
    onCloseDetail();
  }, [onCloseDetail]);
  const toggleTools = useCallback(() => setLayers((v) => !v), []);
  return (
    <div
      className="hud-shell"
      data-detail-open={showDetail}
      data-map-tools={layers && !working}
    >
      <div className="hud-overlays">
        <Topbar
          s={s}
          onNavigationOpen={() => setLayers(false)}
          panel={setModal}
          onMenu={onMenu}
          onSearch={() => {
            setLayers(true);
            onCloseDetailKeepSelection();
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLInputElement>(
                  '[aria-label="Karte durchsuchen"]',
                )
                ?.focus(),
            );
          }}
        />
        <GameToast />
        <div className="hud-workspace">
          <div className="hud-inspection-slot" ref={setInspectionContainer} />
          <CompactDesk {...props} panel={setModal} />
          {showDetail && (
            <IncidentDock
              mission={
                s.missions.find((m) => m.id === selected) ??
                s.archive.find((m) => m.id === selected)
              }
              dockRef={dock}
              tab={tab}
              onSection={focusSection}
              onClose={onCloseDetail}
              readonly={readonly}
            >
              {detail}
            </IncidentDock>
          )}
        </div>
      </div>
      <main className="map-column">
        <MapView
          s={s}
          detailContainer={inspectionContainer}
          selected={selected}
          onSelect={choose}
          inspectionsHidden={working || showDetail || layers}
          onInspect={inspect}
          readonly={readonly}
          friends={net.friends}
          presence={presence.ready ? presence.players : []}
          ownDeskId={s.player.id}
          toolsOpen={layers}
          onToggleTools={toggleTools}
        />
      </main>
    </div>
  );
}
