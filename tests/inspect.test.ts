import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config/config'
import { generateFabric } from '../src/topology/fabric'
import { generateServer } from '../src/topology/server'
import { inspect, provenanceOf } from '../src/ui/inspect'

const config = DEFAULT_CONFIG
const fabric = generateFabric(config)
const server = generateServer(config, 'su1-n05')
const ctx = { config, fabric, server }
const row = (id: string, label: string) => inspect(id, ctx)!.specs.find((s) => s.label === label)!.fact

describe('inspect', () => {
  it('shows a server with its sourced specs', () => {
    const i = inspect('su1-n05', ctx)!
    expect(i.kind).toBe('server')
    expect(row('su1-n05', 'GPUs').value).toBe(8)
    expect(row('su1-n05', 'GPUs').status).toBe('confirmed')
    expect(row('su1-n05', 'Rack').value).toBe(2)
  })

  it('shows a leaf with its rail, its downlinks, and its uplinks', () => {
    const i = inspect('su1-leaf-r3', ctx)!
    expect(i.title).toContain('rail 3')
    expect(row('su1-leaf-r3', 'Downlinks').value).toBe(72)
    expect(row('su1-leaf-r3', 'Uplinks').value).toBe(72)
    expect(row('su1-leaf-r3', 'Uplinks').formula).toMatch(/18 to each of 4 spines/)
    expect(i.doc.runbooks.map((r) => r.label.split(':')[0])).toContain('N1')
  })

  it('shows a GPU with its NUMA node and its NIC', () => {
    expect(row('su1-n05/gpu6', 'NUMA node').value).toBe(1)
    expect(row('su1-n05/gpu6', 'NIC on the same rail').value).toBe('NIC 6 → SU1 rail 6 leaf')
  })

  it('shows one cable', () => {
    const i = inspect('su1-n05~r2', ctx)!
    expect(i.kind).toBe('cable')
    expect(i.title).toContain('rail 2')
  })

  it('counts the cables behind a bundle', () => {
    expect(row('su1=>su1-leaf-r0', 'Cables in the bundle').value).toBe(72)
    expect(row('su1-uplinks=>spine-01', 'Cables in the bundle').value).toBe(8 * 18)
  })

  it('returns null for an id it does not know', () => {
    expect(inspect('nonsense', ctx)).toBeNull()
    expect(inspect('su1-uplinks', ctx)).toBeNull()
  })
})
import { withPatch } from '../src/config/rules'

const ctxOf = (patch: Parameters<typeof withPatch>[1], server?: string) => {
  const c = withPatch(DEFAULT_CONFIG, patch)!
  return { config: c, fabric: generateFabric(c), server: server ? generateServer(c, server) : null }
}
const rowOf = (c: ReturnType<typeof ctxOf>, id: string, label: string) => inspect(id, c)!.specs.find((s) => s.label === label)!.fact

describe('the provenance of a part', () => {
  it('counts the confirmed, the derived, and the facts that no source confirms', () => {
    const rows = inspect('su1-n05', ctx)!.specs
    const p = provenanceOf(rows)
    expect(p.confirmed + p.derived + p.unconfirmed.length).toBe(rows.length)
    expect(p.confirmed).toBeGreaterThan(0)
    expect(p.unconfirmed.every((r) => r.fact.status !== 'confirmed' && r.fact.status !== 'derived')).toBe(true)
  })

  it('names the facts that no source confirms, with the note of each one', () => {
    const rows = inspect('su1-leaf-r3', ctx)!.specs
    const p = provenanceOf(rows)
    for (const r of p.unconfirmed) expect(r.fact.note ?? r.fact.status, r.label).toBeTruthy()
    expect(provenanceOf([])).toEqual({ confirmed: 0, derived: 0, unconfirmed: [] })
  })

  it('keeps the derived facts out of the list of the unconfirmed ones', () => {
    const rows = inspect('su1-n05', ctx)!.specs.filter((r) => r.fact.status === 'derived')
    expect(rows.length).toBeGreaterThan(0)
    expect(provenanceOf(rows).unconfirmed).toEqual([])
    expect(provenanceOf(rows).derived).toBe(rows.length)
  })
})

