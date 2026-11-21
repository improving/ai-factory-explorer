import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config/config'
import { generateServer } from '../src/topology/server'

const g = generateServer(DEFAULT_CONFIG, 'su1-n05')
const of = (kind: string) => g.nodes.filter((n) => n.kind === kind)

describe('generateServer (DGX B300)', () => {
  it('has the parts of a DGX B300', () => {
    expect(of('gpu')).toHaveLength(8)
    expect(of('nvswitch')).toHaveLength(2)
    expect(of('nic')).toHaveLength(8)
    expect(of('cpu')).toHaveLength(2)
    expect(of('dpu')).toHaveLength(2)
    expect(of('bmc')).toHaveLength(1)
    expect(of('port').filter((p) => p.network === 'compute')).toHaveLength(8)
    expect(of('port').filter((p) => p.network === 'converged')).toHaveLength(4)
    expect(of('port').filter((p) => p.network === 'oob')).toHaveLength(1)
  })

  it('puts GPUs 0-3 on NUMA 0 and GPUs 4-7 on NUMA 1', () => {
    expect(of('gpu').map((n) => n.numa)).toEqual([0, 0, 0, 0, 1, 1, 1, 1])
  })

  it('links each GPU to both NVSwitch chips and to its own NIC', () => {
    for (const gpu of of('gpu')) {
      const nvlink = g.edges.filter((e) => e.source === gpu.id && e.network === 'nvlink')
      expect(nvlink).toHaveLength(2)
      const pcie = g.edges.filter((e) => e.source === gpu.id && e.network === 'pcie')
      expect(pcie.map((e) => e.target)).toEqual([`su1-n05/nic${gpu.index}`])
    }
  })

  it('gives compute port k rail k', () => {
    for (const port of of('port').filter((p) => p.network === 'compute')) expect(port.rail).toBe(port.index)
  })

  it('only has edges between parts that exist', () => {
    const ids = new Set(g.nodes.map((n) => n.id))
    for (const e of g.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true)
  })

  it('refuses a server that is not in the configuration', () => {
    expect(() => generateServer(DEFAULT_CONFIG, 'su2-n01')).toThrow(/No server/)
    expect(() => generateServer(DEFAULT_CONFIG, 'su1-n73')).toThrow(/No server/)
  })
})

describe('the NVLink share of one NVSwitch chip', () => {
  it('is assumed, because the even split is not in a source', () => {
    const nvlink = g.edges.find((e) => e.network === 'nvlink')!
    expect(nvlink.bandwidth?.status).toBe('assumed')
  })
})
import { withPatch } from '../src/config/rules'

const h100 = generateServer(withPatch(DEFAULT_CONFIG, { platform: 'h100' })!, 'su1-n05')
const dell = generateServer(withPatch(DEFAULT_CONFIG, { build: 'oem-hgx' })!, 'su1-n05')

describe('generateServer for the other 8-GPU platforms', () => {
  it('DGX H100: 4 NVSwitch chips (assumed), 2 ConnectX-7 front NICs, and the OSFP map of Table 6', () => {
    expect(h100.nodes.filter((n) => n.kind === 'nvswitch')).toHaveLength(4)
    const front = h100.nodes.filter((n) => n.network === 'converged' && n.kind === 'nic')
    expect(front).toHaveLength(2)
    expect(h100.nodes.find((n) => n.id === 'su1-n05/port-c0')?.label).toBe('OSFP4 P2 (rail 0)')
    const nvlink = h100.edges.find((e) => e.network === 'nvlink')!
    expect(nvlink.bandwidth?.value).toBeCloseTo(0.225)
    expect(nvlink.bandwidth?.status).toBe('assumed')
  })
  it('Dell B300: no front NIC (not in the sources), 8 compute ports', () => {
    expect(dell.nodes.filter((n) => n.network === 'converged')).toHaveLength(0)
    expect(dell.nodes.filter((n) => n.kind === 'port' && n.network === 'compute')).toHaveLength(8)
  })
  it('only has edges between parts that exist', () => {
    for (const g of [h100, dell]) {
      const ids = new Set(g.nodes.map((n) => n.id))
      for (const e of g.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true)
    }
  })
})

