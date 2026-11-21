import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { docRoute, hrefOf, vendorUrl } from '../src/refs'
import { routeHref, routeOfHref } from '../src/docs/route'

const SRC = fileURLToPath(new URL('../src/', import.meta.url))

describe('vendorUrl', () => {
  it('keeps a vendor page, which is the only reference that leaves the portal', () => {
    expect(vendorUrl('https://docs.nvidia.com/x.html')).toBe('https://docs.nvidia.com/x.html')
  })
  it('gives null for a repository path', () => {
    expect(vendorUrl('handbook/runbook-catalog.md:73')).toBeNull()
  })
})

describe('docRoute', () => {
  it('gives the document and the section of the cited line', () => {
    // handbook/runbook-catalog.md:65 is the row "RB-01", and the catalogue has a heading above it.
    const route = docRoute('runbooks/RB-01-nvlink-fabric-fm-imex.md:49')
    expect(route).toEqual({ doc: 'rb-01', sec: '3-first-5-minutes' })
  })

  it('gives the top of the document for a source with no line', () => {
    expect(docRoute('runbooks/RB-01-nvlink-fabric-fm-imex.md')).toEqual({ doc: 'rb-01', sec: null })
  })

  it('takes the first line of a range', () => {
    expect(docRoute('handbook/command-reference.md:10-14')).toEqual(docRoute('handbook/command-reference.md:10'))
  })

  it('gives the first section for a line above them all', () => {
    expect(docRoute('runbooks/RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md:1')?.sec).toBe('gpu-ecc-xid-thermal-power-and-row-remap')
  })

  it('gives null for a document that the portal does not carry', () => {
    expect(docRoute('modules/m05-observability-and-slos/README.md:25')).toBeNull()
    expect(docRoute('plan/requirements-map.md')).toBeNull()
  })
})

describe('the route of a link inside the portal', () => {
  it('writes the document and the section', () => {
    expect(routeHref({ doc: 'rb-03', sec: '3-first-5-minutes' })).toBe('#doc=rb-03&sec=3-first-5-minutes')
    expect(routeHref({ doc: 'rb-03', sec: null })).toBe('#doc=rb-03')
  })
  it('reads it back', () => {
    expect(routeOfHref('#doc=rb-03&sec=3-first-5-minutes')).toEqual({ doc: 'rb-03', sec: '3-first-5-minutes' })
    expect(routeOfHref('#doc=rb-03')).toEqual({ doc: 'rb-03', sec: null })
  })
  it('gives null for a vendor page and for a plain anchor', () => {
    expect(routeOfHref('https://docs.nvidia.com/x.html')).toBeNull()
    expect(routeOfHref('#canvas')).toBeNull()
  })
  it('is the href of a reference', () => {
    expect(hrefOf(docRoute('runbooks/RB-01-nvlink-fabric-fm-imex.md:49')!)).toBe('#doc=rb-01&sec=3-first-5-minutes')
  })
})

describe('no link leaves the portal', () => {
  // The guard of the milestone: a panel cannot reach the repository again, and a tab opens only for a vendor
  // page. Milestone 24 adds the lint of the words.
  it('names no repository URL, and opens a tab only in the SourceRef', async () => {
    const files = readdirSync(SRC, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile() && /\.tsx?$/.test(d.name))
      .map((d) => join(d.parentPath, d.name))
    const bad: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      const name = relative(SRC, file)
      if (/github\.com\/(infracloudio|improving)\//.test(text)) bad.push(`${name}: a repository URL`)
      if (text.includes('target="_blank"') && name !== join('ui', 'SourceRef.tsx')) bad.push(`${name}: a tab`)
    }
    expect(bad).toEqual([])
  })

  // The artifact is public: a citation of a training document would name files that are not in this
  // repository, even when the panel does not show the path.
  it('quotes no internal path, and names the requirements of the site without one', () => {
    const files = readdirSync(SRC, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile() && /\.tsx?$/.test(d.name))
      .map((d) => join(d.parentPath, d.name))
    const INTERNAL = /['"`](plan|modules|sources|books|maps|docs\/superpowers)\//
    const bad = files
      .filter((file) => INTERNAL.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file))
    expect(bad).toEqual([])
  })
})
