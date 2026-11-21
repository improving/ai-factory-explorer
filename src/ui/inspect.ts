import { BLOCK_DOCS, COMPONENT_DOCS, RACK_DOCS, SCALE_UP_BLAST, type ComponentDoc } from '../catalog/component-docs'
import { BLOCK_FACTS, userSet, type BlockRole } from '../catalog/factory'
import { assumed, derived, notSourced, SITE_REQUIREMENTS, type Fact } from '../catalog/fact'
import type { DocKind } from '../catalog/kinds'
import { NVL72 } from '../catalog/nvl72'
import { VIRTUAL_PARTS } from '../catalog/paths'
import { platformFor, type Platform } from '../catalog/platforms'
import { NODE_SERVICES, serviceOf, servicesFor } from '../catalog/services'
import { GPU_OPERATOR_URL } from '../catalog/urls'
import type { Config } from '../config/config'
import { emptySlotsOf, fabricShape, leafIndexFor, leavesOf, type FabricShape } from '../topology/fabric'
import { findEdge, findNode, type Graph, type GraphEdge, type GraphNode } from '../topology/graph'
import { serverOf, suOf } from '../topology/ids'
import { NETWORK_RACK, RACKS, RACK_LAYOUT, portFaceOf, switchPortFacts } from '../catalog/racks'
import { PORT_ASSIGNMENT_NOTE, cableEnds, switchOf } from '../topology/ports'
import { layoutOf, rackOf } from '../topology/racks'
import { ASSIGN_NOTE, assignments } from '../topology/assign'

export type SpecRow = { label: string; fact: Fact<unknown> }
export type Inspection = { id: string; title: string; kind: DocKind; summary: string; specs: SpecRow[]; doc: ComponentDoc }
type Ctx = { config: Config; fabric: Graph; server: Graph | null; overview?: Graph | null; racks?: Graph | null }

// The provenance of the facts of a part: the count of each status, and the facts that no source confirms.
export type Provenance = { confirmed: number; derived: number; unconfirmed: SpecRow[] }
export function provenanceOf(rows: SpecRow[]): Provenance {
  const confirmedRows = rows.filter((r) => r.fact.status === 'confirmed')
  const derived = rows.filter((r) => r.fact.status === 'derived')
  const unconfirmed = rows.filter((r) => r.fact.status !== 'confirmed' && r.fact.status !== 'derived')
  return { confirmed: confirmedRows.length, derived: derived.length, unconfirmed }
}

const PLANE = ['A', 'B']
const spec = (label: string, fact: Fact<unknown>): SpecRow => ({ label, fact })
const note = (text: string): Fact<string> => ({ value: text, status: 'assumed', note: text })
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// The open server or rack is looked at first: in the rack view, a tray id is also a fabric server id.
export function inspect(id: string, ctx: Ctx): Inspection | null {
  // A path-only part of a factory trace: no view draws it, so its specs give its source.
  const virtual = VIRTUAL_PARTS[id]
  if (virtual) return make(id, virtual.label, 'actor', [spec('In the sources', virtual.fact)])
  // In a rack level, the rack graph has the racks, the ports, and the rack-only parts (PDUs, manifolds).
  const inRacks = ctx.racks ? findNode(ctx.racks, id) : undefined
  if (inRacks?.kind === 'rack') return rackInspection(inRacks, ctx)
  if (inRacks?.kind === 'port') return portInspection(inRacks, ctx)
  const node =
    (ctx.server ? findNode(ctx.server, id) : undefined) ??
    findNode(ctx.fabric, id) ??
    (ctx.overview ? findNode(ctx.overview, id) : undefined) ??
    inRacks
  if (node?.kind === 'block') return blockInspection(node, ctx)
  if (node) {
    const specs = nodeSpecs(node, ctx)
    const where = inRacks ? positionSpec(ctx.config, id) : null
    return make(id, node.label, node.kind, where ? [...specs, where] : specs)
  }
  const edge = (ctx.server ? findEdge(ctx.server, id) : undefined) ?? findEdge(ctx.fabric, id)
  if (edge) return make(id, edgeTitle(edge), 'cable', edgeSpecs(edge, ctx))
  if (id.includes('=>')) {
    const [a, b] = id.split('=>') as [string, string]
    const cables = bundleCables(ctx.fabric, a, b)
    if (cables.length === 0) return null
    return make(id, `${cables.length} cables: ${a} → ${b}`, 'cable', [
      spec('Cables in the bundle', derived(cables.length, 'cables', 'counted in the generated topology')),
      ...edgeSpecs(cables[0]!, ctx).filter((s) => s.label === 'Bandwidth'),
    ])
  }
  return null
}

