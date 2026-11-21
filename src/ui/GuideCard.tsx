import { useEffect } from 'react'
import { ncclSample } from '../collectives/ncclSample'
import { GUIDES, type GuideAction } from '../guides/guides'
import { closeGuide, currentStep, guideById, openGuide, stepShown } from '../state/guide'
import { stopPlay } from '../state/play'
import { useReader } from '../state/reader'
import { useApp } from '../state/store'

// The text that each reader action pastes.
const SAMPLE: Record<GuideAction, string> = {
  'reader-good': ncclSample(),
  'reader-slow': ncclSample({ busbwPeak: 400 }),
  'reader-errors': ncclSample({ wrongAt: 16777216, failed: true }),
  'reader-clear': '',
}
// The own text of the user: a text that no action pastes. A guide does not paste over it unless the user asks.
const ownText = (t: string): boolean => t.trim() !== '' && !Object.values(SAMPLE).includes(t)

// The page action of a step: a reader action opens the reader with its text; a step with no action closes it.
// force: the user asked to paste the sample over the own text.
export function runAction(a: GuideAction | undefined, force = false): void {
  if (!a) return useReader.setState({ open: false })
  if (!force && ownText(useReader.getState().text)) return useReader.setState({ open: true })
  useReader.setState({ open: true, text: SAMPLE[a], threshold: '80', collective: null, limit: '' })
}

// The outline of the target of a step. With reduced motion, it does not pulse.
const highlight = (t: string): string =>
  `[data-testid="${t}"]{outline:3px solid var(--accent);outline-offset:2px;animation:guide-pulse 1.2s ease-in-out 3}` +
  `@media (prefers-reduced-motion: reduce){[data-testid="${t}"]{animation:none}}`

// The card of the open guide: the step, what to look at, the lesson, and Back, Next, and Close.
export function GuideCard() {
  const state = useApp()
  const reader = useReader()
  const cur = currentStep(state)
  const target = cur?.step.target
  const key = cur ? `${cur.guide.id}.${cur.index}` : ''
  // A target can be below the fold of a panel (the bottom panel, the inspector): scroll that panel to it.
  useEffect(() => {
    if (!target) return
    const id = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${target}"]`)
      const box = el?.closest<HTMLElement>('.portmap, .inspector')
      if (!el || !box) return
      const e = el.getBoundingClientRect()
      const b = box.getBoundingClientRect()
      if (e.top < b.top || e.bottom > b.bottom) box.scrollTop += e.top - b.top - 8
    })
    return () => cancelAnimationFrame(id)
  }, [key, target])
  if (!cur) return null
  const { guide, step, index } = cur
  const go = (id: string, k: number, force = false) => {
    stopPlay()
    state.set((s) => openGuide(s, id, k))
    runAction(guideById(id)?.steps[k - 1]?.action, force)
  }
  // The reader counts only in Collectives mode (it shows nowhere else).
  // A reader step is shown while the reader holds its sample (the text is not in the URL); "paste your own" is
  // shown while the reader is open. Any other step is shown while the reader is closed: it covers the bottom panel.
  const inColl = state.mode === 'collectives'
  const readerOk = !inColl || (step.action === 'reader-clear' ? reader.open : step.action ? reader.open && reader.text === SAMPLE[step.action] : !reader.open)
  const replace = step.action !== undefined && step.action !== 'reader-clear' && ownText(reader.text)
  const shown = stepShown(state) && readerOk
  const last = index === guide.steps.length
  const next = GUIDES[GUIDES.indexOf(guide) + 1]
  return (
    <aside className="guide-card" data-testid="guide-card" aria-label={`Guide: ${guide.title}`}>
      {step.target && <style>{highlight(step.target)}</style>}
      <div className="guide-head">
        <strong>{guide.title}</strong>
        <span data-testid="guide-step">
          Step {index} of {guide.steps.length}
        </span>
        <button type="button" data-testid="guide-close" aria-label="Close the guide" title="Close the guide" onClick={() => state.set(closeGuide)}>
          ×
        </button>
      </div>
      <h3 aria-live="polite">{step.title}</h3>
      <p>
        <strong>Look at:</strong> {step.look}
      </p>
      {step.lesson && (
        <p className="lesson">
          <strong>Lesson:</strong> {step.lesson}
        </p>
      )}
      {!shown && (
        <button type="button" data-testid="guide-again" onClick={() => go(guide.id, index, replace)}>
          {replace ? 'Paste the sample (it replaces your text)' : 'Show this step again'}
        </button>
      )}
      <div className="guide-nav">
        <button type="button" data-testid="guide-back" disabled={index === 1} onClick={() => go(guide.id, index - 1)}>
          Back
        </button>
        {last ? (
          <button type="button" data-testid="guide-next" onClick={() => state.set(closeGuide)}>
            Finish
          </button>
        ) : (
          <button type="button" data-testid="guide-next" onClick={() => go(guide.id, index + 1)}>
            Next
          </button>
        )}
        {last && next && (
          <button type="button" data-testid="guide-next-guide" onClick={() => go(next.id, 1)}>
            Next guide: {next.title}
          </button>
        )}
      </div>
    </aside>
  )
}
