import { useEffect, useMemo, useState } from 'react'
import { NODE_CHOICES, RATE_CHOICES, SEED_MAX, TICKS, clockOf, queueName, snapAt, tickAt, type LoadRun } from '../schedule/load'
import { QUEUES } from '../schedule/plan'
import { openGuide, stepNumber } from '../state/guide'
import { useApp } from '../state/store'
import { setLoadCursor, setLoadSpec } from '../state/transitions'
import { LoadChart } from './LoadChart'
import { ScaleStrip } from './ScaleStrip'
import { PauseIcon, PlayIcon } from './icons'

const num = (n: number) => n.toLocaleString('en-US')
const STEP = Math.round(TICKS / 200) // Play: the whole run in about 20 seconds
const QUEUE_COLORS = ['#0072B2', '#D55E00', '#009E73']

// The load of the fleet over 30 minutes: the pending queue, the scheduling latency, the evictions, and the tiles of
// the racks. The run is a function of the seed, so a link gives the same numbers.
export function LoadPanel({ run }: { run: LoadRun }) {
  const { load, set } = useApp()
  const [playing, setPlaying] = useState(false)
  const cursor = load.cursor
  const tick = tickAt(run, cursor)
  const snap = snapAt(run, cursor)
  const n = stepNumber('schedule', 'The load at scale')
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => set((s) => setLoadCursor(s, s.load.cursor + STEP)), 100)
    return () => clearInterval(id)
  }, [playing, set])
  useEffect(() => {
    if (playing && cursor >= TICKS - 1) setPlaying(false)
  }, [playing, cursor])
  const play = () => {
    if (cursor >= TICKS - 1) set((s) => setLoadCursor(s, 0))
    setPlaying((p) => !p)
  }
  const pending = tick.pending['team-a'] + tick.pending['team-b'] + tick.pending['team-c']
  const pendingJobs = tick.pendingJobs['team-a'] + tick.pendingJobs['team-b'] + tick.pendingJobs['team-c']
  const allocated = tick.allocated['team-a'] + tick.allocated['team-b'] + tick.allocated['team-c']
  const series = useMemo(
    () =>
      QUEUES.map((q, i) => ({
        id: q.id,
        label: q.label,
        color: QUEUE_COLORS[i % QUEUE_COLORS.length]!,
        values: run.ticks.map((t) => t.pending[q.id]),
      })),
    [run],
  )
  const latency = useMemo(() => [{ id: 'p95', label: 'p95 latency', color: QUEUE_COLORS[1]!, values: run.ticks.map((t) => t.latency) }], [run])
  return (
    <section className="portmap load-panel" data-testid="load-panel">
      <div className="load-head">
        <label className="inline">
          Servers
          <select data-testid="load-nodes" value={run.spec.nodes} onChange={(e) => set((s) => setLoadSpec(s, { nodes: Number(e.target.value) }))}>
            {NODE_CHOICES.map((v) => (
              <option key={v} value={v}>
                {num(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          Arrivals
          <select data-testid="load-rate" value={run.spec.perMinute} onChange={(e) => set((s) => setLoadSpec(s, { perMinute: Number(e.target.value) }))}>
            {RATE_CHOICES.map((v) => (
              <option key={v} value={v}>
                {v} a minute
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          Seed
          <input data-testid="load-seed" type="number" min={0} max={SEED_MAX} value={run.spec.seed} onChange={(e) => set((s) => setLoadSpec(s, { seed: Number(e.target.value) }))} />
        </label>
        <button type="button" className="play" data-testid="load-play" aria-pressed={playing} onClick={play}>
          {playing ? <PauseIcon /> : <PlayIcon />} {playing ? 'Pause' : cursor >= TICKS - 1 ? 'Play again' : 'Play'}
        </button>
        <label className="inline load-slider">
          At
          <input data-testid="load-cursor" type="range" min={0} max={TICKS - 1} step={1} value={cursor} aria-label="The second of the run" onChange={(e) => set((s) => setLoadCursor(s, Number(e.target.value)))} />
          <b data-testid="load-clock">{clockOf(tick.t)}</b>
        </label>
      </div>

      <dl className="load-numbers" data-testid="load-numbers">
        <div>
          <dt>Free GPUs</dt>
          <dd>
            {num(tick.free)} of {num(run.fleet.total)}
          </dd>
        </div>
        <div>
          <dt>Running</dt>
          <dd>{num(allocated)}</dd>
        </div>
        <div>
          <dt>Pending</dt>
          <dd>
            {num(pending)} <span className="muted">in {num(pendingJobs)} jobs</span>
          </dd>
        </div>
        <div>
          <dt>Placed a second</dt>
          <dd>{num(tick.placed)}</dd>
        </div>
        <div>
          <dt>p95 a second</dt>
          <dd>{tick.latency === null ? '—' : `${num(Math.round(tick.latency / 100) / 10)} s`}</dd>
        </div>
        <div>
          <dt>Evicted a second</dt>
          <dd>{num(tick.evicted)}</dd>
        </div>
        <div>
          <dt>Evicted, run</dt>
          <dd>{num(run.evicted)}</dd>
        </div>
        <div>
          <dt>Most pending</dt>
          <dd>
            {num(run.maxPending)} <span className="muted">at {clockOf(run.maxPendingAt)}</span>
          </dd>
        </div>
        <div>
          <dt>p95, run</dt>
          <dd>{run.p95 === null ? '—' : `${num(Math.round(run.p95 / 100) / 10)} s`}</dd>
        </div>
        <div>
          <dt>Placed, run</dt>
          <dd>
            {num(run.placed)} <span className="muted">/ {num(run.jobs)}</span>
          </dd>
        </div>
      </dl>

      <div className="load-charts">
        <figure>
          <figcaption>
            Pending GPUs
            <span className="load-key">
              {QUEUES.map((q, i) => (
                <span key={q.id}>
                  <i style={{ background: QUEUE_COLORS[i % QUEUE_COLORS.length] }} /> {q.label}
                </span>
              ))}
            </span>
          </figcaption>
          <LoadChart series={series} cursor={cursor} height={84} unit="GPUs" format={num} />
        </figure>
        <figure>
          <figcaption>p95 latency, each second</figcaption>
          <LoadChart series={latency} cursor={cursor} height={84} unit="ms" format={num} />
        </figure>
      </div>

      <h3>Each rack of the fleet, at {clockOf(tick.t)}</h3>
      <ScaleStrip free={snap} gpus={run.fleet.gpusPerRack} />

      <h3>The queues at {clockOf(tick.t)}</h3>
      <table className="specs load-table" data-testid="load-queues">
        <thead>
          <tr>
            <th>Queue</th>
            <th>Quota</th>
            <th>Limit</th>
            <th>Allocated</th>
            <th>Pending</th>
          </tr>
        </thead>
        <tbody>
          {QUEUES.map((q) => (
            <tr key={q.id} data-testid={`load-queue-${q.id}`} className={tick.pending[q.id] > 0 ? 'warn' : ''}>
              <th>{queueName(q.id)}</th>
              <td>{num(run.quota[q.id]!)}</td>
              <td>{num(run.limit[q.id]!)}</td>
              <td>{num(tick.allocated[q.id])}</td>
              <td>{num(tick.pending[q.id])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="note" data-testid="load-note">
        The metrics are the queue contract metrics: the pending GPUs and the allocation of a queue (<code>queue_allocated_gpus</code>), the latency of a placement (<code>e2e_scheduling_latency_milliseconds</code>, the p95 of each second), and the evictions (<code>pod_group_evicted_pods_total</code>, one pod group for each job).
        The arrival rate, the durations, and the mix of the jobs are a model (assumed): the sources give the rules of the scheduler, not the load of a site.
        The rules are the scheduler rules: non-preemptible work stays in quota, preemption is inside one queue, and a reclaim takes pods of a queue that is above its quota.
        The tiles are the fleet of the model, not the fabric above: the servers control sets the fleet, and the canvas keeps the configuration of the site.
      </p>
      {n !== null && (
        <button type="button" data-testid="load-guide" title="Open the guide at this step" onClick={() => set((s) => openGuide(s, 'schedule', n))}>
          Guide: see why a job waits
        </button>
      )}
    </section>
  )
}
