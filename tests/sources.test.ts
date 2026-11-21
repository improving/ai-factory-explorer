import { describe, expect, it } from 'vitest'
import { assumed, confirmed, derived, formatFact, notSourced, type Fact } from '../src/catalog/fact'
import { collect, factProblem, sourceProblem } from './support/sources'

describe('sourceProblem', () => {
  it('accepts a vendor URL', () => {
    expect(sourceProblem('https://docs.nvidia.com/a.html')).toBeNull()
  })
  it('accepts a repository file, a line, and a line range', () => {
    expect(sourceProblem('handbook/hardware-matrix.md')).toBeNull()
    expect(sourceProblem('handbook/hardware-matrix.md:21')).toBeNull()
    expect(sourceProblem('handson/profiles/b300.yaml:305-319')).toBeNull()
  })
  it('refuses a line after the end of the file', () => {
    expect(sourceProblem('handbook/hardware-matrix.md:9999')).toMatch(/has \d+ lines/)
  })
  it('refuses a file that does not exist', () => {
    expect(sourceProblem('handbook/no-such-file.md')).toMatch(/no such file/)
  })
  it('refuses text that is not a source', () => {
    expect(sourceProblem('the NVIDIA page')).toMatch(/bad source format/)
  })
})

describe('factProblem', () => {
  it('needs a source for a confirmed fact', () => {
    const f = { value: 1, status: 'confirmed' } as Fact<number>
    expect(factProblem(f)).toMatch(/no source/)
  })
  it('needs a formula for a derived fact', () => {
    const f = { value: 1, status: 'derived' } as Fact<number>
    expect(factProblem(f)).toMatch(/no formula/)
  })
  it('needs a note for an assumed fact', () => {
    const f = { value: 1, status: 'assumed' } as Fact<number>
    expect(factProblem(f)).toMatch(/no note/)
  })
  it('accepts the helpers', () => {
    expect(factProblem(confirmed(8, 'GPUs', 'handbook/hardware-matrix.md:22'))).toBeNull()
    expect(factProblem(derived(72, 'ports', '576 ÷ 8'))).toBeNull()
    expect(factProblem(assumed(1, undefined, 'for the picture only'))).toBeNull()
    expect(factProblem(notSourced('not in the repository'))).toBeNull()
  })
})

describe('collect', () => {
  it('finds nested facts and plain sources', () => {
    const tree = { a: { b: confirmed(1, undefined, 'handbook/hardware-matrix.md') }, c: [{ label: 'x', source: 'handbook/hardware-matrix.md:1' }] }
    const out = collect(tree)
    expect(out.facts.map(([p]) => p)).toEqual(['$.a.b'])
    expect(out.sources).toEqual([['$.c[0]', 'handbook/hardware-matrix.md:1']])
  })
})

describe('formatFact', () => {
  it('shows the value and the unit', () => {
    expect(formatFact(confirmed(800, 'Gb/s', 'handbook/hardware-matrix.md:21'))).toBe('800 Gb/s')
  })
  it('shows "not sourced" for a missing value', () => {
    expect(formatFact(notSourced('x'))).toBe('not sourced')
  })
})
