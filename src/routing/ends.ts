import type { NodeKind } from '../catalog/kinds'
import { NVL72 } from '../catalog/nvl72'
import { platformFor } from '../catalog/platforms'
import type { Config } from '../config/config'
import { fabricShape, leafIndexFor, leavesOf } from '../topology/fabric'
import { leafId, parseServerId, partId, rackId, serverExists, spineId } from '../topology/ids'

// A part of a path. A virtual part is drawn only in the path strip (a user, an operator, a VAST node).
export type PathPart = { id: string; label: string; kind: NodeKind; virtual?: boolean }
// A GPU at one end of a path: its server or tray, its index (its rail), its slot in its group of SUs, and its rack.
export type GpuEnd = { id: string; server: string; gpu: number; su: number; group: number; slot: number; rack: number }

const PLANE = ['A', 'B']

export function gpuEnd(config: Config, id: string): GpuEnd | null {
  const m = /^(su\d+-n\d{2,3})\/gpu(\d+)$/.exec(id)
  if (!m || !serverExists(config, m[1]!)) return null
  const gpu = Number(m[2])
  if (gpu >= platformFor(config).gpusPerServer.value) return null
  const shape = fabricShape(config)
  const { su, n } = parseServerId(m[1]!)!
  const group = Math.floor((su - 1) / shape.susPerGroup) * shape.susPerGroup + 1
  return { id, server: m[1]!, gpu, su, group, slot: (su - group) * shape.perSu + n, rack: Math.ceil(n / shape.perRack) }
}

export const gpuPart = (e: GpuEnd): PathPart => ({ id: e.id, label: `${e.server} GPU ${e.gpu}`, kind: 'gpu' })
export const nicPart = (e: GpuEnd): PathPart => ({ id: partId(e.server, `nic${e.gpu}`), label: `${e.server} NIC ${e.gpu}`, kind: 'nic' })
// The GPU with index `gpu` in the same server or tray as `e`.
export const sibling = (e: GpuEnd, gpu: number): GpuEnd => ({ ...e, id: partId(e.server, `gpu${gpu}`), gpu })

// The NVSwitch chips that join the GPUs of `e`: the chips of the server (HGX), or the 18 chips of its rack (NVL72).
export function nvswitchesOf(config: Config, e: GpuEnd): PathPart[] {
  const p = platformFor(config)
  if (p.form === 'hgx8') {
    return Array.from({ length: p.nvswitches.value }, (_, j): PathPart => ({ id: partId(e.server, `nvswitch${j}`), label: `${e.server} NVSwitch ${j}`, kind: 'nvswitch' }))
  }
  const rid = rackId(e.su, e.rack)
  const chips: PathPart[] = []
  for (let w = 1; w <= NVL72.switchTrays.value; w++) {
    for (let c = 0; c < NVL72.chipsPerSwitchTray.value; c++) chips.push({ id: partId(`${rid}-sw${w}`, `chip${c}`), label: `NVSwitch ${w}.${c}`, kind: 'nvswitch' })
  }
  return chips
}

// The compute leaf of the NIC of `e` in one plane, by the leaf rule of the design; null with no fabric.
export function leafOf(config: Config, e: GpuEnd, plane: number): PathPart | null {
  const shape = fabricShape(config)
  if (shape.leavesPerGroup === 0) return null
  const leaf = leavesOf(shape, config.topology, e.group)[leafIndexFor(shape, config.topology, e.gpu, plane, e.slot)]!
  return { id: leafId(e.group, leaf.tag), label: leaf.label, kind: 'leaf' }
}

// The spines of one plane: a leaf connects to each spine of its plane.
export function spinesOf(config: Config, plane: number): PathPart[] {
  const shape = fabricShape(config)
  const first = plane * shape.spinesPerPlane + 1
  return Array.from({ length: shape.spinesPerPlane }, (_, k): PathPart => {
    const j = first + k
    return { id: spineId(j), label: shape.planeCount === 2 ? `Spine ${j} (plane ${PLANE[plane]})` : `Spine ${j}`, kind: 'spine' }
  })
}
