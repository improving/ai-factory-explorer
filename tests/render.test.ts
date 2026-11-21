import { describe, expect, it } from 'vitest'
import { DOCS } from 'virtual:docs'
import { renderMarkdown, sectionsOf } from '../src/docs/render'
import { slugify } from '../src/docs/slug'

const H = [{ level: 1, text: 'T', slug: 't', line: 1 }]

describe('renderMarkdown', () => {
  it('sets the id of a heading to the slug that the build made, in the order of the document', () => {
    const headings = [
      { level: 1, text: 'Title', slug: 'title', line: 1 },
      { level: 2, text: '3. First 5 minutes', slug: '3-first-5-minutes', line: 3 },
    ]
    const html = renderMarkdown('# Title\n\n## 3. First 5 minutes\n', headings)
    expect(html).toContain('<h1 id="title">Title</h1>')
    expect(html).toContain('<h2 id="3-first-5-minutes">3. First 5 minutes</h2>')
  })

  it('escapes raw HTML, so that a placeholder in the text stays text', () => {
    expect(renderMarkdown('kubectl describe node <node>', H)).toContain('&lt;node&gt;')
  })

  it('renders a table, which most of the documents have', () => {
    const html = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |', H)
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
  })

  it('renders a code fence with its language', () => {
    const html = renderMarkdown('```bash\nibstat\n```', H)
    expect(html).toContain('<pre><code class="language-bash">')
  })

  it('keeps a link inside the portal as a link', () => {
    expect(renderMarkdown('[the catalogue](#doc=hb-runbook-catalogue)', H)).toContain('href="#doc=hb-runbook-catalogue"')
  })
})

describe('the headings of the set', () => {
  // A heading that the renderer makes and the build did not index would take the id of the next one,
  // and the table of contents would point at the wrong place. The count pins the two together.
  it('renders as many headings as the build indexed, for each document of the set', () => {
    const wrong = DOCS.filter((d) => (renderMarkdown(d.markdown, d.headings).match(/<h[1-6][ >]/g) ?? []).length !== d.headings.length)
    expect(wrong.map((d) => d.id)).toEqual([])
  })

  it('gives the table of contents the second and third levels', () => {
    const doc = DOCS.find((d) => d.id === 'rb-03')!
    const secs = sectionsOf(doc.headings)
    expect(secs.length).toBeGreaterThan(3)
    expect(secs.filter((h) => h.level === 2).length).toBeGreaterThan(0)
    expect(secs.every((h) => h.level === 2 || h.level === 3)).toBe(true)
  })
})

describe('slugify', () => {
  it('takes the shape of the anchors of the documents', () => {
    expect(slugify('3. First 5 minutes')).toBe('3-first-5-minutes')
    expect(slugify('GPU ECC / Xid / thermal')).toBe('gpu-ecc-xid-thermal')
  })
  it('strips the tag of the rendered HTML, so that a code span in a heading agrees with the build', () => {
    expect(slugify('<code>dcgmi</code> discovery')).toBe('dcgmi-discovery')
  })
  it('gives a heading with no letter a name', () => {
    expect(slugify('---')).toBe('section')
  })
})
