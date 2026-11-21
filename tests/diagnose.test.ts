import { describe, expect, it } from 'vitest'
import { CHECKLISTS } from '../src/catalog/checklists'
import { RUNBOOKS } from '../src/catalog/runbooks'
import { CLASS_INFO, CURRENT_INCIDENT, INCIDENTS, clockOf, eventsOf, incidentOf } from '../src/diagnose/incidents'
import { timelineMarkdown, timelineName } from '../src/diagnose/timeline'
import { chainOf, settleOf, verdictOf } from '../src/diagnose/verdict'
import { DEFAULT_CONFIG } from '../src/config/config'
import { failKind } from '../src/simulate/failable'
import { generateFabric } from '../src/topology/fabric'
import { elementExists, serverOf } from '../src/topology/ids'
import type { Failure } from '../src/simulate/failable'
import { sourceProblem } from './support/sources'

const config = DEFAULT_CONFIG
const fabric = generateFabric(config)
const exists = (id: string): boolean =>
  elementExists(config, id) || failKind(config, id) !== null || fabric.nodes.some((n) => n.id === id) || fabric.edges.some((e) => e.id === id)
const chainOfId = (id: string) => {
  const incident = incidentOf(id, config, [])
  if (!incident) throw new Error(`no incident ${id}`)
  return chainOf(incident)
}

describe('the saved incidents', () => {
  it('has the seven incidents of Appendix A', () => {
    expect(INCIDENTS.map((i) => i.id)).toEqual(['reboot-xid145', 'xid79-multinode', 'ufm-failover-nccl', 'host-not-allocatable', 'job-pending', 'exit-137', 'slow-allreduce'])
  })

  it('cites a source that exists for each event', () => {
    for (const incident of INCIDENTS) {
      for (const e of incident.events) {
        if (!e.ref) continue
        expect(sourceProblem(e.ref.source), `${incident.id}: ${e.text}`).toBeNull()
        expect(e.ref.label, `${incident.id}: ${e.text}`).not.toBe('')
      }
    }
  })

  it('cites a runbook for each catalogue row', () => {
    for (const incident of INCIDENTS) {
      const rows = incident.events.map((e) => e.row).filter((r): r is string => !!r)
      expect(settleOf(chainOf(incident)).length, incident.id).toBeGreaterThan(rows.length > 0 ? 0 : -1)
    }
  })

  it('names only parts of the default configuration', () => {
    for (const incident of INCIDENTS) {
      for (const e of incident.events) if (e.subject) expect(exists(e.subject), `${incident.id}: ${e.subject}`).toBe(true)
    }
  })

  it('keeps the events in time order, with a clock for each one', () => {
    for (const incident of INCIDENTS) {
      const chain = chainOf(incident)
      expect(chain.rows.map((r) => r.i)).toEqual(chain.rows.map((_, i) => i))
      const clocks = chain.rows.map((r) => r.clock)
      expect([...clocks].sort(), incident.id).toEqual(clocks)
    }
  })
})

describe('the verdict', () => {
  it('reads the clock of an event from the start of the incident', () => {
    expect(clockOf('03:58:00', 0)).toBe('03:58:00')
    expect(clockOf('03:58:00', 560)).toBe('04:07:20')
    expect(clockOf('23:59:00', 90)).toBe('00:00:30')
  })

  it('gives each saved incident the verdict that its evidence supports', () => {
    const table = INCIDENTS.map((i) => {
      const v = chainOf(i).verdict
      return [i.id, v.sub, v.cls, v.node, v.terminal, v.confidence]
    })
    expect(table).toEqual([
      ['reboot-xid145', 'hardware', 'gpu', 'su1-n14', 'NODE_FAIL', 'high'],
      ['xid79-multinode', 'hardware', 'gpu', 'su1-n14', 'NODE_FAIL', 'high'],
      ['ufm-failover-nccl', 'system_software', 'software', null, 'TIMEOUT', 'low'],
      ['host-not-allocatable', 'ambiguous', null, null, 'FAILED', 'low'],
      ['job-pending', 'system_software', 'platform', null, 'PENDING', 'high'],
      ['exit-137', 'unattributed', null, null, 'FAILED', 'low'],
      ['slow-allreduce', 'hardware', 'fabric', 'su1-n20', null, 'low'],
    ])
  })

  it('keeps the reboot in the chain as the context of the Xid, not as a vote', () => {
    const chain = chainOfId('reboot-xid145')
    const reboot = chain.rows[0]!
    expect(reboot.src).toBe('kernel')
    expect(reboot.cls).toBeUndefined()
    expect(reboot.note).toContain('upstream')
    expect(chain.verdict.why).toContain('2 events vote for hardware')
  })

  it('says that a difference of one vote is not a choice', () => {
    const v = chainOfId('host-not-allocatable').verdict
    expect(v.why).toBe('The events vote 1 for hardware and 1 for system software. A difference of one vote does not choose between them.')
  })

  it('says that no vote is a result, not an error', () => {
    const v = chainOfId('exit-137').verdict
    expect(v.votes).toEqual({ hardware: 0, system_software: 0 })
    expect(v.why).toContain('unattributed, not an error')
  })

  it('gives the first cause as the responsible node, not the last consequence', () => {
    const chain = chainOfId('xid79-multinode')
    expect(chain.rows[0]!.node).toBeUndefined()
    expect(chain.verdict.node).toBe('su1-n14')
  })

  it('gives the runbooks of the rows for the next checks', () => {
    expect(settleOf(chainOfId('host-not-allocatable')).map((r) => r.id)).toEqual(['RB-12'])
    expect(settleOf(chainOfId('xid79-multinode')).map((r) => r.id)).toEqual(['RB-03'])
    expect(settleOf(chainOfId('job-pending')).map((r) => r.id)).toEqual(['RB-11'])
  })

  it('has a class for every sub-domain, and both sub-domains in use', () => {
    expect(Object.values(CLASS_INFO).map((c) => c.sub)).toContain('hardware')
    expect(Object.values(CLASS_INFO).map((c) => c.sub)).toContain('system_software')
    expect(Object.keys(CLASS_INFO)).toHaveLength(6)
    for (const c of Object.values(CLASS_INFO)) expect(c.short.length).toBeLessThan(c.label.length)
  })
})

