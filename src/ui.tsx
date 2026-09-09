import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
export const credits = (value: number) =>
  new Intl.NumberFormat("de-DE").format(value) + " Cr";
export const playerColor = (id: string) =>
  `hsl(${150 + ([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 160)} 55% 68%)`;
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
          if (e.key === "Tab") {
            const controls = [
              ...ref.current!.querySelectorAll<HTMLElement>(
                "button, input, select, textarea, [href], summary, [tabindex], [contenteditable=true]",
              ),
            ]
              .filter(
                (element) =>
                  !element.matches(":disabled") &&
                  !element.closest("[hidden], [inert]") &&
                  (!element.hasAttribute("tabindex") ||
                    element.tabIndex >= 0) &&
                  (element.tabIndex >= 0 || element.isContentEditable) &&
                  element.getClientRects().length > 0 &&
                  getComputedStyle(element).visibility !== "hidden",
              )
              .sort(
                (a, b) =>
                  (a.tabIndex > 0 ? a.tabIndex : Number.MAX_SAFE_INTEGER) -
                  (b.tabIndex > 0 ? b.tabIndex : Number.MAX_SAFE_INTEGER),
              );
            const first = controls[0],
              last = controls.at(-1);
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="Schließen" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export const statuses: Record<string, string> = {
  ready: "An Wache",
  alarmed: "Alarmiert",
  travel: "Auf Anfahrt",
  scene: "Am Einsatzort",
  transport: "Patiententransport",
  return: "Rückfahrt",
};

/** Closed details do not build expensive rosters and forms on every snapshot. */
export function Disclosure({
  title,
  children,
  className = "resource-section",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={className}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>{title}</summary>
      {open && children}
    </details>
  );
}

export function ConfirmAction({
  children,
  message,
  onConfirm,
}: {
  children: ReactNode;
  message: string;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useActionFocus(confirming, trigger, cancel);
  return confirming ? (
    <span
      className="inline-confirm"
      role="alert"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setConfirming(false);
        }
      }}
    >
      <span>{message}</span>
      <button
        className="danger"
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        Bestätigen
      </button>
      <button ref={cancel} onClick={() => setConfirming(false)}>
        Abbrechen
      </button>
    </span>
  ) : (
    <button
      ref={trigger}
      className="danger"
      onClick={() => setConfirming(true)}
    >
      {children}
    </button>
  );
}

/** Focus follows only an explicit action; mounting a closed action never steals it. */
function useActionFocus(
  open: boolean,
  trigger: RefObject<HTMLElement | null>,
  target: RefObject<HTMLElement | null>,
) {
  const restore = useRef(false);
  useLayoutEffect(() => {
    if (open) {
      restore.current = true;
      target.current?.focus({ preventScroll: true });
    } else if (restore.current) {
      restore.current = false;
      trigger.current?.focus({ preventScroll: true });
    }
  }, [open, trigger, target]);
}

export function RenameAction({
  name,
  onSave,
}: {
  name: string;
  onSave: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useActionFocus(editing, trigger, input);
  return editing ? (
    <form
      className="inline-rename"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) {
          onSave(value.trim());
          setEditing(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setEditing(false);
        }
      }}
    >
      <input
        ref={input}
        aria-label="Neuer Fahrzeugname"
        value={value}
        maxLength={48}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" disabled={!value.trim()}>
        Speichern
      </button>
      <button type="button" onClick={() => setEditing(false)}>
        Abbrechen
      </button>
    </form>
  ) : (
    <button
      ref={trigger}
      onClick={() => {
        setValue(name);
        setEditing(true);
      }}
    >
      Name
    </button>
  );
}
