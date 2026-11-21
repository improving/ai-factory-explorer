import { useApp } from '../state/store'
import { DEFAULT_TIME, setColor, setTelemetry, setTime, toggleLayer } from '../state/transitions'
import { COLOR_OVERLAYS, LAYERS, type ColorOverlay } from '../views/overlays'

// Panel 7: one colour overlay, the network layers, the telemetry flow, and the time view.
export function OverlayControls() {
  const { overlay, time, set } = useApp()
  return (
    <>
      <div className="field">
        <label>
          <span>Colour overlay</span>
          <select data-testid="overlay-color" value={overlay.color} onChange={(e) => set((s) => setColor(s, e.target.value as ColorOverlay))}>
            {COLOR_OVERLAYS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="field layers">
        <legend>Network layers</legend>
        {LAYERS.map((l) => (
          <label key={l.id}>
            <input type="checkbox" data-testid={`layer-${l.id}`} checked={!overlay.hidden.includes(l.id)} onChange={() => set((s) => toggleLayer(s, l.id))} /> {l.label}
          </label>
        ))}
      </fieldset>
      <label className="field">
        <input type="checkbox" data-testid="overlay-telemetry" checked={overlay.telemetry} onChange={(e) => set((s) => setTelemetry(s, e.target.checked))} /> Telemetry flow (in
        the factory overview)
      </label>
      <label className="field">
        <input
          type="checkbox"
          data-testid="overlay-time"
          checked={time !== null}
          onChange={(e) =>
            set((s) => {
              const next = setTime(s, e.target.checked ? DEFAULT_TIME : null)
              // A time view with no colour shows nothing: it picks the state overlay.
              return e.target.checked && s.overlay.color === 'none' ? setColor(next, 'state') : next
            })
          }
        />{' '}
        Time of day (the last 7 days, in Explore mode)
      </label>
    </>
  )
}
