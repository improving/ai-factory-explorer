import { useApp } from '../state/store'
import { setMode, type Mode } from '../state/transitions'
import { stopPlay } from '../state/play'

const MODES: Mode[] = ['explore', 'trace', 'simulate', 'collectives', 'schedule', 'library']
const LABEL: Record<Mode, string> = { explore: 'Explore', trace: 'Trace', simulate: 'Simulate', collectives: 'Collectives', schedule: 'Schedule', library: 'Library' }

// Explore, Trace, Simulate, Collectives, Schedule, or Library (spec 5.1): one segmented toggle, a radio group.
// The arrow keys move to the next or the previous mode; only the current mode is in the tab order.
export function ModeSwitch() {
  const { mode, set } = useApp()
  const pick = (m: Mode, focus = false) => {
    if (m !== mode) stopPlay() // Play belongs to the mode that started it
    set((s) => setMode(s, m))
    if (focus) document.querySelector<HTMLButtonElement>(`[data-testid="mode-${m}"]`)?.focus()
  }
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    e.stopPropagation() // the window handler steps the trace hop with the same keys
    pick(MODES[(MODES.indexOf(mode) + step + MODES.length) % MODES.length]!, true)
  }
  return (
    <div className="modes" role="radiogroup" aria-label="Mode" onKeyDown={onKey}>
      {MODES.map((m) => (
        <button key={m} type="button" role="radio" data-testid={`mode-${m}`} aria-checked={mode === m} tabIndex={mode === m ? 0 : -1} onClick={() => pick(m)}>
          {LABEL[m]}
        </button>
      ))}
    </div>
  )
}