describe('inspect for the other designs', () => {
  it('H100: the NVSwitch count is assumed', () => {
    expect(rowOf(ctxOf({ platform: 'h100' }), 'su1-n05', 'NVSwitch chips').status).toBe('assumed')
  })
  it('Spectrum-X: a plane B leaf shows its plane and rail', () => {
    const c = ctxOf({ fabric: 'spectrum-x' })
    expect(inspect('su1-leaf-pB-r3', c)!.title).toBe('SU1 plane B rail 3')
    expect(rowOf(c, 'su1-leaf-pB-r3', 'Plane').value).toBe('B')
  })
  it('Enterprise RA: a leaf serves rails 0 + 4', () => {
    expect(rowOf(ctxOf({ build: 'oem-hgx', fabric: 'spectrum-x', design: 'ent-b300', suCount: 8 }), 'su1-leaf-pA-r0+4', 'Rails served').value).toBe('0 + 4')
  })
  it('GB300: the rack, a switch tray, a power shelf, and a GPU of a tray', () => {
    const c = ctxOf({ platform: 'gb300-nvl72' }, 'su1-n05')
    expect(rowOf(c, 'su1-k1', 'Compute trays').value).toBe(18)
    expect(String(rowOf(c, 'su1-k1-sw1', 'Software').value)).toMatch(/Subnet Manager/)
    expect(rowOf(c, 'su1-k1-ps1', 'Power supplies').value).toBe(6)
    expect(rowOf(c, 'su1-n05/gpu2', 'NIC on the same rail').value).toBe('NIC 2 → SU1 rail 2a leaf')
  })
  it('shows the conflicts of the RA on the SU', () => {
    const rows = inspect('su1', ctxOf({ platform: 'h100' }))!.specs
    expect(rows.find((r) => r.label === 'RA note 1')?.fact.value).toMatch(/probably a copy/)
  })
  it('GB300 rack view: a tray is a tray, not the fabric server', () => {
    const i = inspect('su1-n05', ctxOf({ platform: 'gb300-nvl72' }, 'su1-n05'))!
    expect(i.kind).toBe('tray')
    expect(i.title).toBe('Tray 5')
  })
  it('H100: the summaries are not the B300 text', () => {
    expect(inspect('su1-leaf-r0', ctxOf({ platform: 'h100' }))!.summary).not.toMatch(/B300|72 servers|Quantum-X800/)
  })
  it('B200: the SU shows the empty UFM slot', () => {
    const rows = inspect('su1', ctxOf({ platform: 'b200' }))!.specs
    expect(rows.some((r) => r.label === 'Empty slot: SU 1, slot 32')).toBe(true)
  })
})

describe('assumed, not derived, where the RA gives no count or mapping', () => {
  it('keeps the XDR uplinks derived (the RA gives the cables)', () => {
    expect(rowOf(ctxOf({}), 'su1-leaf-r3', 'Uplinks').status).toBe('derived')
  })
  it('marks the uplinks and the spine ports assumed when the RA gives no leaf-spine count', () => {
    expect(rowOf(ctxOf({ platform: 'h100' }), 'su1-leaf-r0', 'Uplinks').status).toBe('assumed')
    expect(rowOf(ctxOf({ platform: 'gb300-nvl72' }), 'su1-leaf-r0a', 'Uplinks').status).toBe('assumed')
    expect(rowOf(ctxOf({ platform: 'gb300-nvl72' }), 'spine-01', 'Ports in use').status).toBe('assumed')
  })
  it('marks the GB300 rack split of the rails assumed', () => {
    expect(rowOf(ctxOf({ platform: 'gb300-nvl72' }, 'su1-n05'), 'su1-n05/gpu2', 'NIC on the same rail').status).toBe('assumed')
  })
})

import { generateOverview } from '../src/topology/overview'

const ovCtx = (patch: Parameters<typeof withPatch>[1]) => {
  const c = withPatch(DEFAULT_CONFIG, patch)!
  return { config: c, fabric: generateFabric(c), server: null, overview: generateOverview(c) }
}
const blockRow = (c: ReturnType<typeof ovCtx>, id: string, label: string) => inspect(id, c)!.specs.find((s) => s.label === label)!.fact

