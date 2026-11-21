import type { ViewState } from '../state/transitions'

// The text of what a double-click does on a part (the double-click handler of Canvas.tsx), or null.
export function openHint(kind: string, role: string | undefined, level: ViewState['level']): string | null {
  if (kind === 'server') return 'Double-click to open'
  if (kind === 'su') return 'Double-click to open or close'
  if (kind === 'block' && (role === 'pods' || role === 'compute-fabric')) return 'Double-click to open the fabric'
  if (kind === 'rack' && level === 'racks') return 'Double-click to show its ports'
  return null
}
