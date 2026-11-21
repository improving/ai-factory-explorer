import type cytoscape from 'cytoscape'

const ANT_SPEED = 40 // model px each second: the dashes move from the source to the target
const DASH_CYCLE = 20 // the dash pattern of a current hop is 12 + 8 (style.ts)
const REST_MS = 600 // a still trace: the rest between two moves of the packet
let packets = 0

// The time for the packet to move along one hop: less than the time of a hop while Play runs, else a fixed time.
export function packetDuration(hopMs: number | null): number {
  return hopMs === null ? 900 : Math.round(hopMs * 0.8)
}

// The motion of the current hop of a trace: the dashes of its link move (marching ants), and a packet moves along
// it from the source to the target. While Play runs, one move for each hop; a still trace (also at the last hop)
// repeats the move after a rest. `hopMs` is read at each move (Play can start or stop). The return value stops it.
export function startHopMotion(cy: cytoscape.Core, edge: cytoscape.CollectionReturnValue, opts: { hopMs: () => number | null; reduced: boolean; el: HTMLElement }): () => void {
  const { el } = opts
  el.dataset.ants = 'off'
  el.dataset.packet = 'off'
  if (opts.reduced || edge.empty() || !edge.isEdge()) return () => {}

  let stopped = false
  let frame = 0
  let rest: ReturnType<typeof setTimeout> | undefined
  const t0 = performance.now()
  const ants = (now: number) => {
    if (stopped) return
    edge.style('line-dash-offset', -(((now - t0) / 1000) * ANT_SPEED) % DASH_CYCLE)
    frame = requestAnimationFrame(ants)
  }
  frame = requestAnimationFrame(ants)
  el.dataset.ants = 'on'

  // A new id for each packet: Cytoscape keeps the elements that animate in a set by id, and a new packet with the
  // id of a removed one is not added to it (its animation does not start).
  const packet = cy.add({ group: 'nodes', data: { id: `__packet-${++packets}`, kind: 'packet', label: '' }, position: { ...edge.sourceEndpoint() }, classes: 'packet' })
  packet.unselectify().ungrabify()
  // The packet moves on the visible link only: from the border of the source to the border of the target (the
  // ends of the edge, read at each move, so a part that the user drags moves the path too). At the target it
  // fades out, rests, and starts again at the source: it never sits on the label of a part.
  const move = () => {
    if (stopped) return
    packet.stop(true, false)
    packet.position({ ...edge.sourceEndpoint() })
    packet.style('opacity', 1)
    packet.animate(
      { position: { ...edge.targetEndpoint() } },
      {
        duration: packetDuration(opts.hopMs()),
        easing: 'ease-in-out-sine',
        complete: () => {
          if (stopped) return
          packet.animate({ style: { opacity: 0 } }, { duration: 150 })
          // Always the next move after a rest: a still trace (also after a Pause) repeats it, and while Play runs
          // the next hop comes first (0.8 × a hop + 600 ms is more than a hop) and stops this motion.
          rest = setTimeout(move, REST_MS)
        },
      },
    )
  }
  move()
  el.dataset.packet = 'on'

  return () => {
    stopped = true
    cancelAnimationFrame(frame)
    clearTimeout(rest)
    el.dataset.ants = 'off'
    el.dataset.packet = 'off'
    if (cy.destroyed()) return
    edge.removeStyle('line-dash-offset')
    packet.stop(true, false)
    cy.remove(packet)
  }
}

// Collectives mode: the dashes of all the links of a ring step move at once (each link carries data). No packet.
export function startAnts(cy: cytoscape.Core, edges: cytoscape.EdgeCollection, opts: { reduced: boolean; el: HTMLElement }): () => void {
  const { el } = opts
  el.dataset.ants = 'off'
  if (opts.reduced || edges.empty()) return () => {}
  let stopped = false
  let frame = 0
  const t0 = performance.now()
  const ants = (now: number) => {
    if (stopped) return
    edges.style('line-dash-offset', -(((now - t0) / 1000) * ANT_SPEED) % DASH_CYCLE)
    frame = requestAnimationFrame(ants)
  }
  frame = requestAnimationFrame(ants)
  el.dataset.ants = 'on'
  return () => {
    stopped = true
    cancelAnimationFrame(frame)
    el.dataset.ants = 'off'
    if (!cy.destroyed()) edges.removeStyle('line-dash-offset')
  }
}
