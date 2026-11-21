import type { ReactNode } from 'react'
import { useUi, type ThemeChoice } from '../state/ui'
import { applyTheme } from './theme'
import { MonitorIcon, MoonIcon, SunIcon } from './icons'

// Auto follows the system; light and dark do not. One icon for each choice, so the header keeps its room.
const THEMES: { id: ThemeChoice; label: string; hint: string; icon: ReactNode }[] = [
  { id: 'auto', label: 'System theme', hint: 'Theme: follow the system', icon: <MonitorIcon /> },
  { id: 'light', label: 'Light theme', hint: 'Theme: light', icon: <SunIcon /> },
  { id: 'dark', label: 'Dark theme', hint: 'Theme: dark', icon: <MoonIcon /> },
]

// The theme of the page: a radio group, like the mode switch. The arrow keys move to the next or the previous choice;
// only the current one is in the tab order.
export function ThemeSwitch() {
  const theme = useUi((u) => u.theme)
  const pick = (t: ThemeChoice, focus = false) => {
    applyTheme(t) // first: the canvas reads the attribute when the store changes
    useUi.setState({ theme: t })
    if (focus) document.querySelector<HTMLButtonElement>(`[data-testid="theme-${t}"]`)?.focus()
  }
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    e.stopPropagation() // the window handler steps the trace hop with the same keys
    pick(THEMES[(THEMES.findIndex((t) => t.id === theme) + step + THEMES.length) % THEMES.length]!.id, true)
  }
  return (
    <div className="modes theme-switch" role="radiogroup" aria-label="Theme" onKeyDown={onKey}>
      {THEMES.map((t) => (
        <button key={t.id} type="button" role="radio" className="icon" data-testid={`theme-${t.id}`} aria-label={t.label} aria-checked={theme === t.id} tabIndex={theme === t.id ? 0 : -1} title={t.hint} onClick={() => pick(t.id)}>
          {t.icon}
        </button>
      ))}
    </div>
  )
}