// A scale-up service: Fabric Manager and NVLSM of an HGX server, IMEX of a tray, NVOS of a switch tray.
const SCALE_UP_SERVICE = /\/(svc-fabric-manager|svc-nvlsm|imex|nvos)$/

function make(id: string, title: string, kind: DocKind, specs: SpecRow[]): Inspection {
  const base = COMPONENT_DOCS[kind]
  const doc = kind === 'service' && SCALE_UP_SERVICE.test(id) ? { ...base, blastRadius: SCALE_UP_BLAST } : base
  return { id, title, kind, summary: doc.summary, specs, doc }
}

function ruleText(shape: FabricShape, topology: Config['topology']): string {
  if (topology === 'tor') return 'Top-of-rack (assumed): each leaf takes all the rails of a few servers.'
  const rule = shape.design.leafRule
  switch (rule.kind) {
    case 'rail':
      return `NIC k of each server connects to the rail-k leaf of its SU${shape.planeCount === 2 ? ' in each plane' : ''} (rail-optimized).`
    case 'rail-pairs':
      return `In each plane, a leaf serves rails k and k + ${rule.pairs} of the ${shape.slotsPerGroup} nodes of its group.`
    case 'rail-split':
      return `Each rail has 2 leaves in each SU: slots 1-${rule.split} on the first, the rest on the second.`
    case 'none':
      return 'No scale-out fabric in this version.'
  }
}

// The leaves that NIC `rail` of `server` connects to (one for each plane), as one label.
function leafLabels(ctx: Ctx, shape: FabricShape, server: string | null, rail: number): string {
  if (shape.leavesPerGroup === 0) return 'no scale-out fabric in this version'
  const node = server ? findNode(ctx.fabric, server) : undefined
  if (!node) return 'unknown'
  const leaves = leavesOf(shape, ctx.config.topology, suOf(node.parent!)!)
  return Array.from({ length: shape.planeCount }, (_, p) => {
    const leaf = leaves[leafIndexFor(shape, ctx.config.topology, rail, p, node.index!)]!
    return `${leaf.label} leaf`
  }).join(' and ')
}

