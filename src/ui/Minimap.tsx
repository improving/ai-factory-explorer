import type cytoscape from 'cytoscape'
import { useEffect, useRef, useState } from 'react'
import { useCy } from '../state/cy'
import { useUi } from '../state/ui'
import { fitBox, panToCentre, toMap, toModel, union, type Box, type Fit } from './minimapGeom'

const W = 200
const H = 130

// Spec 5.1: a small map of the whole view; the rectangle is the visible area; a click or a drag pans there.
export function Minimap() {
  const cy = useCy((s) => s.cy)
  const shown = useUi((u) => u.map) // closed when the page opens; the zoom bar opens it
  const [view, setView] = useState<Box | null>(null)
  const [count, setCount] = useState(0)
  const paper = useRef<HTMLCanvasElement>(null)
  const fit = useRef<Fit | null>(null)
  // During a drag the fit does not change: a new fit would move the point under the pointer, and the view would run away.
  const held = useRef<Fit | null>(null)

  useEffect(() => {
    if (!cy || !shown) return
    let frame = 0
    const draw = () => {
      frame = 0
      const el = paper.current
      const ctx = el?.getContext('2d')
      if (!el || !ctx) return
      const dpr = window.devicePixelRatio || 1
      if (el.width !== W * dpr) {
        el.width = W * dpr
        el.height = H * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      const nodes = cy.nodes().not('.packet') // the packet of a trace hop is not a part
      setCount(nodes.length)
      if (nodes.empty()) {
        fit.current = null
        setView(null)
        return
      }
      const visible = cy.extent()
      const f = held.current ?? fitBox(union(nodes.boundingBox({ includeLabels: false }), visible), W, H)
      fit.current = f
      const colour = getComputedStyle(el).color
      ctx.fillStyle = colour
      ctx.strokeStyle = colour
      nodes.forEach((n) => {
        const b = toMap(f, n.boundingBox({ includeLabels: false }))
        // A group (an SU, a rack) is an outline; a part is a filled box of at least one pixel.
        if (n.isParent()) ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1)
        else ctx.fillRect(b.x1, b.y1, Math.max(b.x2 - b.x1, 1), Math.max(b.y2 - b.y1, 1))
      })
      setView(toMap(f, visible))
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(draw)
    }
    schedule()
    const events = 'add remove position resize viewport'
    // The packet of a trace hop moves on each frame: its events do not redraw the map.
    const onEvent = (e: cytoscape.EventObject) => {
      if (e.target !== cy && typeof e.target.hasClass === 'function' && e.target.hasClass('packet')) return
      schedule()
    }
    cy.on(events, onEvent)
    return () => {
      cy.off(events, onEvent)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [cy, shown])

  // The drag is done: fit the map again.
  const release = () => {
    held.current = null
    cy?.emit('viewport')
  }

  const panTo = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cy || !fit.current) return
    const r = e.currentTarget.getBoundingClientRect()
    const p = toModel(fit.current, e.clientX - r.left, e.clientY - r.top)
    cy.pan(panToCentre(p, cy.zoom(), cy.width(), cy.height()))
  }

  if (!shown) return null
  return (
    <div className="minimap" data-testid="minimap" data-node-count={count} data-viewport={view ? [view.x1, view.y1, view.x2, view.y2].map(Math.round).join(',') : ''}>
      {shown && (
        <div
          className="minimap-box"
          data-testid="minimap-box"
          style={{ width: W, height: H }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            held.current = fit.current
            panTo(e)
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onPointerMove={(e) => {
            if (e.buttons & 1) panTo(e)
          }}
        >
          <canvas ref={paper} style={{ width: W, height: H }} />
          {view && <div className="minimap-view" style={{ left: view.x1, top: view.y1, width: view.x2 - view.x1, height: view.y2 - view.y1 }} />}
        </div>
      )}
    </div>
  )
}
