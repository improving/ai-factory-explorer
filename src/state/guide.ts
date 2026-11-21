import { GUIDES, type Guide, type GuideStep } from '../guides/guides'
import type { AppState } from './transitions'
import { decodeState, encodeState } from './url'

export const guideById = (id: string): Guide | undefined => GUIDES.find((g) => g.id === id)

// The number of a step of a guide, by the title of the step: a panel opens the guide at the step that shows it.
export function stepNumber(id: string, title: string): number | null {
  const i = guideById(id)?.steps.findIndex((st) => st.title === title) ?? -1
  return i >= 0 ? i + 1 : null
}

// The open guide, its step, and the number of the step (from 1); null with no guide.
export function currentStep(s: AppState): { guide: Guide; step: GuideStep; index: number } | null {
  if (!s.guide) return null
  const guide = guideById(s.guide.id)
  const step = guide?.steps[s.guide.step - 1]
  return guide && step ? { guide, step, index: s.guide.step } : null
}

// Two links give the same view when they have the same parameters.
// The order, the percent-encoding, and the guide do not count.
const norm = (h: string): string =>
  [...new URLSearchParams(h.replace(/^#/, ''))]
    .filter(([k]) => k !== 'guide')
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('&')
export const sameParams = (a: string, b: string): boolean => norm(a) === norm(b)

// The view of a step, with the guide. A guide or a step that does not exist changes nothing.
export function openGuide(s: AppState, id: string, step = 1): AppState {
  const st = guideById(id)?.steps[step - 1]
  if (!st || step < 1) return s
  return { ...decodeState(`#${st.hash}`), guide: { id, step } }
}

// Close keeps the view.
export const closeGuide = (s: AppState): AppState => (s.guide ? { ...s, guide: null } : s)

// True while the view is the view of the step.
export function stepShown(s: AppState): boolean {
  const c = currentStep(s)
  return c !== null && sameParams(encodeState(s), c.step.hash)
}
