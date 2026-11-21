import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FACTORY_CHECKS, HOP_CHECKS } from '../src/catalog/paths'
import { PART_RUNBOOKS, RUNBOOKS, hopRunbook, rowOf, runbookOfRow, writtenFor } from '../src/catalog/runbooks'
import { DEFAULT_CONFIG } from '../src/config/config'
import { traceFactory, type PathId } from '../src/routing/factory'
import { REPO_ROOT } from './support/sources'

const lines = (path: string) => readFileSync(resolve(REPO_ROOT, path), 'utf8').split('\n')
const lineOf = (source: string) => {
  const [path, n] = source.split(':') as [string, string]
  return lines(path)[Number(n) - 1]!
}
const row = (id: string) => ({ label: `${id}: a row`, source: 'handbook/runbook-catalog.md:1' })

describe('the written runbooks', () => {
  it('has the twelve runbooks of runbooks/', () => {
    expect(RUNBOOKS.map((r) => r.id)).toEqual(['RB-01', 'RB-02', 'RB-03', 'RB-04', 'RB-05', 'RB-06', 'RB-07', 'RB-08', 'RB-09', 'RB-10', 'RB-11', 'RB-12'])
  })

  it('covers the rows that the table "Written runbooks" of the catalogue gives', () => {
    const table = lines('handbook/runbook-catalog.md').filter((l) => /^\| \[RB-\d\d\]/.test(l))
    expect(table).toHaveLength(12)
    for (const l of table) {
      const id = /\[(RB-\d\d)\]/.exec(l)![1]
      // The rows before ';' are covered; the text after ';' names a part of a row ("the PSU and DPS policy part of F2").
      const rows = (l.split('|')[2]!.split(';')[0]!.match(/\b[A-Z]\d+\b/g) ?? []).sort()
      expect([...RUNBOOKS.find((r) => r.id === id)!.rows].sort(), id).toEqual(rows)
    }
  })

  it('cites the title, section 3, and the coverage row of each runbook', () => {
    for (const r of RUNBOOKS) {
      expect(lineOf(r.top.source), r.id).toMatch(new RegExp(`^# ${r.id} `))
      expect(lineOf(r.first5.source), r.id).toBe('## 3. First 5 minutes')
      expect(lineOf(r.coverage), r.id).toContain(`[${r.id}]`)
    }
  })

  it('cites the line that gives the reason for each part runbook', () => {
    expect(lineOf(PART_RUNBOOKS.dpu!.why.source!)).toContain('candidate new row')
    expect(lineOf(PART_RUNBOOKS.gpu!.why.source!)).toContain('stop-and-confirm')
  })

  it('finds the row of a catalogue reference, and nothing for another reference', () => {
    expect(rowOf({ label: 'G1: GPU fell off the bus (Xid 79)', source: 'handbook/runbook-catalog.md:79' })).toBe('G1')
    expect(rowOf({ label: 'nvidia-smi', source: 'handbook/command-reference.md:21' })).toBeNull()
  })

  it('gives each written runbook once, in the order of the rows, then the extra ones', () => {
    expect(writtenFor([row('G1'), row('G2'), row('G6'), row('G8')]).map((r) => r.id)).toEqual(['RB-03'])
    expect(writtenFor([row('G1'), row('N7')], ['RB-09', 'RB-03']).map((r) => r.id)).toEqual(['RB-03', 'RB-04', 'RB-09'])
  })

  it('gives no runbook for a row that no runbook covers', () => {
    expect(runbookOfRow('L9')).toBeNull()
    expect(runbookOfRow('F2')).toBeNull() // RB-08 and RB-10 each cover only a part of F2 (the PSU and DPS policy part; the PDU and power shelf part)
    expect(writtenFor([row('R7')])).toEqual([])
    expect(writtenFor([row('F1'), row('F3')]).map((r) => r.id)).toEqual(['RB-10'])
  })

  it('attaches RB-06 to the DPU and RB-09 to the GPU and the services, as assumed', () => {
    expect(PART_RUNBOOKS.dpu?.ids).toEqual(['RB-06'])
    expect(PART_RUNBOOKS.gpu?.ids).toEqual(['RB-09'])
    expect(PART_RUNBOOKS.service?.ids).toEqual(['RB-09'])
    for (const p of Object.values(PART_RUNBOOKS)) expect(p!.why.status).toBe('assumed')
  })

  it('gives a hop the runbook of the row in its checks first', () => {
    expect(hopRunbook({ link: 'ethernet', network: 'oob', checks: FACTORY_CHECKS.bmc })?.id).toBe('RB-05') // G9
    expect(hopRunbook({ link: 'nvmeof', network: 'storage', checks: HOP_CHECKS.nvmeof })?.id).toBe('RB-07') // V2
    expect(hopRunbook({ link: 'ip', network: 'in-band', checks: FACTORY_CHECKS.vip })?.id).toBe('RB-08') // P7
    expect(hopRunbook({ link: 'software', network: 'nvlink', checks: FACTORY_CHECKS.fm })?.id).toBe('RB-01') // G7
  })

  it('gives a data-plane hop with no row the runbook of its network', () => {
    expect(hopRunbook({ link: 'nvlink', network: 'nvlink', checks: HOP_CHECKS.nvlink })?.id).toBe('RB-01') // G3
    expect(hopRunbook({ link: 'pcie', network: 'pcie', checks: HOP_CHECKS.pcie })?.id).toBe('RB-02') // N5: GPUDirect RDMA
    expect(hopRunbook({ link: 'infiniband', network: 'compute', checks: HOP_CHECKS.infiniband })?.id).toBe('RB-04') // N2
    expect(hopRunbook({ link: 'ethernet', network: 'storage', checks: [...HOP_CHECKS.ethernet, ...FACTORY_CHECKS.roceLeaf] })?.id).toBe('RB-07') // V1
  })

  it('gives no runbook to a hop that no row names (telemetry, access, C2C)', () => {
    expect(hopRunbook({ link: 'software', network: 'telemetry', checks: FACTORY_CHECKS.alerts })).toBeNull()
    expect(hopRunbook({ link: 'ip', network: 'management', checks: FACTORY_CHECKS.access })).toBeNull()
    expect(hopRunbook({ link: 'c2c', network: 'c2c', checks: HOP_CHECKS.c2c })).toBeNull()
  })

  it('gives no NVLink or scheduling runbook to a hop of the telemetry and access paths', () => {
    const wrong = (path: PathId) => {
      const r = traceFactory(DEFAULT_CONFIG, path, 'su1-n05/gpu2')
      if (!r.ok) throw new Error(r.reason)
      return r.trace.hops.filter((h) => ['RB-01', 'RB-08'].includes(hopRunbook(h)?.id ?? '')).map((h) => `${h.from.label} → ${h.to.label}`)
    }
    for (const path of ['telemetry-itsm', 'telemetry-siem', 'operator-bmc', 'break-glass'] as const) expect(wrong(path), path).toEqual([])
  })
})
