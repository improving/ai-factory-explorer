import { useLayoutEffect, useMemo, useRef } from 'react'
import { impactOf } from '../simulate/impact'
import { SIM_SCENARIOS, activeSimStep } from '../simulate/scenarios'
import { useLayout } from '../state/layout'
import { useApp } from '../state/store'
import { applySimScenario, resetFailures, setDiagView, setSimStep } from '../state/transitions'

// The controls of Simulate mode: a scenario of the library, the number of failures and the severity, the bottom
// panel (the impact or the diagnosis), and Reset.
export function SimBar() {
  const { mode, config, failures, diag, set } = useApp()
  const box = useRef<HTMLDivElement>(null)
  const backBtn = useRef<HTMLButtonElement>(null)
  const nextBtn = useRef<HTMLButtonElement>(null)
  // The bar can wrap: its height goes to the layout, so the canvas starts below it (as the trace bar).
  useLayoutEffect(() => {
    const el = box.current
    const setBar = useLayout.getState().setBar
    if (!el) return
    const measure = () => setBar(Math.ceil(el.getBoundingClientRect().height))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      ro.disconnect()
      setBar(0)
    }
  }, [mode])
  const impact = useMemo(() => (failures.length > 0 ? impactOf(config, failures) : null), [config, failures])
  if (mode !== 'simulate') return null
  const active = activeSimStep(failures, config)
  const status = impact
    ? `${failures.length} failure${failures.length === 1 ? '' : 's'}: P${impact.severity.level}, ${impact.affected} GPU${impact.affected === 1 ? '' : 's'} out, ${impact.degraded} degraded`
    : 'Select a part, then press Fail in the inspector, or select a scenario.'
  return (
    <div className="tracebar" data-testid="simbar" ref={box}>
      <select data-testid="sim-scenario" value={active?.scenario.id ?? ''} onChange={(e) => e.target.value && set((s) => applySimScenario(s, e.target.value))}>
        <option value="">Scenario…</option>
        {SIM_SCENARIOS.map((sc) => (
          <option key={sc.id} value={sc.id}>
            {sc.label}
          </option>
        ))}
      </select>
      <button type="button" data-testid="sim-reset" disabled={failures.length === 0} onClick={() => set(resetFailures)}>
        Reset
      </button>
      <span className="modes" role="radiogroup" aria-label="Bottom panel">
        {(['impact', 'chain'] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={diag.view === v} data-testid={`diag-view-${v}`} onClick={() => set((s) => setDiagView(s, v))}>
            {v === 'impact' ? 'Impact' : 'Diagnose'}
          </button>
        ))}
      </span>
      <span className="status-line" data-testid="sim-status" aria-live="polite" title={status}>
        {status}
      </span>
      {active?.scenario.narrative && (
        <p className="sim-story" data-testid="sim-story">
          {active.scenario.narrative.join(' ')}
        </p>
      )}
      {active && active.step !== null && (
        <span className="sim-steps">
          <button
            type="button"
            data-testid="sim-step-back"
            ref={backBtn}
            disabled={active.step === 0}
            onClick={() => {
              // The button turns disabled at step 1 and loses the focus: the focus goes to the other button first.
              if (active.step === 1) nextBtn.current?.focus()
              set((s) => setSimStep(s, active.step! - 1))
            }}
          >
            Back
          </button>
          <span data-testid="sim-step" aria-live="polite">
            Step {active.step + 1} of {active.scenario.steps!.length}: {active.scenario.steps![active.step]!.note}
          </span>
          <button
            type="button"
            data-testid="sim-step-next"
            ref={nextBtn}
            disabled={active.step === active.scenario.steps!.length - 1}
            onClick={() => {
              if (active.step === active.scenario.steps!.length - 2) backBtn.current?.focus()
              set((s) => setSimStep(s, active.step! + 1))
            }}
          >
            Next
          </button>
        </span>
      )}
    </div>
  )
}
