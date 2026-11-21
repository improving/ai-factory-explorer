import { useLayoutEffect, useMemo, useRef } from 'react'
import { planOf, GANG_LABEL, LEVEL_LABEL, PRIORITY_LABEL, QUEUES, type Gang, type Level, type Priority, type QueueId } from '../schedule/plan'
import { clockOf, tickAt, type LoadRun } from '../schedule/load'
import { useLayout } from '../state/layout'
import { useApp } from '../state/store'
import { setSched, setSchedView } from '../state/transitions'

const LEVELS: Level[] = ['any', 'su', 'rack', 'node']
const num = (n: number) => n.toLocaleString('en-US')

// The controls of Schedule mode: the decision path of one job (the queue, the job, the gang, the topology, and the
// segments), or the load of the fleet.
export function ScheduleBar({ run }: { run: LoadRun | null }) {
  const { mode, config, sched, load, set } = useApp()
  const box = useRef<HTMLDivElement>(null)
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
  const decision = mode === 'schedule' && load.view === 'decision'
  const plan = useMemo(() => (decision ? planOf(config, sched) : null), [decision, config, sched])
  if (mode !== 'schedule') return null
  const loadOn = load.view === 'load'
  const tick = run ? tickAt(run, load.cursor) : null
  const pending = tick ? tick.pending['team-a'] + tick.pending['team-b'] + tick.pending['team-c'] : 0
  const status = loadOn
    ? tick && run
      ? `${num(run.fleet.servers)} servers, ${num(run.fleet.total)} GPUs; ${run.spec.perMinute} jobs a minute. At ${clockOf(tick.t)}: ${num(pending)} GPUs wait, ${num(tick.placed)} placed in this second.`
      : 'The load of the fleet.'
    : plan!.ok
      ? `Placed ${plan!.job.gpus} GPUs on ${plan!.chosen.length} servers: ${plan!.segments.map((s) => s.label).join(', ')}.`
      : `Pending: ${plan!.reason}`
  return (
    <div className="tracebar schedbar" data-testid="schedbar" ref={box}>
      <span className="modes" role="radiogroup" aria-label="Schedule view">
        {(['decision', 'load'] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={load.view === v} data-testid={`sched-view-${v}`} onClick={() => set((s) => setSchedView(s, v))}>
            {v === 'decision' ? 'Decision' : 'Load'}
          </button>
        ))}
      </span>
      {!loadOn && (
        <>
          <label className="inline">
            Queue
            <select data-testid="sched-queue" value={sched.queue} onChange={(e) => set((s) => setSched(s, { queue: e.target.value as QueueId }))}>
              {QUEUES.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            GPUs
            <input data-testid="sched-gpus" type="number" min={1} max={4096} step={4} value={sched.gpus} onChange={(e) => set((s) => setSched(s, { gpus: Number(e.target.value) }))} />
          </label>
          <label className="inline">
            Priority
            <select data-testid="sched-priority" value={sched.priority} onChange={(e) => set((s) => setSched(s, { priority: e.target.value as Priority }))}>
              {(['build', 'train'] as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            Gang
            <select data-testid="sched-gang" value={sched.gang} onChange={(e) => set((s) => setSched(s, { gang: e.target.value as Gang }))}>
              {(['all', 'half'] as Gang[]).map((g) => (
                <option key={g} value={g}>
                  {GANG_LABEL[g]}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            Required
            <select data-testid="sched-required" value={sched.required} onChange={(e) => set((s) => setSched(s, { required: e.target.value as Level }))}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            Preferred
            <select data-testid="sched-preferred" value={sched.preferred} onChange={(e) => set((s) => setSched(s, { preferred: e.target.value as Level }))}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            Segments
            <input data-testid="sched-segments" type="number" min={1} max={4} value={sched.segments} onChange={(e) => set((s) => setSched(s, { segments: Number(e.target.value) }))} />
          </label>
        </>
      )}
      <span className="status-line" data-testid="sched-result" aria-live="polite" title={status}>
        {status}
      </span>
    </div>
  )
}