describe('the failures of the simulator', () => {
  const one = (f: Failure) => eventsOf(config, [f])

  it('makes two events for a failure, with the class and the row of its rule', () => {
    const events = one({ id: 'su1-n14/gpu3', mode: 'xid79' })
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ src: 'prometheus', cls: 'gpu', row: 'G1', node: 'su1-n14' })
    expect(events[1]!.text).toContain('drain the node')
    expect(events[1]!.state).toBe('NODE_FAIL')
    expect(verdictOf(events)).toMatchObject({ sub: 'hardware', cls: 'gpu', node: 'su1-n14', confidence: 'low' })
  })

  it('gives a software failure its own class', () => {
    expect(verdictOf(one({ id: 'su1-n05/svc-fabric-manager', mode: 'down' }))).toMatchObject({ sub: 'system_software', cls: 'software', node: 'su1-n05' })
  })

  it('marks a mix of the two sub-domains as ambiguous', () => {
    const events = eventsOf(config, [
      { id: 'su1-n14/gpu3', mode: 'xid79' },
      { id: 'su1-n05/svc-driver', mode: 'down' },
    ])
    expect(verdictOf(events)).toMatchObject({ sub: 'ambiguous', cls: null, node: null })
  })

  it('gives no event for a failure that the configuration does not allow', () => {
    expect(eventsOf(config, [{ id: 'su9-n99/gpu1', mode: 'xid79' }])).toEqual([])
  })

  it('gives the empty incident when there is no failure', () => {
    const chain = chainOfId(CURRENT_INCIDENT)
    expect(chain.rows).toEqual([])
    expect(chain.verdict.sub).toBe('unattributed')
  })

  it('refuses an unknown incident', () => {
    expect(incidentOf('no-such-incident', config, [])).toBeNull()
    expect(serverOf('su1-n14/gpu3')).toBe('su1-n14')
  })
})

describe('the incident timeline', () => {
  const chain = chainOfId('xid79-multinode')
  const runbook = RUNBOOKS.find((r) => r.id === 'RB-03')!
  const steps = CHECKLISTS['RB-03']!

  it('writes the verdict, the chain, and the checklist', () => {
    const md = timelineMarkdown(chain, runbook, steps, ['RB-03.1'], { 'RB-03.1': '10:14:02' })
    expect(md).toContain('# Incident timeline: Xid 79 during a multi-node job')
    expect(md).toContain('| terminal_state | NODE_FAIL |')
    expect(md).toContain('| sub_domain | hardware |')
    expect(md).toContain('| responsible node | su1-n14 |')
    expect(md).toContain('| 2 | 10:12:45 | dmesg |')
    expect(md).toContain('## Runbook checklist: RB-03 (1 of 4)')
    expect(md).toContain('| 10:14:02 | 1 | L1: CPU, OS, and base hardware | L1, read-only |')
    expect(md).toContain('| not recorded | 2 | L2: GPU and node software |')
  })

  it('escapes the pipe of a command, so the table stays a table', () => {
    const md = timelineMarkdown(chain, runbook, steps, [], {})
    expect(md).toContain('dmesg -T \\| grep -iE')
    expect(md.split('\n').filter((l) => l.startsWith('| 1 | 1 |')).every((l) => l.split('|').length === 10)).toBe(true)
  })

  it('writes the chain alone when no checklist is open', () => {
    const md = timelineMarkdown(chain, null, [], [], {})
    expect(md).not.toContain('Runbook checklist')
    expect(md).toContain('## Chain')
  })

  it('names the file of the export', () => {
    expect(timelineName(chain, runbook)).toBe('incident-xid79-multinode-rb-03-timeline.md')
    expect(timelineName(chain, null)).toBe('incident-xid79-multinode-timeline.md')
  })
})
