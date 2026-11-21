import { create } from 'zustand'
import type { Config } from '../config/config'

export type ThemeChoice = 'auto' | 'light' | 'dark'
// Page-only state: not in the URL. The folds, the panel height, the legend, and the theme are kept in the browser
// when it can (a per-viewer convenience); the page works with no storage.
// forced: the switches that the last configuration change also changed, for the note of the configuration panel
// (it shows only while the configuration is that one; it is not kept).
export type Ui = { map: boolean; panel: number | null; config: boolean; inspector: boolean; legend: boolean; theme: ThemeChoice; forced: { config: Config; keys: (keyof Config)[] } | null }

const KEY = 'afp.ui'
const DEFAULTS: Ui = { map: false, panel: null, config: true, inspector: false, legend: true, theme: 'auto', forced: null }
const KEPT = ['panel', 'config', 'inspector', 'legend', 'theme'] as const

function load(): Ui {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
    const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
    // Check each stored value: a wrong one (an old version, an edit by hand) gives the default.
    return {
      ...DEFAULTS,
      panel: typeof raw.panel === 'number' && Number.isFinite(raw.panel) && raw.panel >= 120 ? raw.panel : null,
      config: bool(raw.config, DEFAULTS.config),
      inspector: bool(raw.inspector, DEFAULTS.inspector),
      legend: bool(raw.legend, DEFAULTS.legend),
      theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'auto',
    }
  } catch {
    return DEFAULTS
  }
}

export const useUi = create<Ui>()(() => load())

useUi.subscribe((u) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(KEPT.map((k) => [k, u[k]]))))
  } catch {
    // no storage: the state lives for this page only
  }
})
