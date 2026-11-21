import cytoscape from 'cytoscape'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Config } from '../config/config'
import { useHighlight } from '../state/highlight'
import { useCy } from '../state/cy'
import { PLAY_MS, usePlay } from '../state/play'
import { useUi } from '../state/ui'
import { useApp } from '../state/store'
import { openFabric, openRack, openServer, pickGpu, select, toggleSu } from '../state/transitions'
import { suOf } from '../topology/ids'
import { ALL_COLOR_CLASSES, colorClass, hiddenNetworks, type Overlay } from '../views/overlays'
import type { HostAt } from '../telemetry/replay'
import { openHint } from './hints'
import { announceOf, nextIndex, partsOf } from './kbNav'
import { startAnts, startHopMotion } from './hopMotion'
import { setCollPair } from '../state/coll'
import { currentTheme } from '../views/palette'
import { stylesheet } from '../views/style'

type Props = { elements: cytoscape.ElementDefinition[]; viewKey: string; selected: string | null; rail: number | null; config: Config; overlay: Overlay; at: Map<string, HostAt> | null; hop: number | null; failed: string[]; hits: string[]; schedOk: string[]; schedBlocked: string[]; ring: boolean }

export function Canvas({ elements, viewKey, selected, rail, config, overlay, at, hop, failed, hits, schedOk, schedBlocked, ring }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const hint = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const fittedKey = useRef('')
  // The last place of the canvas on the screen: a fold or a resize keeps each part at its screen position.
  const lastRect = useRef<{ left: number; top: number; width: number; height: number } | null>(null)
  // True while the view is the fit of the current viewKey: nothing else moved it. A canvas that grows fits again
  // only then, so the fit of a reload fills the canvas and a view that the user moved stays as it is.
  const fitted = useRef(false)
  const own = useRef(false) // the app moves the viewport, not the user
  const centredFor = useRef<string | null>(null)
  const seq = useRef(0)
  const pair = useHighlight((h) => h.pair)
  // The keyboard: the ring is the part that the keys have reached, and the parts are the order of the drawing.
  const [ringId, setRingId] = useState<string | null>(null)
  const parts = useMemo(() => partsOf(elements), [elements])

  // One Cytoscape instance for the life of the page.
  useEffect(() => {
    const cy = cytoscape({
      container: box.current,
      style: stylesheet(currentTheme()),
      boxSelectionEnabled: false,
      textureOnViewport: true,
      hideEdgesOnViewport: false, // the element effect turns it on for a large view
      minZoom: 0.02,
      maxZoom: 4,
    })
    const app = useApp.getState
    cy.on('tap', (e) => {
      const t = e.target
      // Trace mode: a GPU click picks the source, then the destination (in the trace view, a click inspects).
      const now = app()
      // Collectives mode: a link opens the hops of a pair that uses it in the bottom panel.
      if (t !== cy && now.mode === 'collectives' && t.isEdge() && t.data('pair') !== undefined) return now.set((s) => setCollPair(s, String(t.data('pair'))))
      if (t !== cy && now.mode === 'trace' && now.view.level !== 'trace' && t.data('kind') === 'gpu') return now.set((s) => pickGpu(s, t.id()))
      if (t === cy || !t.selectable()) app().set((s) => select(s, null))
      else app().set((s) => select(s, t.id()))
    })
    cy.on('dbltap', 'node', (e) => {
      const kind = e.target.data('kind')
      if (kind === 'server') app().set((s) => openServer(s, e.target.id()))
      else if (kind === 'su') app().set((s) => toggleSu(s, suOf(e.target.id())!))
      else if (kind === 'block' && ['pods', 'compute-fabric'].includes(e.target.data('role'))) app().set(openFabric)
      // A rack of the elevation only: the NVL72 rack box of the node view and the open rack keep their double-click.
      else if (kind === 'rack' && app().view.level === 'racks') app().set((s) => openRack(s, e.target.id()))
    })
    const media = matchMedia('(prefers-color-scheme: dark)')
    const onTheme = () => {
      const t = currentTheme()
      cy.style(stylesheet(t))
      if (box.current) box.current.dataset.theme = t
    }
    media.addEventListener('change', onTheme)
    const unTheme = useUi.subscribe((u, prev) => u.theme !== prev.theme && onTheme())
    onTheme()
    cyRef.current = cy
    // The zoom, for the tests and the zoom bar: one update for each animation frame.
    let zoomFrame = 0
    const onViewport = () => {
      if (zoomFrame !== 0) return
      zoomFrame = requestAnimationFrame(() => {
        zoomFrame = 0
        if (box.current) box.current.dataset.zoom = cy.zoom().toFixed(3)
      })
    }
    cy.on('viewport', onViewport)
    cy.on('viewport', () => {
      if (!own.current) fitted.current = false
    })
    // Hover: a pointer on a part that a click selects, and a hint with its name and what a double-click does.
    const hide = () => {
      if (hint.current) hint.current.hidden = true
      if (box.current) box.current.style.cursor = ''
    }
    cy.on('mouseover', 'node', (e) => {
      const n = e.target
      const el = box.current
      const h = hint.current
      if (!el || !h) return
      el.style.cursor = n.selectable() ? 'pointer' : ''
      const label = String(n.data('label') ?? '')
      const what = openHint(String(n.data('kind') ?? ''), n.data('role'), useApp.getState().view.level)
      if (!label && !what) return hide()
      h.textContent = ''
      h.append(label)
      if (what) {
        const line = document.createElement('div')
        line.className = 'muted'
        line.textContent = what
        h.append(line)
      }
      const r = n.renderedBoundingBox()
      h.style.left = `${el.offsetLeft + Math.min(r.x2 + 8, el.clientWidth - 160)}px`
      h.style.top = `${el.offsetTop + Math.max(0, r.y1)}px`
      h.hidden = false
    })
    cy.on('mouseout', 'node', hide)
    cy.on('viewport', hide)
    useCy.setState({ cy })
    return () => {
      media.removeEventListener('change', onTheme)
      unTheme()
      cy.destroy()
      cyRef.current = null
      useCy.setState({ cy: null })
    }
  }, [])

  // A fit of the graph, at the current size of the canvas: the view is then the fitted one.
  const fitNow = (cy: cytoscape.Core, el: HTMLDivElement) => {
    if (cy.width() === 0 || cy.height() === 0) return // the layout has not settled: the observer fits again
    own.current = true
    cy.resize() // the port map and the legend change the size of the canvas
    cy.fit(undefined, 30)
    el.dataset.zoom = cy.zoom().toFixed(3)
    own.current = false
    fitted.current = true
  }

  // New elements: replace them all; fit only when the view changes, so an open SU keeps the viewport.
  useEffect(() => {
    const cy = cyRef.current!
    const el = box.current!
    const start = performance.now()
    cy.batch(() => {
      cy.elements().remove()
      cy.add(elements)
    })
    if (fittedKey.current !== viewKey) {
      fitNow(cy, el)
      fittedKey.current = viewKey
      // The bars and the panels take their final size after the first paint, so the fit of this frame can be too
      // large or too small. Fit again on the final size, unless something else moved the view in between (a
      // selection that the app centres, or the user): `fitted` is false after any such move.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const c = cyRef.current
          if (!c || fittedKey.current !== viewKey || !fitted.current) return
          fitNow(c, el)
        }),
      )
    }
    el.dataset.elementCount = String(cy.elements().length)
    // A pan hides the links only in a large view, where drawing them on each frame is slow. The option is not in
    // the Cytoscape types; the renderer reads it on each frame.
    const hideEdges = cy.elements().length > 3000
    ;(cy as unknown as { renderer(): { hideEdgesOnViewport: boolean } }).renderer().hideEdgesOnViewport = hideEdges
    el.dataset.hideEdges = hideEdges ? '1' : '0'
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.dataset.renderMs = String(Math.round(performance.now() - start))
        seq.current += 1
        el.dataset.renderSeq = String(seq.current)
      }),
    )
  }, [elements, viewKey])

  // Every change of the size of the canvas: a window resize, a panel, a fold, and a late layout (the development
  // server adds the stylesheet after the first render, so the canvas can be 0 px when it is first fitted).
  // A canvas that grows fits the graph again when the view is still the fit, after the change stops (a drag of the
  // panel must not refit on every frame). A canvas that shrinks keeps each part at its screen position, and a move
  // of the left or top edge of the canvas moves the pan by the same amount.
  useEffect(() => {
    const el = box.current
    if (!el) return
    let timer = 0
    const onSize = () => {
      const cy = cyRef.current
      if (!cy) return
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return // the layout has not settled yet
      const prev = lastRect.current ?? { left: r.left, top: r.top, width: r.width, height: r.height }
      lastRect.current = { left: r.left, top: r.top, width: r.width, height: r.height }
      cy.resize()
      const grew = r.width > prev.width + 1 || r.height > prev.height + 1
      const bb = cy.elements().renderedBoundingBox()
      const inside = bb.x1 >= -2 && bb.y1 >= -2 && bb.x2 <= cy.width() + 2 && bb.y2 <= cy.height() + 2
      // A graph outside the canvas is fitted again even when the user moved it: a view that no longer shows the
      // graph is not a view. A graph inside it is fitted again only when the canvas grew and nothing moved it.
      const forced = !inside
      if (forced || (fitted.current && grew)) {
        window.clearTimeout(timer)
        timer = window.setTimeout(() => {
          const c = cyRef.current
          if (c && (forced || fitted.current)) fitNow(c, el)
        }, 120)
        return
      }
      const pan = cy.pan()
      const dx = prev.left - r.left
      const dy = prev.top - r.top
      if (dx === 0 && dy === 0) return
      own.current = true
      cy.pan({ x: pan.x + dx, y: pan.y + dy })
      own.current = false
    }
    const ro = new ResizeObserver(onSize)
    ro.observe(el)
    window.addEventListener('resize', onSize)
    return () => {
      window.clearTimeout(timer)
      ro.disconnect()
      window.removeEventListener('resize', onSize)
    }
  }, [])

  // Selection: focus on the part, its direct links, and the parts at their other ends; fade the rest; pulse the halo.
  useEffect(() => {
    const cy = cyRef.current!
    const el = box.current!
    let focusCount = 0
    let fadedCount = 0
    stopPulse(cy, el)
    cy.batch(() => {
      cy.$(':selected').unselect()
      cy.elements().removeClass('focus faded')
      const target = selected ? cy.getElementById(selected) : cy.collection()
      if (target.empty()) return
      target.select()
      // A part: itself, its children, its links, and the parts at their other ends. A cable: itself and its two ends.
      const parts = target.nodes().union(target.nodes().descendants())
      let focus = parts.union(parts.closedNeighborhood()).union(target.edges()).union(target.edges().connectedNodes())
      focus = focus.union(focus.nodes().ancestors()) // a faded compound parent would fade its children too
      focus.addClass('focus')
      const faded = cy.elements().not(focus)
      faded.addClass('faded')
      focusCount = focus.length
      fadedCount = faded.length
    })
    // A new selection can be outside the visible area (a server in a group that search opened): centre on it.
    // Only for a new selection: an SU that opens later keeps the viewport (see the fit rule above).
    cy.resize() // a panel that opens or folds changes the size, and the extent below must use the new size
    const shown = selected ? cy.getElementById(selected) : cy.collection()
    if (shown.nonempty()) {
      const b = shown.boundingBox()
      const v = cy.extent()
      const outside = b.x2 < v.x1 || b.x1 > v.x2 || b.y2 < v.y1 || b.y1 > v.y2
      if (outside && centredFor.current !== selected) cy.center(shown)
      const w = cy.extent()
      el.dataset.selectedInView = b.x2 >= w.x1 && b.x1 <= w.x2 && b.y2 >= w.y1 && b.y1 <= w.y2 ? '1' : '0'
    } else delete el.dataset.selectedInView
    centredFor.current = selected
    el.dataset.focusCount = String(focusCount)
    el.dataset.fadedCount = String(fadedCount)
    if (selected) startPulse(cy.getElementById(selected), el)
  }, [selected, elements, viewKey]) // a viewKey change alone (the legend) also replaces the elements

  useEffect(() => {
    const cy = cyRef.current!
    let lit = 0
    cy.batch(() => {
      cy.elements().removeClass('hl dim')
      if (rail === null) return
      const railed = cy.elements(`.rail-${rail}`) // a two-rail leaf has two rail classes
      // A dimmed parent (an SU, a tray, the rack) dims its children too, so the parents stay lit.
      const on = railed.union(railed.nodes().ancestors())
      on.addClass('hl')
      cy.elements().not(on).addClass('dim')
      lit = on.length
    })
    box.current!.dataset.railLit = String(lit)
  }, [rail, elements, viewKey])

  // The overlays: one colour class on each part that has a value; the links of a hidden layer are not shown.
  useEffect(() => {
    const cy = cyRef.current!
    const el = box.current!
    const off = hiddenNetworks(overlay.hidden)
    let lit = 0
    let hidden = 0
    cy.batch(() => {
      cy.elements().removeClass(`${ALL_COLOR_CLASSES} off`)
      cy.nodes().forEach((n) => {
        const cls = colorClass(config, overlay.color, { id: n.id(), kind: n.data('kind'), role: n.data('role') }, at)
        if (cls) {
          n.addClass(cls)
          lit++
        }
      })
      cy.edges().forEach((e) => {
        if (off.has(e.data('network'))) {
          e.addClass('off')
          hidden++
        }
      })
    })
    el.dataset.overlayLit = String(lit)
    el.dataset.offCount = String(hidden)
  }, [overlay, config, elements, viewKey, at])

  // Schedule mode: the servers that the job places, and the servers of the same domain that are not free.
  useEffect(() => {
    const cy = cyRef.current!
    const el = box.current!
    let ok = 0
    let blocked = 0
    cy.batch(() => {
      cy.elements().removeClass('sched-ok sched-blocked')
      for (const id of schedOk) {
        const n = cy.getElementById(id)
        if (n.nonempty()) {
          n.addClass('sched-ok')
          ok++
        }
      }
      for (const id of schedBlocked) {
        const n = cy.getElementById(id)
        if (n.nonempty()) {
          n.addClass('sched-blocked')
          blocked++
        }
      }
    })
    el.dataset.schedOk = String(ok)
    el.dataset.schedBlocked = String(blocked)
  }, [schedOk, schedBlocked, elements, viewKey])

  // A selection or a rail highlight replaces the pair highlight of a topo -m cell.
  useEffect(() => {
    if (selected !== null || rail !== null) useHighlight.getState().setPair([])
  }, [selected, rail])

  // The pair highlight of a topo -m cell: the two parts stay, the rest fades.
  useEffect(() => {
    const cy = cyRef.current!
    let lit = 0
    cy.batch(() => {
      cy.elements().removeClass('pair-on pair-off')
      const on = cy.nodes().filter((n) => pair.includes(n.id()))
      if (on.empty()) return
      on.addClass('pair-on')
      cy.elements().not(on).addClass('pair-off')
      lit = on.length
    })
    box.current!.dataset.pairLit = String(lit)
  }, [pair, elements, viewKey])

  // The hops of a trace: the done links, the current link (thick and dashed), and the later links (less bright);
  // the two parts of the current hop get a ring (no pulse, no transition).
  useEffect(() => {
    const cy = cyRef.current!
    const el = box.current!
    const edge = hop === null ? cy.collection() : cy.getElementById(`hop-${hop}`)
    cy.batch(() => {
      cy.elements().removeClass('hop-done hop-on hop-later hop-end')
      if (hop === null) return
      cy.edges('.hop').forEach((e) => {
        const k = Number(e.data('hop'))
        e.addClass(k < hop ? 'hop-done' : k === hop ? 'hop-on' : 'hop-later')
      })
      edge.connectedNodes().addClass('hop-end')
    })
    el.dataset.hopOn = edge.empty() ? '' : String(hop)
    el.dataset.hopsDone = String(hop ?? 0)
    // The motion of the current hop (after the batch); the cleanup stops it before a new hop or another view.
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const hopMs = () => {
      const p = usePlay.getState()
      return p.playing ? PLAY_MS[p.speed] : null
    }
    return startHopMotion(cy, edge, { hopMs, reduced: reduced || hop === null, el })
  }, [hop, elements, viewKey])

  // Collectives mode: the dashes of the lit ring edges move (this effect comes after the hop effect, which sets the
  // ants off when there is no hop).
  useEffect(() => {
    if (!ring) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const cy = cyRef.current!
    return startAnts(cy, cy.edges('.ring-on'), { reduced, el: box.current! })
  }, [ring, elements, viewKey])

  // The failures of the simulator: the failed parts, and the parts that a failure hits (GPUs, servers, the pods block).
  useEffect(() => {
    const cy = cyRef.current!
    const el = box.current!
    let f = 0
    let h = 0
    cy.batch(() => {
      cy.elements().removeClass('failed hit')
      for (const id of failed) {
        const e = cy.getElementById(id)
        if (!e.empty()) {
          e.addClass('failed')
          f++
        }
      }
      for (const id of hits) {
        const e = cy.getElementById(id)
        if (!e.empty() && !e.hasClass('failed')) {
          e.addClass('hit')
          h++
        }
      }
    })
    el.dataset.failedCount = String(f)
    el.dataset.hitCount = String(h)
  }, [failed, hits, elements, viewKey])

  // The ring of the keyboard: one class on the part that the keys reached.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.batch(() => {
      cy.nodes().removeClass('kb-ring')
      if (ringId !== null) cy.getElementById(ringId).addClass('kb-ring')
    })
  }, [ringId, elements, viewKey])
  // A new view has other parts: the ring of the old view is not a part of it.
  useEffect(() => setRingId(null), [viewKey])

  const ringIndex = ringId === null ? -1 : parts.findIndex((p) => p.id === ringId)
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (parts.length === 0) return
    if (e.key === 'Tab') {
      const next = nextIndex(ringIndex, parts.length, e.shiftKey ? -1 : 1)
      // Past the last part, or before the first: the canvas lets the focus go to the next element of the page.
      if (next < 0) return setRingId(null)
      e.preventDefault()
      setRingId(parts[next]!.id)
      return
    }
    if ((e.key === 'Enter' || e.key === ' ') && ringId !== null) {
      e.preventDefault()
      useApp.getState().set((s) => select(s, ringId))
      return
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      setRingId(parts[e.key === 'Home' ? 0 : parts.length - 1]!.id)
    }
  }
  const onFocus = () => {
    if (parts.length === 0) return
    // The selection is the first part that the keys reach, so a keyboard user starts where the mouse left off.
    setRingId((r) => (r !== null && parts.some((p) => p.id === r) ? r : (selected ?? parts[0]!.id)))
  }

  return (
    <>
      <div ref={hint} className="hover-hint" data-testid="hover-hint" hidden />
      <div
        ref={box}
        className="canvas"
        data-testid="canvas"
        tabIndex={0}
        role="application"
        aria-label="The canvas. Tab moves between the parts, Enter opens the selected part, Esc goes up one level."
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={() => setRingId(null)}
        data-kb-ring={ringId ?? ''}
        data-render-seq="0" data-focus-count="0" data-faded-count="0" data-pulse="off" data-rail-lit="0" data-overlay-lit="0" data-off-count="0" data-pair-lit="0" data-hop-on="" data-hops-done="0" data-ants="off" data-packet="off" data-failed-count="0" data-hit-count="0" />
      <p className="sr-only" aria-live="polite" data-testid="kb-announce">
        {ringId !== null && ringIndex >= 0 ? announceOf(parts[ringIndex]!, ringIndex, parts.length) : ''}
      </p>
    </>
  )
}

const PULSE = ['underlay-padding', 'underlay-opacity'].join(' ')

// The halo grows and shrinks two times, then the stylesheet values come back. The animation sets
// inline styles, so they are removed at the end and whenever the selection changes.
function startPulse(target: cytoscape.CollectionReturnValue, el: HTMLDivElement) {
  if (target.empty()) return
  el.dataset.pulse = 'on'
  const beat = (left: number) => {
    if (left === 0) {
      target.removeStyle(PULSE)
      el.dataset.pulse = 'off'
      return
    }
    target.animate(
      { style: { 'underlay-padding': 18, 'underlay-opacity': 0.55 } },
      {
        duration: 150,
        complete: () =>
          target.animate({ style: { 'underlay-padding': 8, 'underlay-opacity': 0.35 } }, { duration: 150, complete: () => beat(left - 1) }),
      },
    )
  }
  beat(2)
}

function stopPulse(cy: cytoscape.Core, el: HTMLDivElement) {
  const moving = cy.elements(':animated').not('.packet') // the packet of a trace hop keeps moving
  moving.stop(true, false)
  moving.removeStyle(PULSE)
  el.dataset.pulse = 'off'
}
