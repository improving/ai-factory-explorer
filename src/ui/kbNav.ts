import type cytoscape from 'cytoscape'

// One part of the current view that the keyboard can reach: a node, with its label and its kind.
export type KbPart = { id: string; label: string; kind: string }

// The parts of a view, in the order of the drawing (the order that the view writes them): the nodes only, because
// a cable is read from its ends.
export function partsOf(elements: cytoscape.ElementDefinition[]): KbPart[] {
  return elements
    .filter((e) => e.group !== 'edges' && e.data.id)
    .map((e) => ({ id: String(e.data.id), label: String(e.data.label ?? e.data.id), kind: String(e.data.kind ?? 'part') }))
}

// The part that a Tab or a Shift+Tab reaches, or -1 when the ring leaves the canvas: the ends of the list.
export function nextIndex(index: number, count: number, delta: number): number {
  if (count <= 0) return -1
  const from = index < 0 ? (delta > 0 ? -1 : count) : index
  const next = from + delta
  return next < 0 || next >= count ? -1 : next
}

// What a screen reader reads for the ringed part: the canvas has no element for a part, so the line carries it.
export const announceOf = (part: KbPart, index: number, count: number): string => `${part.label}, a ${part.kind}, ${index + 1} of ${count}`