function nodeSpecs(n: GraphNode, ctx: Ctx): SpecRow[] {
  const shape = fabricShape(ctx.config)
  const d = shape.design
  const P = platformFor(ctx.config)
  const rule = ruleText(shape, ctx.config.topology)
  const server = serverOf(n.id)
  const word = cap(d.serverWord)
  const NO_UPLINKS = 'The RA gives no leaf-spine count; the app assumes as many uplinks as downlinks.'
  const uplinkFact = <T,>(value: T, unit: string, formula: string): Fact<T> =>
    shape.row.leafSpineCables === undefined ? assumed(value, unit, `${formula}. ${NO_UPLINKS}`, d.source) : derived(value, unit, formula, d.source)
  // The rail split of the GB300 RA and the top-of-rack wiring are the app's choice, not the RA's.
  const mappingAssumed = d.leafRule.kind === 'rail-split' || ctx.config.topology === 'tor'
  const mapFact = <T,>(value: T): Fact<T> => (mappingAssumed ? assumed(value, undefined, rule, d.source) : derived(value, undefined, rule, d.source))
  const nicLeaf = (rail: number) =>
    spec('Leaf', mapFact(leafLabels(ctx, shape, server, rail)))
  switch (n.kind) {
    case 'su':
      return [
        spec('Design', { value: d.name, status: 'confirmed', source: d.source }),
        spec(`${word} in each SU`, d.serversPerSu),
        spec(`${word} in each rack`, d.serversPerRack),
        spec('Racks in the group', derived(shape.slotsPerGroup / shape.perRack, 'racks', `${shape.slotsPerGroup} slots ÷ ${shape.perRack} for each rack`, d.source)),
        spec('Leaves in the group', derived(shape.leavesPerGroup, 'leaves', rule, d.source)),
        spec('Rails', d.rails),
        spec('Planes', derived(d.planes, undefined, 'the node-leaf cables of the RA tables', d.source)),
        ...(emptySlotsOf(ctx.config) > 0
          ? [spec('Empty slots in the last SU', derived(emptySlotsOf(ctx.config), 'slots', 'the empty racks of the last SU, less a reserved slot', d.source))]
          : []),
        ...d.reservedSlots.map((r) => spec(`Empty slot: SU ${r.su}, slot ${r.slot}`, note(r.reason))),
        ...d.notes.map((t, i) => spec(`RA note ${i + 1}`, note(t))),
      ]
    case 'server':
      return [
        spec('Platform', { value: P.name, status: 'confirmed', source: P.gpusPerServer.source }),
        spec('GPUs', P.gpusPerServer),
        spec('GPU memory', P.gpuMemory),
        spec('NVLink for each GPU', P.nvlinkPerGpu),
        spec('NVLink links', P.nvlinkLinksPerGpu),
        spec('NVSwitch chips', P.nvswitches),
        spec('Compute NIC', P.computeNic.model),
        spec('Compute NICs', P.computeNic.count),
        spec('Compute NIC speed', P.computeNic.speed),
        spec('Front NIC', P.frontNic.model),
        spec('Front NICs', P.frontNic.count),
        spec('CPUs', P.cpus),
        spec('CPU model', P.cpuModel),
        spec('Memory', P.memory),
        spec('DIMMs', P.dimms),
        spec('Power supplies', P.psus),
        spec('Fans', P.fans),
        spec('Node services', servicesRow(P)),
        spec('System power', P.systemPower),
        spec('Rack units', P.rackUnits),
        spec('Cooling', P.cooling),
        spec('Boot drives', P.nvmeBoot),
        spec('Data drives', P.nvmeData),
        spec('BMC', P.bmc),
        spec('Rack', derived(n.rack, undefined, `slot ${n.index} ÷ ${shape.perRack} for each rack, rounded up`, d.source)),
        spec('Scale-up failure domain', P.scaleUpFailureDomain),
        ...overlayRows(n.id, ctx),
      ]
    case 'gpu':
      return [
        spec('GPU memory', P.gpuMemory),
        spec('NVLink for each GPU', P.nvlinkPerGpu),
        spec('NVLink links', P.nvlinkLinksPerGpu),
        spec('Speed of one link', P.nvlinkLinkSpeed),
        spec('NUMA node', derived(n.numa, undefined, 'the NUMA map of the platform', P.numaGpus.source)),
        spec('NIC on the same rail', mapFact(`NIC ${n.index} → ${leafLabels(ctx, shape, server, n.index!)}`)),
      ]
    case 'nvswitch':
      return n.parent?.includes('-sw')
        ? [spec('NVLink ports', NVL72.portsPerChip), spec('NVSwitch chips in the rack', P.nvswitches)]
        : [spec('NVSwitch chips in the server', P.nvswitches), spec('NVLink for each GPU', P.nvlinkPerGpu)]
    case 'nic':
      if (n.network === 'converged') return [spec('Model', P.frontNic.model), spec('Ports', P.frontNic.portsEach), spec('Port speed', P.frontNic.speed)]
      return [
        spec('Model', P.computeNic.model),
        spec('Speed', P.computeNic.speed),
        ...(n.numa === undefined ? [] : [spec('NUMA node', derived(n.numa, undefined, 'the NUMA node of its GPU', P.numaGpus.source))]),
        nicLeaf(n.rail!),
      ]
    case 'dpu':
      return [spec('Model', P.frontNic.model), spec('Ports', P.frontNic.portsEach), spec('Port speed', P.frontNic.speed)]
    case 'cpu':
      return [spec('CPUs', P.cpus), spec('CPU model', P.cpuModel), spec('GPUs on each NUMA node', P.numaGpus)]
    case 'nvme':
      return n.index === 1 ? [spec('Data drives', P.nvmeData)] : [spec('Boot drives', P.nvmeBoot)]
    case 'bmc':
      return [spec('BMC', P.bmc)]
    case 'psu':
      return [spec('Power supplies', P.psus)]
    case 'fan':
      return [spec('Fans', P.fans)]
    case 'dimm': {
      const perCpu =
        P.dimms.value === null
          ? notSourced('The DIMM count of the server is not sourced.')
          : assumed(P.dimms.value / P.cpus.value, 'DIMMs', 'The sources give the DIMMs of the server; the app splits them evenly over the CPUs.', P.dimms.source)
      return [spec('Memory', P.memory), spec('DIMMs in the server', P.dimms), spec('DIMMs on this CPU', perCpu)]
    }
    case 'port':
      if (n.network === 'compute') {
        return [spec('Port', { ...P.computePorts, value: P.computePorts.value[n.index!] }), nicLeaf(n.rail!), spec('Speed', P.computeNic.speed)]
      }
      return n.network === 'converged' ? [spec('Speed', P.frontNic.speed)] : []
    case 'leaf': {
      const down = ctx.fabric.edges.filter((e) => e.target === n.id).length
      return [
        spec('Model', d.leafSwitch.model),
        spec('Ports', d.leafSwitch.ports),
        spec('Port speed', d.leafSwitch.portSpeed),
        spec('Rails served', derived((n.rails ?? []).join(' + '), undefined, rule, d.source)),
        ...(shape.planeCount === 2 ? [spec('Plane', derived(PLANE[n.plane ?? 0], undefined, 'one fabric for each plane', d.source))] : []),
        spec('Downlinks', derived(down, 'ports', `one port for each ${d.serverWord.replace(/s$/, '')} and rail that the leaf serves (${shape.downPerLeaf} in a full group)`, d.source)),
        spec(
          'Uplinks',
          uplinkFact(
            shape.uplinksPerLeaf,
            'ports',
            `${shape.uplinksPerLeaf * shape.row.leaf} leaf-spine cables ÷ ${shape.row.leaf} leaves; ${shape.perPair} to each of ${shape.spinesPerPlane} spines`,
          ),
        ),
      ]
    }
    case 'spine':
      return [
        spec('Model', d.spineSwitch.model),
        spec('Ports', d.spineSwitch.ports),
        spec('Ports in use', uplinkFact((shape.row.leaf / shape.planeCount) * shape.perPair, 'ports', `${shape.row.leaf / shape.planeCount} leaves of its plane × ${shape.perPair} cables`)),
      ]
    case 'rack': {
      const family = P.family === 'gb300-nvl72' ? 'gb300-nvl72' : 'gb200-nvl72'
      return [
        spec('Compute trays', NVL72.computeTrays),
        spec('Switch trays', NVL72.switchTrays),
        spec('NVSwitch chips', P.nvswitches),
        spec('NVLink for the rack', NVL72.rackNvlink),
        spec('GPU memory for the rack', NVL72.hbm[family]),
        spec('Power shelves', NVL72.powerShelves),
        spec('Rack power', NVL72.rackPower),
        spec('Cooling', NVL72.cooling),
        spec('CDU', NVL72.cdu),
        spec('Tray order', NVL72.layout),
      ]
    }
    case 'tray':
      return [
        spec('Platform', { value: P.name, status: 'confirmed', source: P.gpusPerServer.source }),
        spec('GPUs', P.gpusPerServer),
        spec('Grace CPUs', P.cpus),
        spec('Memory', P.memory),
        spec('Node services', servicesRow(P)),
        spec('GPU memory', P.gpuMemory),
        spec('Compute NIC', P.computeNic.model),
        spec('Compute NICs', P.computeNic.count),
        spec('Compute NIC speed', P.computeNic.speed),
        spec('Front NIC', P.frontNic.model),
        spec('Front NICs', P.frontNic.count),
        spec('Boot drives', P.nvmeBoot),
        spec('Data drives', P.nvmeData),
        spec('BMC', P.bmc),
        spec('Cooling', P.cooling),
        spec('Software', NVL72.computeTraySoftware),
        ...overlayRows(n.id, ctx),
      ]
    case 'switch-tray':
      return [
        spec('NVSwitch chips', NVL72.chipsPerSwitchTray),
        spec('NVLink ports for each chip', NVL72.portsPerChip),
        spec('Software', NVL72.switchTraySoftware),
        spec('NMX leader', NVL72.nmxLeader),
      ]
    case 'power-shelf':
      if (P.form !== 'nvl72-tray') {
        const f = RACKS[d.id]
        return [...(f.shelves ? [spec('Power shelves in each rack', f.shelves)] : []), spec('Rack power', f.power)]
      }
      return [spec('Power supplies', NVL72.psusPerShelf), spec('Shelf power', NVL72.shelfPower), spec('Rack power', NVL72.rackPower)]
    case 'pdu':
      return [spec('PDUs in each rack', RACKS[d.id].pdus), spec('Rack power', RACKS[d.id].power)]
    case 'manifold':
      return [spec('Position of the manifold', RACK_LAYOUT.manifold), spec('Cooling', P.form === 'nvl72-tray' ? NVL72.cooling : userSet(ctx.config.cooling))]
    case 'service':
      if (serviceOf(n.id)) {
        const svc = serviceOf(n.id)!
        const what = { gpus: 'the GPUs', nvswitches: 'the NVSwitch chips', driver: 'the driver (a GPU Operator component)' }[svc.manages]
        const manages =
          svc.manages === 'driver'
            ? assumed(what, undefined, 'The GPU Operator page lists the component; the link to the driver is the picture of the app.', svc.fact.source)
            : { value: what, status: svc.fact.status, source: svc.fact.source }
        return [spec('Service', svc.fact), spec('Manages', manages)]
      }
      return n.label === 'IMEX'
        ? [spec('Software', NVL72.computeTraySoftware)]
        : [spec('Software', NVL72.switchTraySoftware), spec('NMX leader', NVL72.nmxLeader)]
    case 'block':
    case 'actor':
      return []
  }
}

