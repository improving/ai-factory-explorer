import type cytoscape from 'cytoscape'
import { HEALTH_COLORS, LIFECYCLE_COLORS, OWNER_COLORS, PHASE_COLORS, RAIL_COLORS, STATE_COLORS, TENANT_COLORS, THEMES, UAT_COLOR, type Theme } from './palette'

// StylesheetJson, not CytoscapeOptions['style']: that type also allows a Promise, which cy.style() refuses.
export function stylesheet(theme: Theme): cytoscape.StylesheetJson {
  const t = THEMES[theme]
  const rails = RAIL_COLORS.flatMap((c, k) => [
    { selector: `node.rail-${k}`, style: { 'border-color': c } },
    { selector: `edge.rail-${k}`, style: { 'line-color': c } },
  ])
  const fill = (cls: string, color: string) => ({ selector: `node.${cls}`, style: { 'background-color': color, 'background-opacity': 0.85 } })
  const overlays = [
    ...Object.entries(OWNER_COLORS).map(([o, c]) => fill(`ov-own-${o}`, c)),
    ...TENANT_COLORS.map((c, i) => fill(`ov-ten-${i + 1}`, c)),
    fill('ov-ten-uat', UAT_COLOR),
    ...Object.entries(STATE_COLORS).map(([s, c]) => fill(`ov-st-${s}`, c)),
    ...PHASE_COLORS.map((c, i) => fill(`ov-ph-${i + 1}`, c)),
    ...Object.entries(LIFECYCLE_COLORS).map(([s, c]) => fill(`ov-lc-${s}`, c)),
    ...Object.entries(HEALTH_COLORS).map(([s, c]) => fill(`ov-hl-${s}`, c)),
  ]
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'font-size': 12,
        color: t.fg,
        'text-valign': 'center',
        'text-halign': 'center',
        'background-color': t.box,
        'border-width': 1,
        'border-color': t.boxBorder,
        shape: 'round-rectangle',
        width: 56,
        height: 24,
        'min-zoomed-font-size': 6, // hide a label that is too small to read, so it does not smear
      },
    },
    { selector: 'node.spine', style: { width: 70, height: 26 } },
    { selector: 'node.leaf', style: { width: 84, height: 28, 'border-width': 4, 'font-size': 12 } },
    { selector: 'node.su.closed', style: { width: 'data(w)', height: 90, 'text-wrap': 'wrap', 'font-size': 14 } },
    { selector: 'node.su.expanded', style: { 'background-opacity': 0.35, 'text-valign': 'bottom', 'font-size': 14, padding: '12px' } },
    { selector: 'node.anchor', style: { width: 8, height: 8, shape: 'ellipse', 'background-color': t.muted, 'border-width': 0 } },
    { selector: 'node.server', style: { width: 40, height: 30, 'font-size': 12, 'text-wrap': 'wrap', 'text-max-width': '40px' } },
    // 12 px or more: a view fits at a zoom of about 0.5, and Cytoscape hides a label under min-zoomed-font-size (6 px on screen).
    { selector: 'node.part', style: { width: 96, height: 34, 'text-wrap': 'wrap', 'text-max-width': '90px', 'font-size': 12 } },
    { selector: 'node.part.gpu, node.part.nic', style: { 'border-width': 4 } },
    { selector: 'node.part.port', style: { width: 50, height: 26, 'font-size': 12 } },
    { selector: 'node.sched-ok', style: { 'border-width': 4, 'border-color': '#2e7d32', 'border-style': 'solid' } },
    { selector: 'node.sched-blocked', style: { 'border-width': 4, 'border-color': '#c62828', 'border-style': 'dashed' } },
    { selector: 'edge', style: { width: 1, 'curve-style': 'haystack', 'line-color': t.muted, opacity: 0.8 } },
    {
      selector: 'edge.bundle',
      style: {
        width: 'mapData(count, 1, 72, 1.5, 6)',
        'curve-style': 'straight',
        label: 'data(label)',
        'font-size': 12,
        color: t.fg,
        'text-background-color': t.bg,
        'text-background-opacity': 1,
      },
    },
    { selector: 'edge.stub', style: { width: 2, 'curve-style': 'straight' } },
    { selector: 'edge.nvlink', style: { 'line-color': t.nvlink, width: 3, 'curve-style': 'straight' } },
    { selector: 'edge.pcie', style: { 'line-color': t.pcie, width: 2, 'curve-style': 'straight' } },
    { selector: 'edge.converged', style: { 'line-color': t.converged, width: 2, 'line-style': 'dashed', 'curve-style': 'straight' } },
    { selector: 'edge.oob', style: { 'line-color': t.oob, width: 2, 'line-style': 'dotted', 'curve-style': 'straight' } },
    { selector: 'edge.memory', style: { 'line-color': t.pcie, width: 4, 'curve-style': 'straight' } },
    { selector: 'edge.service', style: { 'line-color': t.muted, width: 1, 'line-style': 'dashed', 'curve-style': 'straight' } },
    { selector: 'node.part.psu, node.part.fan', style: { width: 170, height: 44, 'text-max-width': '160px', 'font-size': 12 } },
    { selector: 'node.leaf.tor', style: { 'border-color': t.muted } },
    { selector: 'node.rack', style: { 'background-opacity': 0.12, 'text-valign': 'top', 'font-size': 14, padding: '16px' } },
    { selector: 'node.tray, node.switch-tray', style: { 'background-opacity': 0.3, 'text-halign': 'left', 'font-size': 13, padding: '6px' } },
    { selector: 'node.part.power-shelf', style: { width: 1300, height: 30 } },
    { selector: 'node.part.service', style: { shape: 'tag', width: 150, 'font-size': 12 } },
    { selector: 'edge.c2c', style: { 'line-color': t.nvlink, width: 3, 'line-style': 'dashed', 'curve-style': 'straight' } },
    { selector: 'edge.nvlink.fabric', style: { width: 0.5, opacity: 0.25, 'curve-style': 'haystack' } },
    { selector: 'node.block', style: { width: 210, height: 64, 'text-wrap': 'wrap', 'text-max-width': '200px', 'font-size': 16 } },
    {
      selector: 'edge.ov',
      style: {
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        width: 2,
        label: 'data(label)',
        'font-size': 12,
        color: t.muted,
        'text-rotation': 'autorotate',
        'text-background-color': t.bg,
        'text-background-opacity': 1,
      },
    },
    { selector: 'edge.ov.north-south', style: { 'line-color': '#7E57C2', 'target-arrow-color': '#7E57C2', width: 3 } },
    { selector: 'edge.ov.in-band', style: { 'line-color': t.converged, 'target-arrow-color': t.converged } },
    { selector: 'edge.ov.storage', style: { 'line-color': t.nvlink, 'target-arrow-color': t.nvlink } },
    { selector: 'edge.ov.oob', style: { 'line-color': t.oob, 'target-arrow-color': t.oob, 'line-style': 'dotted' } },
    { selector: 'edge.ov.compute', style: { 'line-color': t.fg, 'target-arrow-color': t.fg, width: 3 } },
    { selector: 'edge.ov.power', style: { 'line-color': '#E69F00', 'target-arrow-color': '#E69F00' } },
    { selector: 'edge.ov.cooling', style: { 'line-color': '#56B4E9', 'target-arrow-color': '#56B4E9', 'line-style': 'dashed' } },
    { selector: 'edge.ov.management', style: { 'line-color': t.muted, 'target-arrow-color': t.muted, 'line-style': 'dashed' } },
    { selector: 'edge.ov.telemetry', style: { 'line-color': '#D55E00', 'target-arrow-color': '#D55E00', 'line-style': 'dashed', width: 2 } },
    { selector: 'node.erack', style: { 'background-opacity': 0.04, 'border-width': 2, 'text-valign': 'top', 'font-size': 24, 'text-wrap': 'wrap', 'text-max-width': '230px', padding: '8px' } },
    { selector: 'node.umark', style: { width: 1, height: 1, 'background-opacity': 0, 'border-width': 0, 'font-size': 12, color: t.muted } },
    { selector: 'node.device', style: { shape: 'rectangle', width: 'data(w)', height: 'data(h)', 'font-size': 'data(fs)', 'text-wrap': 'wrap' } },
    { selector: 'node.device.pdu, node.device.power-shelf', style: { 'background-color': '#E69F00', 'background-opacity': 0.3 } },
    { selector: 'node.device.manifold, node.cdu-rack', style: { 'background-color': '#56B4E9', 'background-opacity': 0.35 } },
    { selector: 'node.cdu-rack', style: { shape: 'rectangle', width: 'data(w)', height: 'data(h)', 'font-size': 24, 'text-wrap': 'wrap', 'text-max-width': '170px' } },
    { selector: 'node.device.far', style: { 'border-style': 'dashed', 'text-valign': 'top' } },
    { selector: 'node.rport', style: { shape: 'rectangle', width: 'data(w)', height: 'data(h)', 'font-size': 'data(fs)', 'border-width': 2 } },
    { selector: 'node.rport.unused', style: { opacity: 0.35 } },
    { selector: 'edge.cable', style: { width: 1.5, 'curve-style': 'straight' } },
    ...overlays,
    { selector: '.off', style: { display: 'none' } },
    ...rails,
    { selector: '.dim', style: { opacity: 0.1 } },
    { selector: 'edge.hl', style: { width: 2.5, opacity: 1 } },
    // Selection: the part and its direct links stay in focus, the rest fades; the part gets a halo,
    // a thick border, and a bold label, so it stands out without colour too.
    { selector: '.faded', style: { opacity: 0.3 } },
    // A group (an SU, a rack, a tray) fades only its own paint: Cytoscape multiplies the opacity of a child by the
    // opacity of its parents, and a failed part inside a faded group must stay visible.
    { selector: 'node:parent.faded', style: { opacity: 1, 'background-opacity': 0.06, 'border-opacity': 0.3, 'text-opacity': 0.3 } },
    { selector: '.pair-off', style: { opacity: 0.15 } },
    { selector: 'node.pair-on', style: { 'border-width': 6, 'border-color': t.select } },
    // The strip fits at a zoom of about 0.5, so its parts and hop numbers are large; the hop table names each link.
    { selector: 'node.trace-part, node.fan', style: { width: 170, height: 96, 'font-size': 22, 'text-max-width': '160px' } },
    { selector: 'node.virtual', style: { 'border-style': 'dashed', 'border-width': 2 } },
    { selector: 'edge.hop', style: { width: 4, label: 'data(label)', 'font-size': 22, color: t.fg, 'text-background-color': t.bg, 'text-background-opacity': 1, 'curve-style': 'straight', 'target-arrow-shape': 'triangle' } },
    { selector: 'edge.hop.bottleneck', style: { width: 7, 'line-style': 'dashed' } },
    { selector: 'edge.fan', style: { width: 1, 'line-style': 'dotted', 'line-color': t.muted, 'curve-style': 'straight' } },
    { selector: 'node.fan', style: { opacity: 0.65 } },
    { selector: 'node.more', style: { label: 'data(label)', 'background-opacity': 0, 'border-width': 0, 'font-size': 22, color: t.muted } },
    // The trace: the done hops in the select colour, the current hop thick and dashed (its dashes move: hopMotion.ts),
    // the later hops less bright. The two parts of the current hop get a ring (no pulse, no transition: a Cytoscape
    // transition starts again at each style update of the element, and the other class effects update it).
    { selector: 'edge.hop.hop-done', style: { 'line-color': t.select, 'target-arrow-color': t.select } },
    { selector: 'edge.hop.hop-on', style: { 'line-color': t.select, 'target-arrow-color': t.select, 'line-style': 'dashed', 'line-dash-pattern': [12, 8], width: 7, 'z-index': 950 } },
    { selector: 'edge.hop.hop-later', style: { opacity: 0.35 } },
    // Collectives mode: each ring edge; in a step, the colour of its chunk and dashes that move (Canvas, startAnts).
    { selector: 'edge.ring', style: { width: 3, 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'line-color': t.muted, 'target-arrow-color': t.muted, opacity: 0.5 } },
    { selector: 'edge.ring.ring-on', style: { width: 6, opacity: 1, 'line-color': 'data(color)', 'target-arrow-color': 'data(color)', 'line-style': 'dashed', 'line-dash-pattern': [12, 8] } },
    { selector: 'edge.ring.ring-multi', style: { 'line-color': t.select, 'target-arrow-color': t.select, label: 'data(label)', 'font-size': 18, color: t.fg, 'text-background-color': t.bg, 'text-background-opacity': 1 } },
    { selector: 'edge.ring.degraded', style: { 'line-style': 'dotted' } },
    { selector: 'node.trace-part', style: { 'underlay-color': t.select, 'underlay-padding': 10, 'underlay-opacity': 0 } },
    { selector: 'node.hop-end', style: { 'underlay-opacity': 0.3 } },
    // The simulator: a failed part is red; a part that a failure hits has a dashed red border (no rail colour).
    { selector: 'node.failed', style: { 'background-color': '#C44E52', 'border-color': '#8E1B1F', 'border-width': 4, 'border-style': 'solid' } },
    // White text only for a label inside the node; a tray label (left) and a far device label (top) are outside it.
    { selector: 'node.failed:childless', style: { color: '#ffffff' } },
    { selector: 'node.failed.far, node.failed.tray, node.failed.switch-tray', style: { color: t.fg } },
    { selector: 'edge.failed', style: { 'line-color': '#C44E52', 'line-style': 'dashed', width: 4 } },
    { selector: 'node.hit', style: { 'border-color': '#C44E52', 'border-width': 4, 'border-style': 'dashed' } },
    // A selection does not fade the failures (Cytoscape has no specificity: this rule comes after .faded).
    { selector: '.faded.failed, .faded.hit', style: { opacity: 1 } },
    // The ring of the keyboard: a dashed outline of the text colour, so it reads next to the halo of a selection.
    { selector: 'node.kb-ring', style: { 'border-style': 'dashed', 'border-width': 4, 'border-color': t.fg, 'z-index': 998 } },
    { selector: 'edge.focus', style: { opacity: 1, width: 2.5, 'z-index': 900 } },
    // A selection that focuses the current hop of a trace keeps it thick (this rule comes after edge.focus).
    { selector: 'edge.hop.hop-on.focus', style: { width: 7 } },
    {
      selector: 'node:selected',
      style: {
        opacity: 1,
        'border-color': t.select,
        'border-width': 6,
        'font-weight': 'bold',
        'underlay-color': t.select,
        'underlay-padding': 8,
        'underlay-opacity': 0.35,
        'underlay-shape': 'round-rectangle',
        'z-index': 999,
      },
    },
    {
      selector: 'edge:selected',
      style: {
        opacity: 1,
        'line-color': t.select,
        width: 6,
        'curve-style': 'straight',
        'underlay-color': t.select,
        'underlay-padding': 6,
        'underlay-opacity': 0.3,
        'z-index': 999,
      },
    },
    // The packet of a trace hop (hopMotion.ts): after the fade rules, so a selection or a rail does not fade it;
    // it takes no pointer events (no tap, no hover).
    { selector: 'node.packet', style: { width: 24, height: 24, shape: 'ellipse', 'background-color': t.select, 'border-width': 3, 'border-color': t.bg, label: '', opacity: 1, 'z-index': 999, events: 'no' } },
  ]
}
