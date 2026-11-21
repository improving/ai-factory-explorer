import { useApp } from '../state/store'
import { useUi } from '../state/ui'
import { legendOf } from '../views/overlays'
import { atOf, clockOf } from '../telemetry/events'
import type { HostAt } from '../telemetry/replay'
import { HEALTH_COLORS, LIFECYCLE_COLORS, OWNER_COLORS, PHASE_COLORS, STATE_COLORS, TENANT_COLORS, UAT_COLOR } from '../views/palette'

const swatch = (cls: string): string => {
  if (cls.startsWith('ov-own-')) return OWNER_COLORS[cls.slice('ov-own-'.length)] ?? 'transparent'
  if (cls === 'ov-ten-uat') return UAT_COLOR
  if (cls.startsWith('ov-ten-')) return TENANT_COLORS[Number(cls.slice('ov-ten-'.length)) - 1] ?? 'transparent'
  if (cls.startsWith('ov-st-')) return STATE_COLORS[cls.slice('ov-st-'.length)] ?? 'transparent'
  if (cls.startsWith('ov-ph-')) return PHASE_COLORS[Number(cls.slice('ov-ph-'.length)) - 1] ?? 'transparent'
  if (cls.startsWith('ov-lc-')) return LIFECYCLE_COLORS[cls.slice('ov-lc-'.length)] ?? 'transparent'
  if (cls.startsWith('ov-hl-')) return HEALTH_COLORS[cls.slice('ov-hl-'.length)] ?? 'transparent'
  return 'transparent'
}

// The legend of the colour overlay. The tenant, state, and phase values are assumed (Overlays panel).
// With the time view on, the counts are the counts at the cursor.
export function OverlayLegend({ at }: { at: Map<string, HostAt> | null }) {
  const { config, overlay, time } = useApp()
  const items = legendOf(config, overlay.color, at)
  const open = useUi((u) => u.legend)
  if (items.length === 0) return null
  if (!open)
    return (
      <button type="button" className="legend-toggle" aria-expanded={false} onClick={() => useUi.setState({ legend: true })}>
        Legend
      </button>
    )
  return (
    <div className="overlay-legend" data-testid="overlay-legend">
      <button type="button" className="legend-toggle in-card" aria-expanded onClick={() => useUi.setState({ legend: false })}>
        Hide
      </button>
      {items.map((i) => (
        <div key={i.label}>
          <span className="swatch" style={{ background: swatch(i.cls) }} />
          {i.label}
          {i.count === undefined ? '' : `: ${i.count}`}
        </div>
      ))}
      {overlay.color === 'tenant' && (
        <p className="note">Isolation: InfiniBand PKeys, VLAN and VRF on Ethernet, DPU-based isolation, and VAST VIP pools and views (the concepts checklist, and the VAST documentation).</p>
      )}
      {overlay.color === 'lifecycle' && <p className="note">The counts model four states. A degraded host stays available; the Health overlay shows its warning. The other five states are in the inspector, on the Lifecycle tab.</p>}
      {overlay.color === 'health' && <p className="note">The verdict is a mapping from the node state, not a check result; the check catalogue is in the health validation lab. A host in maintenance has no verdict.</p>}
      {time && <p className="note" data-testid="legend-time">The state at {clockOf(atOf(time.window, time.cursor))}: the events of the window are in the bar above the canvas.</p>}
      {overlay.color !== 'owner' && <p className="note">Assumed: you set the counts; open an SU to see its servers.</p>}
    </div>
  )
}
