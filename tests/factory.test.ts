import { describe, expect, it } from 'vitest'
import { BLOCK_DOCS } from '../src/catalog/component-docs'
import { BLOCK_FACTS, BLOCK_ROLES } from '../src/catalog/factory'
import { SN2201, SN4700, SWITCHES } from '../src/catalog/switches'
import { collect, factProblem, sourceProblem } from './support/sources'

describe('the factory catalog', () => {
  it('has docs and fact rows for every block role', () => {
    expect(BLOCK_ROLES).toHaveLength(35)
    for (const role of BLOCK_ROLES) {
      expect(BLOCK_DOCS[role].summary.length, role).toBeGreaterThan(10)
      expect(Array.isArray(BLOCK_FACTS[role]), role).toBe(true)
    }
  })
  it('sources every fact and reference', () => {
    const { facts, sources } = collect({ BLOCK_FACTS, BLOCK_DOCS, SWITCHES })
    for (const [path, f] of facts) expect(factProblem(f), path).toBeNull()
    for (const [path, s] of sources) expect(sourceProblem(s), path).toBeNull()
  })
  it('shows the SN4700 throughput conflict and the VAST CBox conflict', () => {
    expect(SN4700.throughput.value).toBe(12.8)
    expect(SN4700.throughput.note).toMatch(/25\.6/)
    const cbox = BLOCK_FACTS.vast.find((r) => r.label === 'CNodes in each CBox')!.fact
    expect(cbox.value).toBe(4)
    expect(cbox.note).toMatch(/single-server/)
  })
  it('does not invent what the sources do not give', () => {
    expect(SN2201.typicalPower.status).toBe('not-sourced')
    for (const role of ['ups', 'generator', 'pdu', 'cdu'] as const) {
      expect(BLOCK_FACTS[role].some((r) => r.fact.status === 'not-sourced'), role).toBe(true)
    }
  })
})

describe('the commands of the blocks', () => {
  it('gives no NTP command to the DNS block', () => {
    expect(BLOCK_DOCS.dns.commands.map((c) => c.label).join(' ')).not.toMatch(/chronyc/)
    expect(BLOCK_DOCS.ntp.commands.map((c) => c.label).join(' ')).toMatch(/chronyc/)
  })
})
