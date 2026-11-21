import { describe, expect, it } from 'vitest'
import { DOCS as VIRTUAL } from 'virtual:docs'
import { DOCS, DOC_GROUPS } from '../content/docs'
import { sectionOfLine } from '../src/docs/section'

// The documents that the build read from the repository.
const CODE = /\b(M|H)[0-9]{1,2}\b/

describe('the content set', () => {
  it('holds the 29 operator documents, and the module and the programme documents are not in it', () => {
    expect(DOCS).toHaveLength(29)
    expect(DOCS.filter((d) => d.path.startsWith('modules/') || d.path.startsWith('plan/'))).toEqual([])
  })

  it('gives each document a unique id and a group that exists', () => {
    expect(new Set(DOCS.map((d) => d.id)).size).toBe(DOCS.length)
    const groups = DOC_GROUPS.map((g) => g.id)
    expect(DOCS.filter((d) => !groups.includes(d.group))).toEqual([])
  })

  it('gives each document a customer title with no course code', () => {
    expect(DOCS.filter((d) => CODE.test(d.title)).map((d) => d.title)).toEqual([])
  })
})

describe('the virtual module', () => {
  it('carries every document of the set, in the same order', () => {
    expect(VIRTUAL.map((d) => d.id)).toEqual(DOCS.map((d) => d.id))
  })

  it('carries the rewritten Markdown of each one, and its headings', () => {
    expect(VIRTUAL.filter((d) => d.markdown === '' || d.headings.length === 0).map((d) => d.id)).toEqual([])
  })
})

describe('a runbook', () => {
  const doc = VIRTUAL.find((d) => d.id === 'rb-01')!

  it('drops the YAML front matter: our ids, our severities, and our gap register', () => {
    expect(doc.markdown).not.toContain('owner_layers')
    expect(doc.markdown).not.toContain('gaps:')
    expect(doc.markdown.startsWith('# NVLink, NVSwitch, Fabric Manager, IMEX, and NVLSM failures')).toBe(true)
  })

  it('keeps the section that the runbook catalogue cites', () => {
    // handbook/runbook-catalog.md: "RB-01: First 5 minutes" points at runbooks/RB-01-….md:49
    expect(sectionOfLine(doc.headings, 49)).toBe('3-first-5-minutes')
  })
})

describe('a handbook page', () => {
  const doc = VIRTUAL.find((d) => d.id === 'hb-onsite-procedures')!

  it('drops the role-path block, and the link to the programme document with it', () => {
    expect(doc.markdown).not.toContain('paths:start')
    expect(doc.markdown).not.toContain('Role paths')
    expect(doc.markdown).not.toContain('plan/role-paths.md')
  })

  it('turns a link to a document of the set into a link inside the portal', () => {
    expect(doc.markdown).toContain('](#doc=hb-runbook-catalogue)')
  })
})

describe('the links of the set', () => {
  // A relative link that the portal cannot carry is unwrapped to its text, so a reader never meets a dead link.
  it('keeps only a link inside the portal and a vendor page', () => {
    const bad: string[] = []
    for (const d of VIRTUAL) {
      for (const m of d.markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1]!
        if (target.startsWith('#doc=') || /^(https?:|mailto:)/.test(target)) continue
        bad.push(`${d.id}: ${target}`)
      }
    }
    expect(bad.slice(0, 10)).toEqual([])
  })

  it('carries no repository URL', () => {
    const bad = VIRTUAL.filter((d) => /github\.com\/(infracloudio|improving)\//.test(d.markdown)).map((d) => d.id)
    expect(bad).toEqual([])
  })

  // A training document is still named in the text of a few documents, as plain words and in a code span.
  // The vocabulary rewrite drops the course codes, and the link rewrite drops the link.
  it('leaves no link to a programme document, and the words stay for milestone 24', () => {
    const links = VIRTUAL.filter((d) => /\]\([^)]*plan\//.test(d.markdown)).map((d) => d.id)
    expect(links).toEqual([])
    // The three labs name `plan/learning-hardware.md` in a code span.
    expect(VIRTUAL.filter((d) => d.markdown.includes('plan/')).map((d) => d.id)).toEqual(['lab-troubleshooting', 'lab-infiniband', 'lab-ibsim'])
  })
})