describe('the NIC names', () => {
  it('uses the mlx5 name of the user guide when the platform has one', () => {
    const h100 = generateServer(withPatch(DEFAULT_CONFIG, { platform: 'h100' })!, 'su1-n01')
    expect(h100.nodes.find((n) => n.id === 'su1-n01/nic0')?.label).toBe('NIC 0 (mlx5_0)')
    const b300 = generateServer(DEFAULT_CONFIG, 'su1-n01')
    expect(b300.nodes.find((n) => n.id === 'su1-n01/nic0')?.label).toBe('NIC 0')
  })
})

describe('the parts of spec 5.2 level 4 (DGX B300)', () => {
  it('has one box for each group: PSUs, fans, DIMMs for each CPU, and the boot and data drives', () => {
    expect(of('psu').map((n) => n.label)).toEqual(['PSUs: 12 × 3.3 kW, N+N redundancy'])
    expect(of('fan').map((n) => n.label)).toEqual(['Fans (count not sourced)'])
    expect(of('dimm').map((n) => n.label)).toEqual(['DIMMs × 8', 'DIMMs × 8'])
    expect(of('nvme').map((n) => n.label)).toEqual(['Boot: 2 × 1.92 TB M.2', 'Data: 8 × 3.84 TB E1.S'])
  })
  it('links each DIMM box to its CPU over the memory bus', () => {
    const mem = g.edges.filter((e) => e.network === 'memory')
    expect(mem.map((e) => [e.source, e.target])).toEqual([
      ['su1-n05/dimm0', 'su1-n05/cpu0'],
      ['su1-n05/dimm1', 'su1-n05/cpu1'],
    ])
  })
  it('has the services band, with a link from each service to what it manages', () => {
    expect(of('service').map((n) => n.label)).toEqual(['NVIDIA driver', 'Fabric Manager', 'NVLSM', 'Container Toolkit', 'Device Plugin', 'DCGM Exporter', 'MIG Manager'])
    const from = (svc: string) => g.edges.filter((e) => e.source === `su1-n05/svc-${svc}`).map((e) => e.target)
    expect(from('driver')).toHaveLength(8)
    expect(from('fabric-manager')).toEqual(['su1-n05/nvswitch0', 'su1-n05/nvswitch1'])
    expect(from('dcgm-exporter')).toEqual(['su1-n05/svc-driver'])
    expect(g.edges.filter((e) => e.network === 'service')).toHaveLength(16)
  })
})

describe('the parts of the other platforms', () => {
  it('DGX H100: 32 DIMMs (16 on each CPU), no NVLSM', () => {
    expect(h100.nodes.filter((n) => n.kind === 'dimm').map((n) => n.label)).toEqual(['DIMMs × 16', 'DIMMs × 16'])
    expect(h100.nodes.some((n) => n.id === 'su1-n05/svc-nvlsm')).toBe(false)
  })
  it('Dell B300: the gaps say "not sourced", and the fans have their Dell count', () => {
    expect(dell.nodes.filter((n) => n.kind === 'dimm').map((n) => n.label)).toEqual(['DIMMs (not sourced)', 'DIMMs (not sourced)'])
    expect(dell.nodes.filter((n) => n.kind === 'nvme').map((n) => n.label)).toEqual(['Boot: NVMe (not sourced)', 'Data: NVMe (not sourced)'])
    expect(dell.nodes.find((n) => n.kind === 'fan')?.label).toBe('Fans: 15 GPU fans (hot-swap) and 5 CPU fans (cold-swap)')
  })
  it('NVL72: the rack graph gets no new part', () => {
    const rack = generateServer(withPatch(DEFAULT_CONFIG, { platform: 'gb200-nvl72' })!, 'su1-n05')
    for (const kind of ['psu', 'fan', 'dimm']) expect(rack.nodes.filter((n) => n.kind === kind), kind).toHaveLength(0)
  })
})
