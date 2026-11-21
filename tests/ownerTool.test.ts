import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config/config'
import { ownerToolRows } from '../src/ui/ownerTool'

const rows = (id: string, kind: Parameters<typeof ownerToolRows>[1]['kind']) => ownerToolRows(DEFAULT_CONFIG, { id, kind })
const value = (r: ReturnType<typeof rows>, label: string) => r.find((x) => x.label === label)?.fact

describe('ownerToolRows', () => {
  it('gives a leaf its owner, its OEM escalation, and the InfiniBand tool row', () => {
    const r = rows('su1-leaf-r0', 'leaf')
    expect(value(r, 'Owner')?.value).toMatch(/partner/)
    expect(value(r, 'Escalation')?.value).toMatch(/OEM/)
    expect(value(r, 'InfiniBand: seen in')?.value).toBe('UFM and switch telemetry')
    expect(value(r, 'InfiniBand: operated by')).toMatchObject({ value: 'L2 reads; L3 changes routing, partitions, firmware' })
    expect(value(r, 'L1')?.value).toMatch(/read-only/)
  })
  it('gives a block its role: DNS goes to the enterprise network, with no escalation', () => {
    const r = rows('blk-dns', 'block')
    expect(value(r, 'Owner')?.value).toMatch(/enterprise network/)
    expect(value(r, 'Escalation')).toBeUndefined()
    expect(value(r, 'Edge and enterprise services: operated by')?.value).toMatch(/enterprise network/)
  })
  it('gives a rack its role: the CDU goes to the facility team', () => {
    expect(value(ownerToolRows({ ...DEFAULT_CONFIG, cooling: 'liquid' }, { id: 'su1-cdu', kind: 'rack' }), 'Owner')?.value).toMatch(/facility/)
  })
})
