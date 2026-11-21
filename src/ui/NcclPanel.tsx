import { useMemo } from 'react'
import { COLL_FACTS } from '../catalog/collectives'
import { assess, formatSize, parseNcclTests, readerLimit, type NcclRun } from '../collectives/ncclTests'
import { COLLECTIVES, COLLECTIVE_LABEL, ALGORITHM_LABEL, type Collective } from '../collectives/schedule'
import { scopeLabel } from '../collectives/scope'
import { thresholdOf, useReader } from '../state/reader'
import { useApp } from '../state/store'
import { NcclChart } from './NcclChart'
import { SourceRef } from './SourceRef'

const RB02 = 'runbooks/RB-02-nccl-init-hang-slow-transport.md'
const RB03 = 'runbooks/RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md'
const link = (path: string, label: string) => <SourceRef source={path}>{label}</SourceRef>

// The result of a run: the summary, the limit (of the model, or typed), the threshold, the marks, the chart, and the table.
function Result({ run }: { run: NcclRun }) {
  const { config } = useApp()
  const r = useReader()
  const collective = run.collective ?? r.collective
  const model = collective ? readerLimit(config, run, collective) : null
  const typed = Number(r.limit)
  const limit = model ? model.limitGBps : typed > 0 ? typed : null
  const threshold = thresholdOf(r.threshold)
  const a = assess(run, limit, threshold)
  return (
    <>
      <p data-testid="nccl-summary">
        {run.testName ?? 'The test is not named'}: {run.ranks} ranks on {run.hosts.length} hosts
        {run.avgBusbw !== null ? `; the average busbw is ${run.avgBusbw} GB/s` : ''}
        {run.outOfBounds ? `; out of bounds values: ${run.outOfBounds.count} ${run.outOfBounds.ok ? 'OK' : 'FAILED'}` : ''}.
      </p>
      <div className="reader-controls">
        {run.testName === null && (
          <label>
            Collective{' '}
            <select data-testid="nccl-collective" value={r.collective ?? ''} onChange={(e) => useReader.setState({ collective: (e.target.value || null) as Collective | null })}>
              <option value="">Select…</option>
              {COLLECTIVES.map((c) => (
                <option key={c} value={c}>
                  {COLLECTIVE_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
        )}
        {model ? (
          <span data-testid="nccl-limit">
            Limit: {model.limitGBps.toFixed(1)} GB/s (the model: {ALGORITHM_LABEL[model.algorithm]}, {scopeLabel(config, model.scope)})
          </span>
        ) : (
          <label data-testid="nccl-limit">
            Limit ({!collective ? (run.testName ? `the app has no model of ${run.testName}` : 'select the collective, or type the limit') : run.ranks === 0 ? 'the output has no rank lines' : 'no scope of the app has these ranks'}){' '}
            <input data-testid="nccl-limit-input" type="number" min={0} step="any" value={r.limit} onChange={(e) => useReader.setState({ limit: e.target.value })} aria-label="Limit in GB/s" /> GB/s
          </label>
        )}
        <label>
          Threshold <input data-testid="nccl-threshold" type="number" min={1} max={100} value={r.threshold} onChange={(e) => useReader.setState({ threshold: e.target.value })} aria-label="Threshold in percent of the limit" /> %
        </label>
      </div>
      <ul className="marks" data-testid="nccl-marks">
        {(a.wrong.length > 0 || a.failed) && (
          <li className="bad">
            Data errors{a.wrong.length > 0 ? ` (#wrong > 0 at ${a.wrong.map((x) => formatSize(x.size)).join(', ')})` : ''}{a.failed ? ', and the out of bounds check FAILED' : ''}: the collective gave wrong results.
            Stop the jobs on these GPUs and follow {link(RB03, 'RB-03')}.
          </li>
        )}
        {a.percent !== null && (
          <li className={a.below ? 'bad' : 'good'}>
            The largest size, {formatSize(a.largest.size)}: {a.best.toFixed(1)} GB/s = {Math.round(a.percent)} % of the limit;{' '}
            {a.below ? (
              <>
                below the threshold ({threshold} %). Find the slow node pair and the transport with {link(RB02, 'RB-02')}.
              </>
            ) : (
              `at or above the threshold (${threshold} %).`
            )}
          </li>
        )}
      </ul>
      <p className="note">
        {COLL_FACTS.readerThreshold.value} ({COLL_FACTS.readerThreshold.status}): {COLL_FACTS.readerThreshold.note}
      </p>
      <NcclChart rows={run.rows} limit={limit} threshold={threshold} />
      <table data-testid="nccl-table">
        <thead>
          <tr>
            <th>Size</th>
            <th>Type</th>
            <th>busbw out-of-place (GB/s)</th>
            <th>busbw in-place (GB/s)</th>
            <th>% of the limit</th>
            <th>#wrong</th>
          </tr>
        </thead>
        <tbody>
          {run.rows.map((x) => (
            <tr key={x.size} className={(x.out.wrong ?? 0) > 0 || (x.inp.wrong ?? 0) > 0 ? 'bad' : undefined}>
              <td>{formatSize(x.size)}</td>
              <td>{x.type}</td>
              <td>{x.out.busbw.toFixed(2)}</td>
              <td>{x.inp.busbw.toFixed(2)}</td>
              <td>{limit ? `${Math.round((Math.max(x.out.busbw, x.inp.busbw) / limit) * 100)} %` : '—'}</td>
              <td>{[x.out.wrong, x.inp.wrong].map((w) => (w === null ? 'N/A' : w)).join(' / ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

// The nccl-tests reader (the bottom panel of Collectives mode): paste the output of a test; it stays in this page.
export function NcclPanel() {
  const text = useReader((r) => r.text)
  const parsed = useMemo(() => (text.trim() ? parseNcclTests(text) : null), [text])
  return (
    <details className="portmap reader" open data-testid="nccl-panel">
      <summary>Read nccl-tests output · paste the output of a test (all_reduce_perf, …); it stays in this page</summary>
      <textarea data-testid="nccl-input" aria-label="nccl-tests output" rows={5} spellCheck={false} value={text} placeholder="# nccl-tests version …" onChange={(e) => useReader.setState({ text: e.target.value })} />
      {parsed && !parsed.ok && (
        <p className="bad" data-testid="nccl-error">
          {parsed.reason}
        </p>
      )}
      {parsed?.ok && <Result run={parsed.run} />}
    </details>
  )
}
