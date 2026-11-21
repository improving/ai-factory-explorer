import { describe, expect, it } from 'vitest'
import { DESIGNS } from '../src/catalog/designs'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { generateFabric } from '../src/topology/fabric'
import { computeNumbers } from '../src/topology/numbers'

const numbersOf = (patch: Partial<Config>) => {
  const config = withPatch(DEFAULT_CONFIG, patch)!
  return computeNumbers(generateFabric(config), config)
}
const CASES = DESIGNS.flatMap((d) => d.rows.map((r) => ({ id: d.id, su: r.su, d })))

describe('computeNumbers', () => {
  it.each(CASES)('$id at $su SU equals the RA row', ({ d, su }) => {
    const n = numbersOf({ platform: d.platforms[0]!, build: d.builds?.[0] ?? 'dgx', fabric: d.fabric, design: d.id, planes: d.planes, suCount: su })
    for (const c of n.checks) expect(c.app, c.label).toBe(c.ra)
    expect(n.matchesRa).toBe(d.leafRule.kind === 'none' ? null : true)
  })

  it('gives 576 GPUs and 230.4 Tb/s bisection for 1 SU of B300 XDR', () => {
    const n = numbersOf({})
    expect(n.gpus).toBe(576)
    expect(n.bisection?.value).toBeCloseTo(230.4)
    expect(n.bisection?.status).toBe('derived')
    expect(n.notes).toEqual([])
  })

  it('explains the GPU count of the 18 SU row', () => {
    const n = numbersOf({ suCount: 18 })
    expect(n.gpus).toBe(10368)
    expect(n.notes.join(' ')).toMatch(/9216/)
  })

  it('counts both planes of Spectrum-X', () => {
    const n = numbersOf({ fabric: 'spectrum-x' })
    expect(n.nodeLeafCables).toBe(4096)
    expect(n.bisection?.value).toBeCloseTo(819.2)
  })

  it('counts GPUs from the trays of an NVL72', () => {
    expect(numbersOf({ platform: 'gb300-nvl72' }).gpus).toBe(1152)
    const rack = numbersOf({ platform: 'gb200-nvl72' })
    expect(rack.gpus).toBe(72)
    expect(rack.bisection).toBeNull()
  })

  it('names top-of-rack as an illustration', () => {
    expect(numbersOf({ topology: 'tor' }).notes.join(' ')).toMatch(/illustration/)
  })
})

describe('the bisection basis', () => {
  it('is assumed when the RA gives no leaf-spine count', () => {
    expect(numbersOf({ platform: 'gb300-nvl72' }).bisection?.status).toBe('assumed')
    expect(numbersOf({}).bisection?.status).toBe('derived')
  })
})
describe('the last SU fill and the spares', () => {
  it('leaves the empty slots of the last SU out, and the RA check still passes', () => {
    const n = numbersOf({ lastSuEmpty: 36 })
    expect(n.servers).toBe(36)
    expect(n.nodeLeafCables).toBe(288)
    expect(n.emptySlots).toBe(36)
    expect(n.matchesRa).toBe(true)
    expect(n.notes.join(' ')).toMatch(/36 empty slots/)
  })
  it('fills only the last SU', () => {
    expect(numbersOf({ suCount: 2, lastSuEmpty: 36 }).servers).toBe(108)
  })
  it('does not count the reserved B200 slot twice', () => {
    const n = numbersOf({ platform: 'b200', lastSuEmpty: 4 })
    expect(n.servers).toBe(28)
    expect(n.emptySlots).toBe(3)
    expect(n.matchesRa).toBe(true)
  })
  it('gives no GPU note when only the empty slots make the difference', () => {
    expect(numbersOf({ lastSuEmpty: 36 }).notes.join(' ')).not.toMatch(/GPUs/)
  })
  it('counts the spares apart from the fabric', () => {
    const n = numbersOf({ spares: 4 })
    expect(n.spares).toBe(4)
    expect(n.servers).toBe(72)
  })
})