function edgeTitle(e: GraphEdge): string {
  const rail = e.rail === undefined ? '' : `, rail ${e.rail}`
  return `${e.network} link${rail}: ${e.source} → ${e.target}`
}

function edgeSpecs(e: GraphEdge, ctx: Ctx): SpecRow[] {
  const shape = fabricShape(ctx.config)
  const rows: SpecRow[] = []
  if (e.bandwidth) rows.push(spec('Bandwidth', e.bandwidth))
  if (e.rail !== undefined && e.network === 'compute') {
    rows.push(spec('Rail', derived(e.rail, undefined, ruleText(shape, ctx.config.topology), shape.design.source)))
  }
  if (e.plane !== undefined && shape.planeCount === 2) rows.push(spec('Plane', derived(PLANE[e.plane], undefined, 'one fabric for each plane', shape.design.source)))
  if (e.note) rows.push(spec('Note', note(e.note)))
  if (e.tier === 'node-leaf' || e.tier === 'leaf-spine') {
    const { a, b } = cableEnds(ctx.config, e)
    const facts = RACKS[shape.design.id]
    rows.push(
      spec('End A', assumed(`${a.device} ${a.label}${a.name ? ` (${a.name})` : ''}`, undefined, PORT_ASSIGNMENT_NOTE)),
      spec('End B', assumed(`${b.device} ${b.label}`, undefined, PORT_ASSIGNMENT_NOTE)),
      spec('Cable and optics', e.tier === 'leaf-spine' ? facts.leafSpineCable : facts.nodeLeafCable),
    )
  }
  return rows
}

