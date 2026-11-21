import type cytoscape from 'cytoscape'
import { LINK_LABEL } from '../catalog/paths'
import type { Trace } from '../routing/trace'

type El = cytoscape.ElementDefinition
const STEP = 300 // the space between two parts of the path: a link of about 130 px, for the moving dashes and the packet
const RISE = 115 // the space between two parts of a fan (a part is 96 px high: four lines of label)
const FAN_SHOWN = 3

// The path strip: the parts of the path from left to right, one edge for each hop, and the equal-cost
// choices of a hop (the fan) stacked above the part that the trace takes.
export function traceElements(t: Trace): El[] {
  const out: El[] = []
  const parts = [t.hops[0]!.from, ...t.hops.map((h) => h.to)]
  parts.forEach((p, i) => out.push({ group: 'nodes', data: { id: p.id, label: p.label, kind: p.kind }, position: { x: i * STEP, y: 0 }, classes: `part ${p.kind} trace-part${p.virtual ? ' virtual' : ''}` }))
  t.hops.forEach((h, i) => {
    out.push({
      group: 'edges',
      data: { id: `hop-${i}`, source: h.from.id, target: h.to.id, kind: 'cable', hop: i, network: h.network, label: String(i + 1), link: LINK_LABEL[h.link] },
      classes: `hop ${h.network}${t.bottleneck === i ? ' bottleneck' : ''}`,
    })
    const next = t.hops[i + 1]?.to
    h.fan.slice(0, FAN_SHOWN).forEach((alt, k) => {
      out.push({ group: 'nodes', data: { id: alt.id, label: alt.label, kind: alt.kind }, position: { x: (i + 1) * STEP, y: -(k + 1) * RISE }, classes: `part ${alt.kind} fan` })
      out.push({ group: 'edges', data: { id: `fan-${i}-${k}-in`, source: h.from.id, target: alt.id, kind: 'cable' }, classes: 'fan' })
      if (next) out.push({ group: 'edges', data: { id: `fan-${i}-${k}-out`, source: alt.id, target: next.id, kind: 'cable' }, classes: 'fan' })
    })
    if (h.fan.length > FAN_SHOWN) {
      out.push({
        group: 'nodes',
        data: { id: `fan-${i}-more`, label: `+${h.fan.length - FAN_SHOWN} more` },
        position: { x: (i + 1) * STEP, y: -(FAN_SHOWN + 1) * RISE },
        classes: 'fan more',
        selectable: false,
      })
    }
  })
  return out
}
