import React, { useEffect, useState } from 'react';
import { readTheme, writeTheme, type ThemeChoice } from '../lib/preferences';

// Light, dark, or follow the device. The choice is kept in this browser
// (src/lib/preferences.ts); the script in index.html applies it before the
// page draws, so there is no flash.
// The browser bar colour (theme-color) is the header band's in both themes.
const NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<ThemeChoice, string> = { system: 'Theme: follows device', light: 'Theme: light', dark: 'Theme: dark' };
const ICON: Record<ThemeChoice, string> = { system: 'contrast', light: 'light_mode', dark: 'dark_mode' };

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && darkQuery().matches);
  const root = document.documentElement;
  if (root.dataset.theme === (dark ? 'dark' : 'light')) return;
  // Switch every colour at once rather than letting each one fade across
  root.classList.add('theme-switching');
  root.dataset.theme = dark ? 'dark' : 'light';
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
}

export const ThemeToggle: React.FC = () => {
  const [choice, setChoice] = useState<ThemeChoice>(() => readTheme());

  useEffect(() => {
    apply(choice);
    writeTheme(choice);
    if (choice !== 'system') return;
    const query = darkQuery();
    const onChange = () => apply('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [choice]);

  return (
    <button
      type="button"
      onClick={() => setChoice(NEXT[choice])}
      aria-label={`${LABEL[choice]}. Change theme`}
      title={LABEL[choice]}
      className="w-9 h-9 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center text-on-band hover:bg-band-field rounded-lg border border-band-line transition-colors"
    >
      <span className="material-symbols-outlined text-xl" aria-hidden="true">{ICON[choice]}</span>
    </button>
  );
};
