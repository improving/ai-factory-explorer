import { describe, expect, it } from 'vitest'
import { CATALOG } from '../src/catalog'
import { DESIGNS } from '../src/catalog/designs'
import { NVL72 } from '../src/catalog/nvl72'
import { DGX_B200, DGX_B300, DGX_H100, DGX_H200, GB300_TRAY, platformFor } from '../src/catalog/platforms'
import { RACKS, SWITCH_PORTS, portFaceOf } from '../src/catalog/racks'

describe('the rack facts', () => {
  it('has the rack facts of every design', () => {
    for (const d of DESIGNS) expect(RACKS[d.id], d.id).toBeDefined()
  })
  it('gives the B300 XDR rack: 48U, three 2U PDUs, about 56 kW with the power conflict, and the cable parts', () => {
    const r = RACKS['b300-xdr']
    expect(r.height).toMatchObject({ value: 48, status: 'confirmed' })
    expect(r.pdus).toMatchObject({ value: 3, status: 'confirmed' })
    expect(r.power.value).toBe(56)
    expect(r.power.note).toMatch(/CONFLICT/)
    expect(r.nodeLeafCable.value).toMatch(/980-9IATO-00XM00/)
  })
  it('feeds the Spectrum-X B300 rack with four DC power shelves and no PDU', () => {
    expect(RACKS['b300-spx'].shelves).toMatchObject({ value: 4, status: 'confirmed' })
    expect(RACKS['b300-spx'].pdus.value).toBe(0)
  })
  it('gives no cable parts where the pages give none', () => {
    expect(RACKS['b300-spx'].nodeLeafCable.status).toBe('not-sourced')
    expect(RACKS['ndr-h100'].nodeLeafCable.status).toBe('assumed')
  })
  it('fits the servers and the power feed of a compute rack in the rack height', () => {
    for (const d of DESIGNS) {
      const p = platformFor({ platform: d.platforms[0]!, build: d.builds?.[0] ?? 'dgx' })
      const f = RACKS[d.id]
      const used =
        p.form === 'nvl72-tray'
          ? NVL72.computeTrays.value + NVL72.switchTrays.value + NVL72.powerShelves.value
          : d.serversPerRack.value * p.rackUnits.value! + 2 * f.pdus.value + (f.shelves?.value ?? 0)
      expect(used, d.id).toBeLessThanOrEqual(f.height.value)
    }
  })
  it('puts the ports of a DGX B300 and of an NVL72 tray at the front, and the others at the rear (assumed)', () => {
    expect(portFaceOf(DGX_B300)).toMatchObject({ value: 'front', status: 'confirmed' })
    expect(portFaceOf(GB300_TRAY)).toMatchObject({ value: 'front', status: 'confirmed' })
    expect(portFaceOf(DGX_H100)).toMatchObject({ value: 'rear', status: 'assumed' })
  })
  it('names the mlx5 device of each GPU of a DGX H100 and B200', () => {
    expect(DGX_H100.computeMlx5?.value[0]).toBe('mlx5_0')
    expect(DGX_H100.computeMlx5?.value[7]).toBe('mlx5_11')
    expect(DGX_B200.computeMlx5?.value[7]).toBe('mlx5_15')
    expect(DGX_H200.computeMlx5?.status).toBe('assumed')
    expect(DGX_B300.computeMlx5).toBeUndefined()
  })
  it('gives the DGX B300 its 10 rack units', () => {
    expect(DGX_B300.rackUnits).toMatchObject({ value: 10, status: 'confirmed' })
  })
  it('names the Q3400 ports as the switch guide does', () => {
    expect(SWITCH_PORTS.q3400.format).toMatchObject({ value: 'sw<cage>p<1 or 2>', status: 'confirmed' })
    expect(SWITCH_PORTS.qm9700.face.status).toBe('confirmed')
  })
  it('puts the rack facts in the catalog tree, so the source test checks them', () => {
    for (const key of ['racks', 'networkRack', 'rackLayout', 'switchPorts', 'portFaces', 'rackDocs']) expect(CATALOG, key).toHaveProperty(key)
  })
})
