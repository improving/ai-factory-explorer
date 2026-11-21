// The address of a document and a section inside the portal: doc=rb-03&sec=first-5-minutes.
//
// The build (content/rewrite.ts), the reader (ui/Library.tsx), and the reference of a fact (refs.ts) write
// the same shape, so a link that a document makes and a link that the app makes are the same link.

export type Route = { doc: string; sec: string | null }

export const routeHref = (r: Route): string => `#doc=${r.doc}${r.sec === null ? '' : `&sec=${r.sec}`}`

// The route of a link inside the portal, or null for a vendor page and for a plain anchor.
export function routeOfHref(href: string): Route | null {
  if (!href.startsWith('#doc=')) return null
  const q = new URLSearchParams(href.slice(1))
  const doc = q.get('doc')
  return doc === null ? null : { doc, sec: q.get('sec') }
}