// The graph cables that one view bundle stands for.
function bundleCables(fabric: Graph, a: string, b: string): GraphEdge[] {
  if (a.endsWith('-uplinks')) {
    const su = suOf(a)
    return fabric.edges.filter((e) => e.tier === 'leaf-spine' && e.target === b && suOf(e.source) === su)
  }
  if (b.endsWith('-uplinks')) return fabric.edges.filter((e) => e.tier === 'leaf-spine' && e.source === a)
  if (/^su\d+$/.test(a)) return fabric.edges.filter((e) => e.tier === 'node-leaf' && e.target === b)
  return fabric.edges.filter((e) => e.source === a && e.target === b)
}

function blockInspection(n: GraphNode, ctx: Ctx): Inspection {
  const role = n.role!
  const doc = BLOCK_DOCS[role]
  const specs = [...blockConfigRows(role, ctx), ...BLOCK_FACTS[role].map((r) => spec(r.label, r.fact))]
  return { id: n.id, title: n.label, kind: 'block', summary: doc.summary, specs, doc }
}

// The values of a block that come from the configuration, not from the sources.
function blockConfigRows(role: BlockRole, ctx: Ctx): SpecRow[] {
  const c = ctx.config
  const shape = fabricShape(c)
  const d = shape.design
  const empty = emptySlotsOf(c)
  const ra = (value: number) => ({ value, status: 'confirmed' as const, source: d.source })
  switch (role) {
    case 'internet':
      return [spec('Uplink', userSet(c.uplink === '2x100g' ? '2 × 100GbE' : '2 × 400GbE'))]
    case 'router':
      return [spec('Edge routers', userSet(c.edgeRouters))]
    case 'lb':
      return [spec('Load balancer', userSet(c.lb === 'firewall-l4' ? 'the firewall at L4' : 'HAProxy or Nginx on the control nodes'))]
    case 'frontend':
      return [
        spec('Spines', userSet(c.frontendSpines)),
        spec('Leaves', userSet(c.frontendLeaves)),
        spec('Carries', derived(c.storageFabric === 'converged' ? 'in-band and storage' : 'in-band', undefined, 'the storage fabric switch')),
      ]
    case 'storage-net':
      return [spec('Fabric', userSet(c.storageFabric === 'infiniband' ? 'InfiniBand (NDR)' : 'Ethernet (RoCE)'))]
    case 'oob-net':
      return [spec('SN2201 switches', userSet(c.oobSwitches))]
    case 'compute-fabric':
      if (shape.leavesPerGroup === 0) return []
      return [spec('Design', { value: d.name, status: 'confirmed', source: d.source }), spec('Leaves', ra(shape.row.leaf)), spec('Spines', ra(shape.row.spine))]
    case 'pods':
      return [
        spec(cap(d.serverWord), derived(shape.row.nodes - empty, undefined, `the RA row less ${empty} empty slots`, d.source)),
        spec('Empty slots set', userSet(c.lastSuEmpty)),
      ]
    case 'spares':
      return [spec('Spares', userSet(c.spares))]
    case 'ufm':
      return [spec('Units', userSet(c.ufm === 'ha' ? 2 : 1))]
    case 'vast':
      return [
        spec('CBoxes', userSet(c.cboxes)),
        spec('CNodes', derived(c.cboxes * 4, undefined, `${c.cboxes} CBoxes × 4 CNodes`, 'https://kb.vastdata.com/documentation/docs/vast-cluster-concepts-and-terminology-55.md')),
        spec('DBoxes', userSet(c.dboxes)),
        spec('GPUDirect Storage', userSet(c.gds)),
      ]
    case 'itsm':
      return [spec('Integration', userSet(c.itsm === 'on' ? 'on (Alertmanager webhook)' : 'off (L1 opens the ticket by hand)'))]
    default:
      return []
  }
}

