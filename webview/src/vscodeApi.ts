declare function acquireVsCodeApi(): {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

let api: ReturnType<typeof acquireVsCodeApi> | null | undefined;

/** VS Code allows acquireVsCodeApi() only once per webview lifetime. */
export function getVsCodeApi(): ReturnType<typeof acquireVsCodeApi> | null {
  if (api !== undefined) {
    return api;
  }
  if (typeof acquireVsCodeApi === 'undefined') {
    api = null;
    return null;
  }
  api = acquireVsCodeApi();
  return api;
}
