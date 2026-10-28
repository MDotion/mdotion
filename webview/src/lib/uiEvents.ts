type Events = {
  /** Open the link editor for the current selection (Cmd+K, toolbar button). */
  editLink: void;
  /** Open the heading search (Cmd+Shift+O). */
  jumpToHeading: void;
};

type Listener<T> = (payload: T) => void;

const listeners: { [K in keyof Events]?: Set<Listener<Events[K]>> } = {};

export function onUiEvent<K extends keyof Events>(name: K, listener: Listener<Events[K]>): () => void {
  const set = (listeners[name] ??= new Set()) as Set<Listener<Events[K]>>;
  set.add(listener);
  return () => set.delete(listener);
}

export function emitUiEvent<K extends keyof Events>(name: K, payload: Events[K]): void {
  (listeners[name] as Set<Listener<Events[K]>> | undefined)?.forEach((listener) => listener(payload));
}
