import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config/config'
import { generateServer } from '../src/topology/server'
import { nodeElements } from '../src/views/nodeView'

describe('nodeElements', () => {
  const els = nodeElements(generateServer(DEFAULT_CONFIG, 'su1-n05'))
  const nodes = els.filter((e) => e.group === 'nodes')

  it('has one element for each part and link (49 parts, 67 links)', () => {
    expect(nodes).toHaveLength(49)
    expect(els.length - nodes.length).toBe(67)
  })

  it('gives each part a position, and no two parts the same position', () => {
    const spots = nodes.map((n) => `${n.position!.x},${n.position!.y}`)
    expect(new Set(spots).size).toBe(spots.length)
  })

  it('puts GPU i above NIC i', () => {
    for (let i = 0; i < 8; i++) {
      const gpu = nodes.find((n) => n.data.id === `su1-n05/gpu${i}`)!
      const nic = nodes.find((n) => n.data.id === `su1-n05/nic${i}`)!
      expect(gpu.position!.x).toBe(nic.position!.x)
      expect(gpu.position!.y).toBeLessThan(nic.position!.y)
    }
  })
  it('puts the services in one band below the ports, and each DIMM box next to its CPU', () => {
    const services = nodes.filter((n) => n.data.kind === 'service')
    expect(services).toHaveLength(7)
    const ports = nodes.filter((n) => n.data.kind === 'port')
    for (const s of services) {
      expect(s.position!.y).toBe(services[0]!.position!.y)
      for (const p of ports) expect(s.position!.y).toBeGreaterThan(p.position!.y)
    }
    for (const c of [0, 1]) {
      const cpu = nodes.find((n) => n.data.id === `su1-n05/cpu${c}`)!
      const dimm = nodes.find((n) => n.data.id === `su1-n05/dimm${c}`)!
      expect(dimm.position!.y).toBe(cpu.position!.y)
    }
  })
})
import { withPatch } from '../src/config/rules'

describe('nodeElements for DGX H100', () => {
  const els = nodeElements(generateServer(withPatch(DEFAULT_CONFIG, { platform: 'h100' })!, 'su1-n05'))
  const nodes = els.filter((e) => e.group === 'nodes')
  it('has 50 parts and 83 links', () => {
    expect(nodes).toHaveLength(50)
    expect(els.length - nodes.length).toBe(83)
  })
  it('gives each part its own position', () => {
    const spots = nodes.map((n) => `${n.position!.x},${n.position!.y}`)
    expect(new Set(spots).size).toBe(spots.length)
  })
})
