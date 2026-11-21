import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import type { Graph } from '../src/topology/graph'
import { generateOverview } from '../src/topology/overview'

const ov = (patch: Partial<Config>) => generateOverview(withPatch(DEFAULT_CONFIG, patch)!)
const roles = (g: Graph) => g.nodes.map((n) => n.role)
const edge = (g: Graph, a: string, b: string) => g.edges.find((e) => e.source === `blk-${a}` && e.target === `blk-${b}`)

describe('generateOverview', () => {
  it('draws the default factory: 21 blocks and 24 labelled links', () => {
    const g = ov({})
    expect(g.nodes).toHaveLength(21)
    expect(g.edges).toHaveLength(24)
    expect(roles(g)).toEqual(expect.arrayContaining(['internet', 'firewall', 'lb', 'rafay', 'k8s', 'ufm', 'vast', 'ups', 'pdu']))
    expect(roles(g)).not.toEqual(expect.arrayContaining(['slurm']))
    for (const e of g.edges) expect(e.label, e.id).toBeTruthy()
    const ids = new Set(g.nodes.map((n) => n.id))
    for (const e of g.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true)
  })
  it('shows the north-south path: internet, routers, firewall, frontend', () => {
    const g = ov({})
    expect(edge(g, 'internet', 'router')?.network).toBe('north-south')
    expect(edge(g, 'firewall', 'frontend')?.label).toBe('ingress and egress')
  })
  it('Slurm only: no Rafay, no Kubernetes, no control-plane VIP', () => {
    const r = roles(ov({ orchestration: 'slurm' }))
    expect(r).toContain('slurm')
    expect(r).not.toContain('rafay')
    expect(r).not.toContain('k8s')
    expect(r).not.toContain('lb')
  })
  it('Rafay SaaS: reached over the internet, no VIP', () => {
    const g = ov({ rafay: 'saas' })
    expect(edge(g, 'internet', 'rafay-saas')?.network).toBe('management')
    expect(roles(g)).not.toContain('lb')
  })
  it('GB300: liquid cooling, so a CDU feeds the pods', () => {
    expect(edge(ov({ platform: 'gb300-nvl72' }), 'cdu', 'pods')?.network).toBe('cooling')
  })
  it('a separate InfiniBand storage network sits between the pods and VAST', () => {
    const g = ov({ storageFabric: 'infiniband' })
    expect(g.nodes.find((n) => n.role === 'storage-net')?.label).toMatch(/InfiniBand/)
    expect(edge(g, 'pods', 'storage-net')).toBeDefined()
    expect(edge(g, 'frontend', 'vast')).toBeUndefined()
  })
  it('Spectrum-X has no UFM', () => {
    expect(roles(ov({ fabric: 'spectrum-x' }))).not.toContain('ufm')
  })
  it('shows the spares and a partial last SU', () => {
    const g = ov({ spares: 4, lastSuEmpty: 36 })
    expect(g.nodes.find((n) => n.role === 'spares')?.label).toBe('Spare pool: 4 servers')
    expect(g.nodes.find((n) => n.role === 'pods')?.label).toMatch(/36 servers/)
  })
  it('stays under 100 elements with every option on', () => {
    const g = ov({ storageFabric: 'ethernet', automation: 'netris', ceph: 'on', linstor: 'on', clusterManager: 'bcm', orchestration: 'both', spares: 8, cooling: 'liquid' })
    expect(g.nodes.length + g.edges.length).toBeLessThan(100)
  })
})

describe('the telemetry overlay', () => {
  const tel = (patch: Partial<Config>) => generateOverview(withPatch(DEFAULT_CONFIG, patch)!, { telemetry: true })
  it('adds Prometheus, Alertmanager, the ITSM, and the SIEM, with their links', () => {
    const g = tel({})
    expect(g.nodes).toHaveLength(21 + 4)
    expect(g.edges).toHaveLength(24 + 8)
    expect(edge(g, 'pods', 'prometheus')?.label).toMatch(/dcgm-exporter :9400/)
    expect(edge(g, 'prometheus', 'alertmanager')?.network).toBe('telemetry')
  })
  it('shows a manual ticket when the ITSM has no integration', () => {
    expect(edge(tel({}), 'alertmanager', 'itsm')?.label).toMatch(/L1 opens the ticket by hand/)
    expect(edge(tel({ itsm: 'on' }), 'alertmanager', 'itsm')?.label).toBe('webhook')
  })
  it('adds NMX for an NVL72 rack, and no UFM link without a UFM', () => {
    expect(edge(tel({ platform: 'gb300-nvl72' }), 'pods', 'prometheus')?.label).toMatch(/NMX/)
    expect(edge(tel({ fabric: 'spectrum-x', planes: 'dual', suCount: 4 }), 'ufm', 'prometheus')).toBeUndefined()
  })
  it('does not change the overview when the overlay is off', () => {
    expect(generateOverview(DEFAULT_CONFIG).nodes).toHaveLength(21)
  })
})
