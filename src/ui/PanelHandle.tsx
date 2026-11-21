import { useUi } from '../state/ui'

const MIN = 120
const STEP = 24

// The top edge of the bottom panel (the hop table, the impact panel, the port map, topo -m): drag it, or use the
// arrow keys, to change the height of the panel. During a drag only the CSS variable changes (no re-render, no fit);
// the store gets the height on pointerup, and the view fits again then.
export function PanelHandle() {
  const panel = useUi((u) => u.panel)
  const mainOf = (el: HTMLElement) => el.closest('main') as HTMLElement
  const clamp = (main: HTMLElement, px: number) => Math.round(Math.max(MIN, Math.min(main.clientHeight - 240, px)))
  const current = (main: HTMLElement) => panel ?? Math.round(main.clientHeight * 0.3)
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Panel height"
      aria-valuenow={panel ?? undefined}
      tabIndex={0}
      className="panel-handle"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!(e.buttons & 1)) return
        const main = mainOf(e.currentTarget)
        const px = clamp(main, main.getBoundingClientRect().bottom - e.clientY)
        main.style.setProperty('--panel-h', `${px}px`)
      }}
      onPointerUp={(e) => {
        const main = mainOf(e.currentTarget)
        const v = parseInt(main.style.getPropertyValue('--panel-h'), 10)
        if (Number.isFinite(v)) useUi.setState({ panel: v })
      }}
      onKeyDown={(e) => {
        const main = mainOf(e.currentTarget)
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          e.stopPropagation() // the window handler steps the trace hop with the arrow keys
          useUi.setState({ panel: clamp(main, current(main) + (e.key === 'ArrowUp' ? STEP : -STEP)) })
        } else if (e.key === 'Home') {
          e.preventDefault()
          useUi.setState({ panel: null })
        }
      }}
    />
  )
}
