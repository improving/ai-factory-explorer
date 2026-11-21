import type { ThemeChoice } from '../state/ui'

// The theme of the page: data-theme on <html> (the CSS and the canvas read it); Auto follows the system.
export function applyTheme(t: ThemeChoice) {
  const el = document.documentElement
  if (t === 'auto') delete el.dataset.theme
  else el.dataset.theme = t
}
