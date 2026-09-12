import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { formatMoney } from "./money";
import {
  DialogDrafts,
  registerDialogGuard,
  useDialogDirty,
} from "./dialog-state";
export const credits = formatMoney;
function exposedByDetails(element: HTMLElement) {
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    if (parent.tagName !== "DETAILS" || parent.hasAttribute("open")) continue;
    const summary = Array.from(parent.children).find(
      (child) => child.tagName === "SUMMARY",
    );
    if (!summary?.contains(element)) return false;
  }
  return true;
}
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
  const ref = useRef<HTMLElement>(null),
    scrim = useRef<HTMLDivElement>(null);
  const entries = useRef(
    new Map<
      symbol,
      { dirty: boolean; discard?: () => void; blocked?: boolean }
    >(),
  );
  const [pending, setPending] = useState<(() => void) | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  const guard = useRef((transition: () => void) => {
    if ([...entries.current.values()].some((entry) => entry.blocked)) return;
    if ([...entries.current.values()].some((entry) => entry.dirty)) {
      if (!pendingRef.current) {
        pendingRef.current = transition;
        setPending(() => transition);
      }
    } else transition();
  });
  useEffect(() => registerDialogGuard(guard.current), []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const inert: [HTMLElement, boolean][] = [];
    let node: HTMLElement | null = scrim.current;
    while (node && node !== document.body) {
      for (const sibling of node.parentElement?.children ?? [])
        if (sibling !== node && sibling instanceof HTMLElement) {
          inert.push([sibling, sibling.inert]);
          sibling.inert = true;
        }
      node = node.parentElement;
    }
    ref.current?.focus({ preventScroll: true });
    return () => {
      for (const [element, wasInert] of inert) element.inert = wasInert;
      queueMicrotask(() => {
        if (document.querySelector('[role="dialog"][aria-modal="true"]'))
          return;
        if (
          previous?.isConnected &&
          previous !== document.body &&
          previous.getClientRects().length &&
          !previous.closest("[inert]")
        )
          previous.focus({ preventScroll: true });
        else
          document
            .querySelector<HTMLButtonElement>(
              'button[aria-label="Leitstellenmenü"]',
            )
            ?.focus({ preventScroll: true });
      });
    };
  }, []);
  useEffect(() => {
    if (pending)
      ref.current
        ?.querySelector<HTMLButtonElement>("[data-keep-draft]")
        ?.focus({ preventScroll: true });
  }, [pending]);
  const close = () => guard.current(onClose);
  const keep = () => {
    pendingRef.current = null;
    setPending(null);
    ref.current?.focus({ preventScroll: true });
  };
  return (
    <div
      ref={scrim}
      className="scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
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
            if (pending) keep();
            else close();
          }
          if (e.key === "Tab") {
            const controls = [
              ...ref.current!.querySelectorAll<HTMLElement>(
                "button, input, select, textarea, [href], summary, [tabindex], [contenteditable=true]",
              ),
            ]
              .filter(
                (el) =>
                  !el.matches(":disabled") &&
                  !el.closest("[hidden], [inert]") &&
                  exposedByDetails(el) &&
                  (el.tabIndex >= 0 || el.isContentEditable) &&
                  el.getClientRects().length > 0 &&
                  getComputedStyle(el).visibility !== "hidden",
              )
              .sort(
                (a, b) =>
                  (a.tabIndex > 0 ? a.tabIndex : Number.MAX_SAFE_INTEGER) -
                  (b.tabIndex > 0 ? b.tabIndex : Number.MAX_SAFE_INTEGER),
              );
            const first = controls[0],
              last = controls.at(-1),
              active = document.activeElement;
            if (!first) {
              e.preventDefault();
              ref.current?.focus();
            } else if (
              e.shiftKey &&
              (active === first || active === ref.current)
            ) {
              e.preventDefault();
              last?.focus();
            } else if (
              !e.shiftKey &&
              (active === last || active === ref.current)
            ) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <span className="eyebrow">Leitstellen-Verbund</span>
            <h2>{title}</h2>
          </div>
          <button aria-label="Schließen" disabled={!!pending} onClick={close}>
            ×
          </button>
        </header>
        {pending && (
          <div
            className="draft-confirm"
            role="alertdialog"
            aria-label="Ungespeicherte Änderungen"
          >
            <h3>Änderungen noch nicht übernommen</h3>
            <p>Die Vorschau wird beim Verwerfen zurückgesetzt.</p>
            <div className="inline">
              <button data-keep-draft onClick={keep}>
                Weiter bearbeiten
              </button>
              <button
                className="danger"
                onClick={() => {
                  const transition = pendingRef.current;
                  for (const entry of entries.current.values())
                    entry.discard?.();
                  entries.current.clear();
                  pendingRef.current = null;
                  setPending(null);
                  transition?.();
                }}
              >
                Änderungen verwerfen
              </button>
            </div>
          </div>
        )}
        <div className="modal-body" inert={!!pending}>
          <DialogDrafts entries={entries.current}>{children}</DialogDrafts>
        </div>
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

export function ActionButton({
  children,
  action,
  disabled = false,
  className = "",
  label,
}: {
  children: ReactNode;
  action: () => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false),
    lock = useRef(false),
    [error, setError] = useState("");
  useDialogDirty(false, undefined, busy);
  return (
    <span className="async-action">
      <button
        className={className}
        aria-label={label}
        disabled={disabled || busy}
        onClick={() => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          Promise.resolve()
            .then(action)
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => {
              lock.current = false;
              setBusy(false);
            });
        }}
      >
        {busy ? "Wird ausgeführt …" : children}
      </button>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
export function ConfirmAction({
  children,
  message,
  onConfirm,
  disabled = false,
}: {
  children: ReactNode;
  message: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false),
    [busy, setBusy] = useState(false),
    lock = useRef(false),
    [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null),
    cancel = useRef<HTMLButtonElement>(null);
  useActionFocus(confirming, trigger, cancel);
  useDialogDirty(false, undefined, busy);
  return confirming ? (
    <span
      className="inline-confirm"
      role="alert"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (!busy) setConfirming(false);
        }
      }}
    >
      <span>{message}</span>
      <button
        className="danger"
        disabled={busy || disabled}
        onClick={() => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          Promise.resolve()
            .then(onConfirm)
            .then(() => setConfirming(false))
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => {
              lock.current = false;
              setBusy(false);
            });
        }}
      >
        {busy ? "Wird ausgeführt …" : "Bestätigen"}
      </button>
      <button ref={cancel} disabled={busy} onClick={() => setConfirming(false)}>
        Abbrechen
      </button>
      {error && (
        <span role="alert" className="error">
          {error}
        </span>
      )}
    </span>
  ) : (
    <button
      ref={trigger}
      className="danger"
      disabled={disabled}
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
  label = "Fahrzeug",
}: {
  name: string;
  onSave: (name: string) => void | Promise<void>;
  label?: string;
}) {
  const [editing, setEditing] = useState(false),
    [value, setValue] = useState(name),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null),
    input = useRef<HTMLInputElement>(null),
    lock = useRef(false);
  useActionFocus(editing, trigger, input);
  useDialogDirty(
    editing && value !== name,
    () => {
      setEditing(false);
      setValue(name);
      setError("");
    },
    busy,
  );
  return editing ? (
    <form
      className="inline-rename"
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.trim() || lock.current) return;
        lock.current = true;
        setBusy(true);
        setError("");
        Promise.resolve()
          .then(() => onSave(value.trim()))
          .then(() => setEditing(false))
          .catch((e) => setError(e instanceof Error ? e.message : String(e)))
          .finally(() => {
            lock.current = false;
            setBusy(false);
          });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!busy && value === name) setEditing(false);
        }
      }}
    >
      <input
        ref={input}
        aria-label={`Neuer ${label === "Fahrzeug" ? "Fahrzeugname" : "Wachenname"}`}
        value={value}
        maxLength={48}
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" disabled={busy || !value.trim()}>
        {busy ? "Speichern …" : "Speichern"}
      </button>
      <button type="button" disabled={busy} onClick={() => setEditing(false)}>
        Abbrechen
      </button>
      {error && (
        <span role="alert" className="error">
          {error}
        </span>
      )}
    </form>
  ) : (
    <button
      ref={trigger}
      onClick={() => {
        setValue(name);
        setError("");
        setEditing(true);
      }}
    >
      Name
    </button>
  );
}