describe('inspect for the factory blocks', () => {
  it('shows a block with its sourced facts and the values you set', () => {
    const c = ovCtx({ cboxes: 4 })
    const i = inspect('blk-vast', c)!
    expect(i.kind).toBe('block')
    expect(i.title).toMatch(/VAST/)
    expect(blockRow(c, 'blk-vast', 'CBoxes').status).toBe('assumed')
    expect(blockRow(c, 'blk-vast', 'CNodes').value).toBe(16)
    expect(blockRow(c, 'blk-vast', 'CNodes in each CBox').status).toBe('confirmed')
    expect(i.doc.runbooks.map((r) => r.label.split(':')[0])).toContain('V1')
  })
  it('shows the RA reference of the out-of-band network', () => {
    const f = blockRow(ovCtx({}), 'blk-oob-net', 'RA at 8 SU')
    expect(f.value).toBe(69)
    expect(f.status).toBe('confirmed')
  })
  it('shows the empty slots of a partial last SU on the SU', () => {
    expect(blockRow(ovCtx({ lastSuEmpty: 36 }), 'su1', 'Empty slots in the last SU').value).toBe(36)
  })
  it('returns null for a block that the configuration does not have', () => {
    expect(inspect('blk-slurm', ovCtx({}))).toBeNull()
  })
})

import { generateRackPorts } from '../src/topology/rackPorts'
import { generateRacks } from '../src/topology/racks'

const rackCtx = (patch: Parameters<typeof withPatch>[1], rack?: string) => {
  const c = withPatch(DEFAULT_CONFIG, patch)!
  return { config: c, fabric: generateFabric(c), server: null, overview: null, racks: rack ? generateRackPorts(c, rack) : generateRacks(c, 1) }
}
const rackRow = (i: ReturnType<typeof inspect>, label: string) => i!.specs.find((s) => s.label === label)?.fact

describe('inspect for the racks', () => {
  it('inspects a compute rack: height, PDUs, power with its conflict, and the port side', () => {
    const i = inspect('su1-k1', rackCtx({}))!
    expect(i.kind).toBe('rack')
    expect(rackRow(i, 'Rack height')?.value).toBe(48)
    expect(rackRow(i, 'PDUs')?.value).toBe(3)
    expect(rackRow(i, 'Rack power')?.note).toMatch(/CONFLICT/)
    expect(rackRow(i, 'Compute ports at the')).toMatchObject({ value: 'front', status: 'confirmed' })
  })
  it('inspects a network rack: 8 Q3400 leaves and their typical power', () => {
    const i = inspect('su1-net1', rackCtx({}))!
    expect(rackRow(i, 'Switches')?.value).toBe(8)
    expect(rackRow(i, 'Rack power')).toMatchObject({ value: 23.2, status: 'derived' })
    expect(rackRow(i, 'Placement')?.status).toBe('assumed')
  })
  it('keeps the NVL72 rows for an NVL72 compute rack', () => {
    const i = inspect('su1-k1', rackCtx({ platform: 'gb300-nvl72' }))!
    expect(rackRow(i, 'Compute trays')?.value).toBe(18)
    expect(rackRow(i, 'Rack power')?.value).toBe(142)
  })
  it('gives the position of a server in its rack', () => {
    expect(rackRow(inspect('su1-n02', rackCtx({})), 'Position')).toMatchObject({ value: 'SU 1 rack 1, U11-U20', status: 'assumed' })
  })
  it('inspects a server port: the far leaf port, its position, and the cable parts', () => {
    const i = inspect('su1-n01/port-c3', rackCtx({}, 'su1-k1'))!
    expect(i.title).toBe('su1-n01 OSFP 4')
    expect(rackRow(i, 'Far end')).toMatchObject({ value: 'su1-leaf-r3 sw1p1', status: 'assumed' })
    expect(rackRow(i, 'Far end position')?.value).toBe('Network rack 1 (leaves of SU 1), U13')
    expect(rackRow(i, 'Cable and optics')?.status).toBe('confirmed')
  })
  it('inspects a leaf uplink port in a network rack', () => {
    expect(rackRow(inspect('su1-leaf-r0/p73', rackCtx({}, 'su1-net1')), 'Far end')?.value).toBe('spine-01 sw1p1')
  })
  it('adds both ends to a fabric cable', () => {
    const c = DEFAULT_CONFIG
    const i = inspect('su1-n01~r0', { config: c, fabric: generateFabric(c), server: null })!
    expect(rackRow(i, 'End A')?.value).toBe('su1-n01 OSFP 1')
    expect(rackRow(i, 'End B')?.value).toBe('su1-leaf-r0 sw1p1')
  })
  it('inspects a PDU, a manifold, and the CDU', () => {
    expect(rackRow(inspect('su1-k1-pdu1', rackCtx({})), 'PDUs in each rack')?.value).toBe(3)
    const liquid = rackCtx({ platform: 'gb300-nvl72' })
    expect(rackRow(inspect('su1-k1-manifold', liquid), 'Position of the manifold')?.status).toBe('assumed')
    expect(rackRow(inspect('su1-cdu', liquid), 'CDU')?.status).toBe('not-sourced')
  })
  it('gives the Spectrum-X power shelves their rack facts, not the NVL72 facts', () => {
    const i = inspect('su1-k1-ps1', rackCtx({ fabric: 'spectrum-x', planes: 'dual', suCount: 4 }))!
    expect(rackRow(i, 'Power shelves in each rack')?.value).toBe(4)
  })
})

