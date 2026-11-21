// Okabe-Ito colours, which people with colour blindness can tell apart; grey for rail 7.
// The leaf labels also name the rail, so the colour is never the only signal.
export const RAIL_COLORS = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#8C8C8C'] as const

export const railColor = (rail: number): string => RAIL_COLORS[rail % RAIL_COLORS.length]!

export type Theme = 'light' | 'dark'

export type ThemeColors = {
  bg: string
  fg: string
  muted: string
  box: string
  boxBorder: string
  nvlink: string
  pcie: string
  converged: string
  oob: string
  select: string
}

export const THEMES: Record<Theme, ThemeColors> = {
  light: {
    bg: '#ffffff',
    fg: '#1d2430',
    muted: '#8a94a3',
    box: '#eef2f7',
    boxBorder: '#9aa5b4',
    nvlink: '#2e7d32',
    pcie: '#7a8699',
    converged: '#1565c0',
    oob: '#8d6e63',
    select: '#d81b60',
  },
  dark: {
    bg: '#14181f',
    fg: '#e6e9ef',
    muted: '#7d8796',
    box: '#222934',
    boxBorder: '#4a5566',
    nvlink: '#66bb6a',
    pcie: '#9aa5b4',
    converged: '#64b5f6',
    oob: '#bcaaa4',
    select: '#f06292',
  },
}

export function currentTheme(): Theme {
  // The theme switch of the header sets data-theme; Auto (no attribute) follows the system.
  const set = typeof document === 'undefined' ? undefined : document.documentElement.dataset.theme
  if (set === 'light' || set === 'dark') return set
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// The fills of the colour overlays. They use the fill, so they do not hide the rail colours (border) or the selection (halo).
export const OWNER_COLORS: Record<string, string> = {
  partner: '#4C72B0',
  facility: '#E69F00',
  enterprise: '#7E57C2',
  rafay: '#009E73',
  vast: '#CC79A7',
  oem: '#8C8C8C',
  workload: '#56B4E9',
  'customer-it': '#D55E00',
}
export const TENANT_COLORS = ['#4C72B0', '#DD8452', '#55A868', '#C44E52', '#8172B3', '#937860', '#DA8BC3', '#8C8C8C'] as const
export const UAT_COLOR = '#CCB974'
export const STATE_COLORS: Record<string, string> = {
  available: '#55A868',
  allocated: '#4C72B0',
  degraded: '#DD8452',
  quarantined: '#C44E52',
  maintenance: '#8C8C8C',
  spare: '#64B5CD',
}
export const PHASE_COLORS = ['#4C72B0', '#CCB974'] as const
// The lifecycle overlay: the four states that the counts model, and the spare pool.
export const LIFECYCLE_COLORS: Record<string, string> = {
  available: '#55A868',
  'in-use': '#4C72B0',
  quarantined: '#C44E52',
  'in-repair': '#8C8C8C',
  spare: '#64B5CD',
}
// The health overlay: the five severities, a host in maintenance (no verdict), and the spare pool.
export const HEALTH_COLORS: Record<string, string> = {
  pass: '#55A868',
  info: '#56B4E9',
  warning: '#DD8452',
  critical: '#C44E52',
  unknown: '#8C8C8C',
  none: '#B0B7C3',
  spare: '#64B5CD',
}
