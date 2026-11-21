import { LEVEL_LABEL, type Plan } from '../schedule/plan'
import { openGuide, stepNumber } from '../state/guide'
import { useApp } from '../state/store'

const MARK = { pass: 'ok', blocked: 'blocked', note: 'note' } as const

// The decision path of the job, the domains, and the segments. It is the "why is it pending?" answer.
export function SchedulePanel({ plan }: { plan: Plan }) {
  const { set } = useApp()
  const n = stepNumber('schedule', 'A placed job')
  return (
    <section className="portmap sched-panel" data-testid="sched-panel">
      <h2>{plan.ok ? 'Placed' : 'Pending'}</h2>
      <p className="note">
        {plan.ok
          ? `${plan.job.gpus} GPUs on ${plan.chosen.length} servers; the minimum gang is ${plan.job.gang === 'all' ? plan.job.gpus : Math.ceil(plan.job.gpus / 2)}.`
          : plan.reason}
      </p>
      <table className="specs sched-steps">
        <thead>
          <tr>
            <th>Step</th>
            <th>Observation</th>
          </tr>
        </thead>
        <tbody>
          {plan.steps.map((s) => (
            <tr key={s.id} data-testid={`sched-step-${s.id}`} className={MARK[s.conclusion]}>
              <th>{s.label}</th>
              <td>{s.observation}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {plan.domains.length > 0 && (
        <>
          <h3>Domains, by free GPUs</h3>
          <table className="specs">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Free</th>
              </tr>
            </thead>
            <tbody>
              {plan.domains.map((d) => (
                <tr key={d.key}>
                  <th>{d.label}</th>
                  <td>{d.free}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {plan.segments.length > 1 && (
        <>
          <h3>Segments</h3>
          <ul>
            {plan.segments.map((s) => (
              <li key={s.index}>
                Segment {s.index}: {s.gpus} GPUs in {s.label} ({s.servers.length} servers).
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="note">
        The queue percentages are a demo model: {LEVEL_LABEL[plan.job.required]} is the outer boundary, and {LEVEL_LABEL[plan.job.preferred]} is where the job packs. The site sets its own queues and quotas; the rules are the scheduler rules.
      </p>
      {n !== null && (
        <button type="button" data-testid="sched-guide" title="Open the guide at this step" onClick={() => set((s) => openGuide(s, 'schedule', n))}>
          Guide: see why a job waits
        </button>
      )}

    </section>
  )
}