describe('the overlay rows of a server', () => {
  it('gives a server its tenant, node state, and phase, all assumed', () => {
    const c = DEFAULT_CONFIG
    const i = inspect('su1-n72', { config: c, fabric: generateFabric(c), server: null })!
    const r = (label: string) => i.specs.find((s) => s.label === label)?.fact
    expect(r('Tenant')).toMatchObject({ value: 'Tenant 2', status: 'assumed' })
    expect(r('Node state')).toMatchObject({ value: 'degraded', status: 'assumed' })
    expect(r('Phase')).toMatchObject({ value: 2, status: 'assumed' })
  })
})

describe('the node parts of 2c-ii', () => {
  const c = DEFAULT_CONFIG
  const ctx = { config: c, fabric: generateFabric(c), server: generateServer(c, 'su1-n05') }
  const rows = (id: string) => inspect(id, ctx)!.specs
  const value = (id: string, label: string) => rows(id).find((s) => s.label === label)?.fact

  it('gives a server its memory, PSUs, fans, and services', () => {
    const server = { config: c, fabric: generateFabric(c), server: null }
    const r = (label: string) => inspect('su1-n05', server)!.specs.find((s) => s.label === label)?.fact
    expect(r('Power supplies')?.value).toBe('12 × 3.3 kW, N+N redundancy')
    expect(r('Fans')?.status).toBe('not-sourced')
    expect(r('Node services')?.value).toMatch(/^NVIDIA driver, Fabric Manager, NVLSM/)
  })
  it('gives each drive box its own row, and the DIMMs of one CPU as an even split', () => {
    expect(value('su1-n05/nvme-boot', 'Boot drives')?.value).toBe('2 × 1.92 TB M.2')
    expect(value('su1-n05/nvme-data', 'Data drives')?.value).toBe('8 × 3.84 TB E1.S')
    expect(value('su1-n05/dimm1', 'DIMMs on this CPU')).toMatchObject({ value: 8, status: 'assumed' })
  })
  it('gives a service its fact and what it manages', () => {
    expect(value('su1-n05/svc-fabric-manager', 'Service')?.value).toMatch(/NVSwitch memory fabrics/)
    expect(value('su1-n05/svc-fabric-manager', 'Manages')?.value).toBe('the NVSwitch chips')
    expect(value('su1-n05/svc-dcgm-exporter', 'Manages')?.status).toBe('assumed')
    expect(inspect('su1-n05/svc-nvlsm', ctx)?.title).toBe('NVLSM')
  })
  it('gives an NVL72 tray its memory and its services', () => {
    const gb = withPatch(DEFAULT_CONFIG, { platform: 'gb200-nvl72' })!
    const tray = inspect('su1-n05', { config: gb, fabric: generateFabric(gb), server: generateServer(gb, 'su1-n05') })!
    const r = (label: string) => tray.specs.find((s) => s.label === label)?.fact
    expect(r('Memory')?.value).toBe('LPDDR5X, up to 480 GB for each Grace CPU')
    expect(r('Node services')?.value).toMatch(/IMEX/)
  })
})

describe('the blast radius of a node service', () => {
  it('is the failure domain of a scale-up fault for Fabric Manager and NVLSM only', () => {
    const c = DEFAULT_CONFIG
    const ctx = { config: c, fabric: generateFabric(c), server: generateServer(c, 'su1-n05') }
    expect(inspect('su1-n05/svc-nvlsm', ctx)!.doc.blastRadius?.label).toMatch(/scale-up fault/)
    expect(inspect('su1-n05/svc-dcgm-exporter', ctx)!.doc.blastRadius).toBeUndefined()
  })
})

describe('a path-only part', () => {
  it('shows its label and its source', () => {
    const i = inspect('path-pam', { config: DEFAULT_CONFIG, fabric: generateFabric(DEFAULT_CONFIG), server: null })!
    expect(i.title).toBe('PAM and MFA of the customer')
    expect(i.kind).toBe('actor')
    expect(i.specs[0]).toMatchObject({ label: 'In the sources', fact: { source: 'handbook/security-operations.md:27' } })
  })
})
