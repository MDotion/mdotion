import { useEffect, useState } from 'react';
import type { Theme } from '../../../src/shared/messages';

/** VS Code marks the webview body with `vscode-light` / `vscode-dark` / `vscode-high-contrast[-light]`. */
function ideIsDark(): boolean {
  const classes = document.body.classList;
  return classes.contains('vscode-dark') || classes.contains('vscode-high-contrast');
}

/** Whether the IDE theme is dark, updated live when the user changes the IDE theme. */
export function useIdeDark(): boolean {
  const [dark, setDark] = useState(ideIsDark);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(ideIsDark()));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/** Applies the theme setting: a forced theme overrides the IDE classes (see notion.css). */
export function applyTheme(theme: Theme): void {
  if (theme === 'auto') {
    delete document.body.dataset.mdotionTheme;
  } else {
    document.body.dataset.mdotionTheme = theme;
  }
}
