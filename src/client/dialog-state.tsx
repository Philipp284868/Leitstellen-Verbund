import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

type DirtyEntry = { dirty: boolean; discard?: () => void; blocked?: boolean };
type Guard = (transition: () => void) => void;
const guards: Guard[] = [];
const DirtyContext = createContext<Map<symbol, DirtyEntry> | null>(null);
/** All navigation within a dialog passes its current draft guard. */
export function requestDialogTransition(transition: () => void) {
  const guard = guards.at(-1);
  if (guard) guard(transition);
  else transition();
}
export function registerDialogGuard(guard: Guard) {
  guards.push(guard);
  return () => {
    const i = guards.indexOf(guard);
    if (i >= 0) guards.splice(i, 1);
  };
}
export function DialogDrafts({
  entries,
  children,
}: {
  entries: Map<symbol, DirtyEntry>;
  children: ReactNode;
}) {
  return (
    <DirtyContext.Provider value={entries}>{children}</DirtyContext.Provider>
  );
}
export function useDialogDirty(
  dirty: boolean,
  discard?: () => void,
  blocked = false,
) {
  const entries = useContext(DirtyContext),
    token = useRef(Symbol());
  useEffect(() => {
    const key = token.current;
    entries?.set(key, { dirty, discard, blocked });
    return () => {
      entries?.delete(key);
    };
  }, [entries, dirty, discard, blocked]);
}
