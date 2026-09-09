/** Create once per store, so a render does not unsubscribe and subscribe again. */
export const subscription =
  (listeners: Set<() => void>) => (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
