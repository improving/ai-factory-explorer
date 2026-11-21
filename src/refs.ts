// A reference of the app: a vendor page, or a document of the portal.
//
// The app cited 26 repository files, and every citation was a link to GitHub. A reference is now a route:
// `docRoute` gives the document of the set that holds the cited line, and the section of that line, so the
// reader opens on the right heading of the right document. A source that the portal does not carry is not a
// link at all, and the panel says so.

import { DOCS } from './docs/content'
import { sectionOfLine } from './docs/section'
import { routeHref, type Route } from './docs/route'

const BY_PATH = new Map(DOCS.map((d) => [d.path, d] as const))

// A vendor page: the only reference that leaves the portal.
export const vendorUrl = (source: string): string | null => (/^https?:\/\//.test(source) ? source : null)

// The document and the section of a repository source, or null when the portal does not carry the file.
export function docRoute(source: string): Route | null {
  const [path, lines] = source.split(':')
  const doc = BY_PATH.get(path!)
  if (!doc) return null
  if (lines === undefined) return { doc: doc.id, sec: null }
  const line = Number(lines.split('-')[0])
  return { doc: doc.id, sec: Number.isFinite(line) ? sectionOfLine(doc.headings, line) : null }
}

// True when the portal can open the source: a vendor page, or a document of the set.
export const hasRef = (source: string): boolean => vendorUrl(source) !== null || docRoute(source) !== null

// The href of a route: the same shape that a link inside a document has.
export const hrefOf = (route: Route): string => routeHref(route)
