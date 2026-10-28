import type { ViewState } from '../../../src/shared/messages';
import { postToHost } from './env';

const SAVE_DELAY_MS = 500;

type Section = keyof ViewState;

/**
 * Per-file view state (folded sections, column widths) received with `init` and
 * saved back to the host, debounced. It never reaches the Markdown (ADR-009).
 */
class ViewStateStore {
  private state: ViewState = { folded: [], tableWidths: {} };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();

  /** Replaces the state with the one stored by the host (on `init`). */
  load(state: ViewState): void {
    this.state = { folded: [...state.folded], tableWidths: { ...state.tableWidths } };
    this.listeners.forEach((listener) => listener());
  }

  get<K extends Section>(section: K): ViewState[K] {
    return this.state[section];
  }

  set<K extends Section>(section: K, value: ViewState[K]): void {
    this.state = { ...this.state, [section]: value };
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      postToHost({ type: 'saveViewState', viewState: this.state });
    }, SAVE_DELAY_MS);
  }

  /** Called after `load`, so plugins can apply the stored state to the document. */
  onLoad(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const viewState = new ViewStateStore();