function positionSpec(config: Config, id: string): SpecRow | null {
  const x = layoutOf(config).spot.get(id)
  if (!x) return null
  const rack = rackOf(config, x.rack)?.label ?? x.rack
  const span = x.ru === 0 ? 'beside the U positions, at the rear' : x.ru === 1 ? `U${x.u}` : `U${x.u}-U${x.u + x.ru - 1}`
  return spec('Position', assumed(`${rack}, ${span}`, undefined, RACK_LAYOUT.uPositions.note!))
}

function rackInspection(n: GraphNode, ctx: Ctx): Inspection {
  const c = ctx.config
  const d = fabricShape(c).design
  const facts = RACKS[d.id]
  const P = platformFor(c)
  const role = n.rackRole ?? 'compute'
  const inRack = layoutOf(c).devices.filter((x) => x.rack === n.id)
  const doc = role === 'compute' && P.form === 'nvl72-tray' ? COMPONENT_DOCS.rack : RACK_DOCS[role]
  const rows: SpecRow[] = []
  if (role === 'compute') {
    const servers = inRack.filter((x) => x.kind === 'server').length
    rows.push(
      spec('Design', { value: d.name, status: 'confirmed', source: d.source }),
      spec(`${cap(d.serverWord)} in the rack`, derived(servers, d.serverWord, 'the slots of the rack that the configuration fills', d.source)),
      spec(`${cap(d.serverWord)} in each rack`, d.serversPerRack),
      spec('Rack height', facts.height),
    )
    if (P.form === 'nvl72-tray') rows.push(...nodeSpecs({ ...n, kind: 'rack' }, ctx).filter((s) => s.label !== 'Rack power'))
    else {
      rows.push(spec('Server height', P.rackUnits), spec('PDUs', facts.pdus))
      if (facts.shelves) rows.push(spec('Power shelves', facts.shelves))
    }
    rows.push(spec('Rack power', facts.power), spec('Compute ports at the', portFaceOf(P)), spec('Cooling', userSet(c.cooling)))
    if (servers < d.serversPerRack.value) {
      rows.push(spec('Empty slots', derived(d.serversPerRack.value - servers, 'slots', 'the slots of a partial last SU, or a reserved slot', d.source)))
    }
  } else if (role === 'network' || role === 'spine') {
    const sw = role === 'network' ? d.leafSwitch : d.spineSwitch
    const count = inRack.filter((x) => x.kind === (role === 'network' ? 'leaf' : 'spine')).length
    const watts = sw.typicalPower.value
    rows.push(
      spec('Placement', NETWORK_RACK.placement),
      spec('Switches', derived(count, `× ${sw.model.value}`, 'the switches that the app puts in this rack', d.source)),
      spec('Switch height', sw.rackUnits),
      spec('Rack height', facts.height),
      spec('PDUs', NETWORK_RACK.pdus),
      spec(
        'Rack power',
        watts === null
          ? notSourced('The pages read give no typical power for this switch.')
          : derived(Math.round(count * watts) / 1000, 'kW (typical)', `${count} switches × ${watts} W typical`, sw.typicalPower.source),
      ),
      spec('Ports at the', switchPortFacts(sw).face),
      spec('Port names', switchPortFacts(sw).format),
    )
  } else {
    rows.push(spec('CDU', NVL72.cdu), spec('Placement', RACK_LAYOUT.cdu))
  }
  return { id: n.id, title: n.label, kind: 'rack', summary: doc.summary, specs: rows, doc }
}

