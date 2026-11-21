import { describe, expect, it } from 'vitest'
import { DOCS, type DocEntry } from '../content/docs'
import { resolvePath, rewrite, rewriteTarget } from '../content/rewrite'
import { sectionOfLine } from '../src/docs/section'

// A document of the set, used as the base of a relative link: handbook/concepts.md.
const HB: DocEntry = DOCS.find((d) => d.id === 'hb-concepts')!
const FIXTURE: DocEntry = { id: 'fixture', path: HB.path, title: 'Concepts checklist', group: 'reference' }

describe('rewrite', () => {
  it('drops the YAML front matter and starts at the title', () => {
    const { markdown } = rewrite(FIXTURE, '---\nid: RB-99\ngaps: [G01]\n---\n\n# The old title\n\nBody.\n')
    expect(markdown).toBe('# Concepts checklist\n\nBody.')
  })

  it('drops the role-path block of a handbook page', () => {
    const text = '# Title\n\nBefore.\n\n<!-- paths:start -->\n**Role paths**: L1 Core\n<!-- paths:end -->\n\nAfter.\n'
    expect(rewrite(FIXTURE, text).markdown).toBe('# Concepts checklist\n\nBefore.\n\n\nAfter.')
  })

  it('drops an HTML comment line', () => {
    // The blank line on each side of the comment stays: a run of blank lines renders as one, and the
    // lines of the file keep their number.
    expect(rewrite(FIXTURE, '# Title\n\n<!-- a note -->\n\nBody.\n').markdown).toBe('# Concepts checklist\n\n\nBody.')
  })

  it('takes the title from the set and keeps a later H1 as it is', () => {
    const { markdown } = rewrite(FIXTURE, '# One\n\n# Two\n')
    expect(markdown).toBe('# Concepts checklist\n\n# Two')
  })

  it('keeps a vendor URL', () => {
    const text = '[the guide](https://docs.nvidia.com/fabric-manager-user-guide/index.html)'
    expect(rewrite(FIXTURE, text).markdown).toBe(text)
  })

  it('turns a relative link to a document of the set into a link inside the portal', () => {
    const { markdown } = rewrite(FIXTURE, '[the catalogue](runbook-catalog.md)')
    expect(markdown).toBe('[the catalogue](#doc=hb-runbook-catalogue)')
  })

  it('keeps the anchor of a relative link, as a section', () => {
    const { markdown } = rewrite(FIXTURE, '[first 5](../runbooks/RB-01-nvlink-fabric-fm-imex.md#3-first-5-minutes)')
    expect(markdown).toBe('[first 5](#doc=rb-01&sec=3-first-5-minutes)')
  })

  it('turns an anchor of the same document into a section of it', () => {
    expect(rewrite(FIXTURE, '[below](#the-levels)').markdown).toBe('[below](#doc=fixture&sec=the-levels)')
  })

  it('unwraps a link to a document that the portal does not carry, so that no dead link reaches the reader', () => {
    expect(rewrite(FIXTURE, 'see [the module](../modules/m05-observability-and-slos/README.md)').markdown).toBe('see the module')
  })

  it('leaves a link inside a code fence as it is', () => {
    const text = '```\n[a](b.md)\n```'
    expect(rewrite(FIXTURE, text).markdown).toBe(text)
  })

  it('keeps the line of each heading of the original file', () => {
    const { headings } = rewrite(FIXTURE, '---\nid: x\n---\n\n# Title\n\n## One\n\ntext\n\n## Two\n')
    expect(headings.map((h) => [h.level, h.text, h.slug, h.line])).toEqual([
      [1, 'Concepts checklist', 'concepts-checklist', 5],
      [2, 'One', 'one', 7],
      [2, 'Two', 'two', 11],
    ])
  })

  it('gives a repeated heading a different slug', () => {
    expect(rewrite(FIXTURE, '# T\n\n## Same\n\n## Same\n').headings.map((h) => h.slug)).toEqual(['concepts-checklist', 'same', 'same-2'])
  })

  it('numbers a heading with a dot and a number as the documents already anchor it', () => {
    const { headings } = rewrite(FIXTURE, '# T\n\n## 3. First 5 minutes\n')
    expect(headings[1]?.slug).toBe('3-first-5-minutes')
  })
})

describe('resolvePath', () => {
  it('resolves a name of the same directory', () => {
    expect(resolvePath('handbook/concepts.md', 'runbook-catalog.md')).toBe('handbook/runbook-catalog.md')
  })
  it('resolves a parent', () => {
    expect(resolvePath('handbook/concepts.md', '../runbooks/RB-01-x.md')).toBe('runbooks/RB-01-x.md')
  })
  it('resolves a name of the same directory written with a prefix', () => {
    expect(resolvePath('handbook/concepts.md', './runbook-catalog.md')).toBe('handbook/runbook-catalog.md')
  })
})

describe('rewriteTarget', () => {
  it('returns a vendor page as it is', () => {
    expect(rewriteTarget(FIXTURE, 'mailto:a@b.c')).toBe('mailto:a@b.c')
  })
  it('returns null for a document that the portal does not carry', () => {
    expect(rewriteTarget(FIXTURE, '../plan/role-paths.md#the-levels')).toBeNull()
  })
})

describe('sectionOfLine', () => {
  const headings = [
    { level: 1, text: 'T', slug: 't', line: 1 },
    { level: 2, text: 'One', slug: 'one', line: 10 },
    { level: 2, text: 'Two', slug: 'two', line: 20 },
  ]
  it('gives the last heading at or above the line', () => {
    expect(sectionOfLine(headings, 10)).toBe('one')
    expect(sectionOfLine(headings, 19)).toBe('one')
    expect(sectionOfLine(headings, 20)).toBe('two')
    expect(sectionOfLine(headings, 400)).toBe('two')
  })
  it('gives the first heading for a line above them all', () => {
    expect(sectionOfLine(headings, 0)).toBe('t')
  })
})
