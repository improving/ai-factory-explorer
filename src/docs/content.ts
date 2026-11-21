// The documents that the portal carries, from the virtual module that the build makes (content/plugin.ts).

import { DOCS as ALL, BYTES } from 'virtual:docs'
import type { Doc } from '../../content/plugin'
import type { DocGroup } from '../../content/docs'

export type { Doc }

export const DOCS: Doc[] = ALL
export const CONTENT_BYTES: number = BYTES

const BY_ID = new Map(DOCS.map((d) => [d.id, d] as const))

export const docById = (id: string | null): Doc | null => (id === null ? null : BY_ID.get(id) ?? null)

export const docsOfGroup = (group: DocGroup): Doc[] => DOCS.filter((d) => d.group === group)

// True when the document has a heading with this slug: a link to a section that it does not have opens at the top.
export const hasSection = (doc: Doc | null, sec: string | null): boolean =>
  doc !== null && sec !== null && doc.headings.some((h) => h.slug === sec)