function portInspection(n: GraphNode, ctx: Ctx): Inspection {
  const c = ctx.config
  const d = fabricShape(c).design
  const P = platformFor(c)
  const sw = switchOf(c, n.device!)
  const rows: SpecRow[] = [
    spec('Device', derived(n.device!, undefined, 'the device that holds the port')),
    spec('Port', sw ? { ...switchPortFacts(sw).format, value: n.label } : { ...P.computePorts, value: n.label }),
  ]
  if (n.name && P.computeMlx5) rows.push(spec('NIC', { ...P.computeMlx5, value: n.name }))
  const cable = ctx.fabric.edges
    .filter((e) => e.source === n.device || e.target === n.device)
    .map((e) => ({ e, ...cableEnds(c, e) }))
    .find((x) => x.a.id === n.id || x.b.id === n.id)
  if (cable) {
    const far = cable.a.id === n.id ? cable.b : cable.a
    const x = layoutOf(c).spot.get(far.device)
    rows.push(
      spec('Cable', derived(cable.e.id, undefined, 'the compute fabric cable on this port', d.source)),
      spec('Far end', assumed(`${far.device} ${far.label}`, undefined, PORT_ASSIGNMENT_NOTE)),
    )
    if (x) rows.push(spec('Far end position', assumed(`${rackOf(c, x.rack)?.label ?? x.rack}, U${x.u}`, undefined, RACK_LAYOUT.uPositions.note!)))
    rows.push(spec('Cable and optics', cable.e.tier === 'leaf-spine' ? RACKS[d.id].leafSpineCable : RACKS[d.id].nodeLeafCable))
  } else {
    rows.push(spec('Cable', note('No compute fabric cable is on this port in this configuration.')))
  }
  return make(n.id, `${n.device} ${n.label}`, 'port', rows)
}

// The tenant, node state, and phase of a server: values that you set, spread by a fixed rule.
function overlayRows(id: string, ctx: Ctx): SpecRow[] {
  const a = assignments(ctx.config).get(id)
  if (!a) return []
  return [
    spec('Tenant', assumed(a.tenant, undefined, ASSIGN_NOTE, SITE_REQUIREMENTS)),
    spec('Node state', assumed(a.state, undefined, ASSIGN_NOTE, SITE_REQUIREMENTS)),
    spec('Phase', assumed(a.phase, undefined, ASSIGN_NOTE, SITE_REQUIREMENTS)),
  ]
}

// The node services of a platform: the GPU Operator components, and Fabric Manager and NVLSM (HGX) or IMEX (NVL72 tray).
function servicesRow(P: Platform): Fact<string> {
  const names = servicesFor(P).map((s) => NODE_SERVICES[s].label)
  const why =
    P.form === 'nvl72-tray'
      ? 'the GPU Operator components, and IMEX on each compute tray (Fabric Manager runs on the switch trays)'
      : 'the GPU Operator components, Fabric Manager for the NVSwitch chips, and NVLSM on B200 and B300'
  return derived(names.join(', '), undefined, why, GPU_OPERATOR_URL)
}
