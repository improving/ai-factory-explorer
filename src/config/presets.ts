import type { Config } from './config'

export type Preset = { id: string; label: string; config: Partial<Config> }

// A preset sets every switch; then the user changes any one of them. No preset has a site scale.
export const PRESETS: Preset[] = [
  {
    id: 'superpod-b300-xdr',
    label: 'DGX SuperPOD B300, XDR InfiniBand',
    config: { platform: 'b300', build: 'dgx', fabric: 'ib-xdr', design: 'b300-xdr', topology: 'rail', planes: 'single', suCount: 1 },
  },
  {
    id: 'superpod-b300-spx',
    label: 'DGX SuperPOD B300, Spectrum-X Ethernet',
    config: { platform: 'b300', build: 'dgx', fabric: 'spectrum-x', design: 'b300-spx', topology: 'rail', planes: 'dual', suCount: 4 },
  },
  {
    id: 'enterprise-b300',
    label: 'Enterprise RA, Dell HGX B300, Spectrum-X',
    config: { platform: 'b300', build: 'oem-hgx', fabric: 'spectrum-x', design: 'ent-b300', topology: 'rail', planes: 'dual', suCount: 8 },
  },
  {
    id: 'superpod-h100',
    label: 'DGX SuperPOD H100, NDR InfiniBand',
    config: { platform: 'h100', build: 'dgx', fabric: 'ib-ndr', design: 'ndr-h100', topology: 'rail', planes: 'single', suCount: 4 },
  },
  {
    id: 'superpod-b200',
    label: 'DGX SuperPOD B200, NDR InfiniBand',
    config: { platform: 'b200', build: 'dgx', fabric: 'ib-ndr', design: 'ndr-b200', topology: 'rail', planes: 'single', suCount: 1 },
  },
  {
    id: 'superpod-gb300',
    label: 'DGX SuperPOD GB300 NVL72, XDR InfiniBand',
    config: { platform: 'gb300-nvl72', build: 'dgx', fabric: 'ib-xdr', design: 'gb300-xdr', topology: 'rail', planes: 'single', suCount: 2 },
  },
  {
    id: 'rack-gb200',
    label: 'GB200 NVL72, one rack',
    config: { platform: 'gb200-nvl72', build: 'dgx', fabric: 'ib-ndr', design: 'gb200-rack', topology: 'rail', planes: 'single', suCount: 1 },
  },
  {
    id: 'site-parts',
    label: 'Site parts: Dell HGX B300 on XDR InfiniBand (no scale)',
    config: { platform: 'b300', build: 'oem-hgx', fabric: 'ib-xdr', design: 'b300-xdr', topology: 'rail', planes: 'single', suCount: 1 },
  },
]

// The preset whose keys equal the configuration, at any scale. Panels 4-6 do not change the preset.
export function presetOf(config: Config): Preset | undefined {
  return PRESETS.find((p) => (Object.keys(p.config) as (keyof Config)[]).every((k) => k === 'suCount' || p.config[k] === config[k]))
}
