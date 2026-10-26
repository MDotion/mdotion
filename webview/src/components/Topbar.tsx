import { useEffect, useRef, useState } from 'react';
import type { PageSettings, Theme } from '../../../src/shared/messages';
import { isMac } from '../lib/env';
import { useIdeDark } from '../lib/theme';

/** Must match the keybindings contributed in package.json. */
export const SWITCH_SHORTCUT = isMac ? '⌘⌥M' : 'Ctrl+Alt+M';
export const COPY_ALL_SHORTCUT = isMac ? '⌘⇧⌥C' : 'Ctrl+Shift+Alt+C';

interface TopbarProps {
  fileName: string;
  settings: PageSettings;
  onSettingsChange: (settings: PageSettings) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onSwitchToSource: () => void;
  onCopyAll: () => void;
}

const THEMES: { id: Theme; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

const SUN = (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
    <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const MOON = (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
    <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

const FONTS: { id: PageSettings['font']; label: string; sample: string }[] = [
  { id: 'default', label: 'Default', sample: 'Ag' },
  { id: 'serif', label: 'Serif', sample: 'Ag' },
  { id: 'mono', label: 'Mono', sample: 'Ag' },
];

export function Topbar({
  fileName,
  settings,
  onSettingsChange,
  theme,
  onThemeChange,
  onSwitchToSource,
  onCopyAll,
}: TopbarProps): React.ReactElement {
  const ideDark = useIdeDark();
  const dark = theme === 'auto' ? ideDark : theme === 'dark';
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <header className="mdotion-topbar">
      <div className="mdotion-breadcrumb" title={fileName}>
        <span aria-hidden>📄</span>
        <span className="mdotion-breadcrumb-name">{fileName.replace(/\.(md|markdown)$/i, '') || 'Untitled'}</span>
      </div>
      <div className="mdotion-topbar-actions" ref={menuRef}>
        <div className="mdotion-view-switch" role="tablist" aria-label="Editor view">
          <button type="button" role="tab" aria-selected className="is-active" title="Notion-style editor">
            Visual
          </button>
          <button type="button" role="tab" aria-selected={false} onClick={onSwitchToSource} title={`Switch to the Markdown source (${SWITCH_SHORTCUT})`}>
            Markdown
          </button>
        </div>
        <button
          type="button"
          className="mdotion-topbar-button mdotion-copy-all"
          title={`Copy all Markdown (${COPY_ALL_SHORTCUT})`}
          onClick={() => {
            onCopyAll();
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            {copied ? (
              <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <>
                <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
              </>
            )}
          </svg>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          className="mdotion-topbar-button mdotion-theme-toggle"
          title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() => onThemeChange(dark ? 'light' : 'dark')}
        >
          {dark ? SUN : MOON}
        </button>
        <button
          type="button"
          className="mdotion-topbar-button mdotion-topbar-more"
          aria-label="Page settings"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          •••
        </button>
        {open ? (
          <div className="mdotion-popover mdotion-menu mdotion-settings" role="menu">
            <div className="mdotion-font-picker">
              {FONTS.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  className={`mdotion-font-option mdotion-font-${font.id}${settings.font === font.id ? ' is-active' : ''}`}
                  onClick={() => onSettingsChange({ ...settings, font: font.id })}
                >
                  <span className="mdotion-font-sample">{font.sample}</span>
                  <span>{font.label}</span>
                </button>
              ))}
            </div>
            <div className="mdotion-menu-divider" />
            <div className="mdotion-menu-section">Theme</div>
            <div className="mdotion-theme-picker" role="radiogroup" aria-label="Theme">
              {THEMES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={theme === option.id}
                  className={theme === option.id ? 'is-active' : ''}
                  title={option.id === 'auto' ? 'Follow the editor theme' : undefined}
                  onClick={() => onThemeChange(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="mdotion-menu-divider" />
            <Toggle label="Small text" value={settings.smallText} onChange={(smallText) => onSettingsChange({ ...settings, smallText })} />
            <Toggle label="Full width" value={settings.fullWidth} onChange={(fullWidth) => onSettingsChange({ ...settings, fullWidth })} />
          </div>
        ) : null}
      </div>
    </header>
  );
}

function Toggle(props: { label: string; value: boolean; onChange: (value: boolean) => void }): React.ReactElement {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={props.value} className="mdotion-menu-item" onClick={() => props.onChange(!props.value)}>
      {props.label}
      <span className={`mdotion-switch${props.value ? ' is-on' : ''}`} aria-hidden />
    </button>
  );
}
