import { DESIGNS, designById, raRow } from '../catalog/designs'
import { platformFor } from '../catalog/platforms'
import { KEYS, choicesFor, type Config } from './config'

export type OptionState = { enabled: true } | { enabled: false; reason: string }

export const OEM_B300_ONLY = 'This version has an OEM build for the B300 only (Dell XE9780).'
export const DUAL_PLANE_XDR =
  'The XDR SuperPOD RA has one 800 Gb/s cable from each GPU NIC to its rail leaf (576 node-leaf cables for 72 servers). ' +
  'For dual plane, select a Spectrum-X design.'
export const DUAL_ONLY = 'The RA tables of this design are for dual plane.'
export const NO_FABRIC = 'This design is one rack with no scale-out fabric, so it has no leaf switches.'
export const UFM_NEEDED = 'An InfiniBand fabric needs a subnet manager; the RA has 2 UFM appliances.'
export const NO_UFM = 'This design has no InfiniBand fabric for a UFM.'
export const NVL72_LIQUID = 'The NVL72 rack is liquid-cooled.'
export const DGX_AIR = 'The DGX user guide gives an air-cooled system.'
export const RAFAY_NEEDS_K8S = 'Rafay operates Kubernetes clusters; with Slurm only there is no Rafay.'
export const K8S_NEEDS_RAFAY = 'Kubernetes through Rafay needs a controller.'
export const KUBEVIRT_NEEDS_K8S = 'KubeVirt runs on Kubernetes.'
export const VIP_NEEDS_CONTROLLER = 'The control-plane VIP serves the self-hosted controller.'
export const HGX_ONLY = 'The Enterprise RA is for NVIDIA-Certified HGX servers: select the OEM build.'

const ON: OptionState = { enabled: true }
const off = (reason: string): OptionState => ({ enabled: false, reason })
export const label = <K extends keyof Config>(config: Config, key: K, value: Config[K]) =>
  choicesFor(config, key).find((c) => c.value === value)?.label ?? String(value)

// Says if one value of one switch is valid with the switches before it (see KEYS). The UI shows an
// "off" value as disabled, with its reason; the app never holds a configuration that is not valid.
export function optionState<K extends keyof Config>(config: Config, key: K, value: Config[K]): OptionState {
  switch (key) {
    case 'platform':
      return DESIGNS.some((d) => d.platforms.includes(value as Config['platform'])) ? ON : off('No design in this version uses this platform.')
    case 'build':
      return value === 'dgx' || config.platform === 'b300' ? ON : off(OEM_B300_ONLY)
    case 'fabric':
      return DESIGNS.some((d) => d.platforms.includes(config.platform) && d.fabric === value)
        ? ON
        : off(`No reference design in this version uses this fabric with the ${label(config, 'platform', config.platform)}.`)
    case 'design': {
      const d = designById(value as Config['design'])
      if (d.platforms.includes(config.platform) && d.fabric === config.fabric) {
        return d.builds && !d.builds.includes(config.build) ? off(HGX_ONLY) : ON
      }
      const platforms = d.platforms.map((p) => label(config, 'platform', p)).join(', ')
      return off(`This design is for the ${platforms} with ${label(config, 'fabric', d.fabric)}.`)
    }
    case 'topology':
      return value === 'tor' && designById(config.design).leafRule.kind === 'none' ? off(NO_FABRIC) : ON
    case 'planes': {
      const d = designById(config.design)
      if (value === d.planes) return ON
      if (d.id === 'b300-xdr') return off(DUAL_PLANE_XDR)
      return off(d.planes === 'dual' ? DUAL_ONLY : 'This design has one plane.')
    }
    case 'suCount':
      return raRow(designById(config.design), value as number) ? ON : off(`The RA table has no row for ${String(value)} SU.`)
    case 'lastSuEmpty':
      return choicesFor(config, 'lastSuEmpty').some((c) => c.value === value)
        ? ON
        : off('Leave whole racks empty: a multiple of the servers in one rack, and at least one rack in use.')
    case 'ufm': {
      const d = designById(config.design)
      const ib = d.fabric !== 'spectrum-x' && d.leafRule.kind !== 'none'
      if (value === 'none') return ib ? off(UFM_NEEDED) : ON
      return ib ? ON : off(NO_UFM)
    }
    case 'cooling': {
      const p = platformFor(config)
      if (p.form === 'nvl72-tray') return value === 'liquid' ? ON : off(NVL72_LIQUID)
      if (String(p.cooling.value ?? '').startsWith('air,')) return value === 'air' ? ON : off(DGX_AIR)
      return ON
    }
    case 'rafay':
      if (config.orchestration === 'slurm') return value === 'none' ? ON : off(RAFAY_NEEDS_K8S)
      return value === 'none' ? off(K8S_NEEDS_RAFAY) : ON
    case 'vms':
      return value === 'kubevirt' && config.orchestration === 'slurm' ? off(KUBEVIRT_NEEDS_K8S) : ON
    case 'lb':
      if (config.rafay === 'self-hosted') return ON
      return value === 'none' ? ON : off(VIP_NEEDS_CONTROLLER)
    case 'spares':
    case 'storageFabric':
    case 'frontendSpines':
    case 'frontendLeaves':
    case 'oobSwitches':
    case 'automation':
    case 'cboxes':
    case 'dboxes':
    case 'gds':
    case 'ceph':
    case 'linstor':
    case 'clusterManager':
    case 'orchestration':
    case 'edgeRouters':
    case 'tenants':
    case 'uat':
    case 'allocated':
    case 'degraded':
    case 'quarantined':
    case 'maintenance':
    case 'phases':
    case 'p1Threshold':
    case 'p2Threshold':
    case 'itsm':
    case 'uplink':
      return choicesFor(config, key).some((c) => c.value === value) ? ON : off('Not a value of this switch.')
  }
  return off('Unknown switch.')
}

export function problems(config: Config): string[] {
  return KEYS.flatMap((key) => {
    const state = optionState(config, key, config[key])
    return state.enabled ? [] : [`${key}: ${state.reason}`]
  })
}

export function isValid(config: Config): boolean {
  return problems(config).length === 0
}

// Applies a patch, then repairs each switch after it, in KEYS order: a switch that is no longer valid
// takes its first valid value. A patched value that is not valid refuses the whole patch (null).
export function withPatch(config: Config, patch: Partial<Config>): Config | null {
  let next: Config = { ...config, ...patch }
  for (const key of KEYS) {
    if (optionState(next, key, next[key]).enabled) continue
    if (key in patch) return null
    const first = choicesFor(next, key).find((c) => optionState(next, key, c.value).enabled)
    if (!first) return null
    next = { ...next, [key]: first.value } as Config
  }
  // A new design starts with a full last SU, unless the patch sets the empty slots: an absolute
  // count would otherwise stay and silently empty racks of the new design.
  if (next.design !== config.design && !('lastSuEmpty' in patch)) next = { ...next, lastSuEmpty: 0 }
  return next
}
