import type { ReactNode } from 'react'
import { SITE_REQUIREMENTS } from '../catalog/fact'
import { docRoute, vendorUrl } from '../refs'
import { Read } from './Read'

// Where a value comes from, when the portal cannot open the document that gives it. The requirements of the
// site are the customer's own input: the portal names them, and it does not link a document that it does not
// carry.
const ORIGIN_OF = (source: string): string =>
  source === SITE_REQUIREMENTS ? 'From the site requirements.' : 'Not in this portal.'

// One reference of a panel, in the only three shapes that the app has:
//
// - a vendor page is a link, and it opens a tab (the one reference that leaves the portal);
// - a document of the set is a Read, and it opens the reader at the section of the cited line;
// - a source that the portal does not carry is plain text, with the tooltip that says so.
//
// Every panel uses this component, so a new panel cannot add a link to the repository by accident.
export function SourceRef({
  source,
  children,
  className,
  title,
  name,
}: {
  source: string
  children: ReactNode
  className?: string
  title?: string
  name?: string
}) {
  const url = vendorUrl(source)
  if (url !== null) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={className} title={title}>
        {children}
      </a>
    )
  }
  const route = docRoute(source)
  if (route === null) {
    // A source that the portal does not carry: muted, so that it does not read as a link that is missing, and
    // the tooltip says where the value comes from.
    return (
      <span className={`unavailable${className === undefined ? '' : ` ${className}`}`} title={`${title ?? ''} ${ORIGIN_OF(source)}`.trim()}>
        {children}
      </span>
    )
  }
  return (
    <Read doc={route.doc} sec={route.sec} className={className} title={title} name={name}>
      {children}
    </Read>
  )
}
