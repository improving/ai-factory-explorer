import { useCy } from '../state/cy'
import { FitIcon, ZoomInIcon, ZoomOutIcon } from './icons'

const STEP = 1.25

// The zoom tools in the bottom-right corner of the canvas: zoom in, zoom out, and fit. The map and the PNG are
// in the header, with the other tools of the page.
export function ZoomBar() {
  const cy = useCy((s) => s.cy)
  const zoom = (factor: number) => {
    if (!cy) return
    cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
  }
  return (
    <div className="zoombar" role="toolbar" aria-label="View">
      <button type="button" className="icon" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoom(STEP)}>
        <ZoomInIcon />
      </button>
      <button type="button" className="icon" aria-label="Zoom out" title="Zoom out (−)" onClick={() => zoom(1 / STEP)}>
        <ZoomOutIcon />
      </button>
      <button type="button" className="icon" aria-label="Fit" title="Fit the view" onClick={() => cy?.fit(undefined, 30)}>
        <FitIcon />
      </button>
    </div>
  )
}
