import { useState } from 'react'
import { COLL_FACTS, COLL_LEARN } from '../catalog/collectives'
import { SIM_FACTS } from '../catalog/failures'
import type { Fact } from '../catalog/fact'
import { LINK_LABEL, PATH_FACTS } from '../catalog/paths'
import { SIZES, busbwChannels, type SizeId } from '../collectives/busbw'
import { channelsOf } from '../collectives/channels'
import { ALGORITHM_LABEL, COLLECTIVE_LABEL, stepText, type Schedule } from '../collectives/schedule'
import { scopeProblem, type Scope } from '../collectives/scope'
import { collSchedule, setColl } from '../state/coll'
import { useApp } from '../state/store'
import { designOf } from '../topology/fabric'
import { PAR_FACTS } from '../catalog/parallel'
import { SourceRef } from './SourceRef'

// A schedule whose ranks are all in one server (for example a TP group).
const oneServer = (sc: Schedule) => new Set(sc.ranks.map((id) => id.split('/')[0])).size === 1

const gb = (v: number) => `${v.toFixed(1)} GB/s`
const time = (t: number) => (t < 1e-3 ? `${(t * 1e6).toFixed(0)} µs` : t < 1 ? `${(t * 1e3).toFixed(2)} ms` : `${t.toFixed(2)} s`)
const mib = (b: number) => `${(b / 2 ** 20).toFixed(b < 2 ** 20 ? 2 : 0)} MiB`

export function Badge({ f }: { f: Fact<unknown> }) {
  const title = f.formula ?? f.note ?? ''
  return f.source ? (
    <SourceRef className={`status ${f.status}`} source={f.source} title={title} name={`Open the source of this value in the Library: ${f.status}`}>
      {f.status}
    </SourceRef>
  ) : (
    <span className={`status ${f.status}`} title={title}>
      {f.status}
    </span>
  )
}

// The notes of the algorithm of the bar.
function algorithmNotes(sc: Schedule, scope: Scope): Fact<string>[] {
  switch (sc.algorithm) {
    case 'ring':
      if (sc.collective === 'broadcast') return [COLL_FACTS.broadcastChain, COLL_FACTS.broadcastChunks]
      if (scope === '1n') return [COLL_FACTS.ringSteps, COLL_FACTS.nvswitchRing]
      if (scope === '2n') return [COLL_FACTS.ringSteps, COLL_FACTS.ringOrder, COLL_FACTS.channels, COLL_FACTS.channelLimit]
      if (scope === '2s') return [COLL_FACTS.ringSteps, COLL_FACTS.ringOrder, COLL_FACTS.channelLimit, PATH_FACTS.spine, PATH_FACTS.ecmp]
      if (scope === '1t' || scope === '4t') return [COLL_FACTS.ringSteps, PATH_FACTS.nvl72]
      if (scope === 'group') return oneServer(sc) ? [COLL_FACTS.ringSteps, COLL_FACTS.nvswitchRing] : [COLL_FACTS.ringSteps]
      return [COLL_FACTS.ringSteps]
    case 'tree':
      return [COLL_FACTS.treeHalves, COLL_FACTS.treeLatency, COLL_FACTS.treeChain, COLL_FACTS.treeShape, COLL_FACTS.treePipeline, COLL_FACTS.treePhases]
    case 'nvls':
      return [COLL_FACTS.nvlsIntraNode, COLL_FACTS.nvlsLimit]
    case 'pat':
      return [COLL_FACTS.patBruck, COLL_FACTS.patOneGpu, COLL_FACTS.patSteps]
    case 'p2p':
      return [COLL_FACTS.p2pPattern, ...(scope === '2n' ? [COLL_FACTS.pxn, COLL_FACTS.p2pNodeShare] : []), COLL_FACTS.p2pOrder]
  }
}

// The inspector of Collectives mode: the step, the busbw panel, the notes, and the Learn links.
export function CollPanel() {
  const { coll, config, failures, set } = useApp()
  const [measured, setMeasured] = useState('') // a state of the page only (not in the URL)
  const sc = coll ? collSchedule(config, coll) : null
  if (!coll || !sc) {
    return (
      <section className="panel" data-testid="coll-panel">
        <h2>Collectives</h2>
        <p>No ring for this scope: {(coll && scopeProblem(config, coll.scope)) ?? 'the algorithm does not run on this scope.'}</p>
      </section>
    )
  }
  const size = SIZES.find((x) => x.id === coll.size)!
  const r = busbwChannels(channelsOf(config, coll.scope, sc, failures), size.bytes)
  const m = Number(measured)
  const notes: Fact<string>[] = [
    COLL_FACTS.busbwMeaning,
    COLL_FACTS.algorithm,
    COLL_FACTS.model,
    ...algorithmNotes(sc, coll.scope),
    COLL_FACTS.latency,
    ...(designOf(config).planes === 'dual' && coll.scope !== '1n' && coll.scope !== '1t' && coll.scope !== '4t' && !(coll.scope === 'group' && oneServer(sc)) ? [COLL_FACTS.dualPlane] : []),
    ...(coll.scope === 'group' && coll.group && coll.group.total > coll.group.gpus.length ? [PAR_FACTS.playCap] : []),
  ]
  return (
    <section className="panel" data-testid="coll-panel">
      <h2>
        {COLLECTIVE_LABEL[sc.collective]}, {ALGORITHM_LABEL[sc.algorithm]}, {sc.ranks.length} ranks
      </h2>
      <p className="summary" data-testid="coll-step-text">
        {stepText(sc, coll.step)}
      </p>
      <h3>Bus bandwidth</h3>
      {!r.ok ? (
        <p data-testid="busbw-none">{r.reason}</p>
      ) : (
        <table className="specs" data-testid="busbw">
          <tbody>
            <tr>
              <th>Message size</th>
              <td>
                <select data-testid="coll-size" aria-label="Message size" value={coll.size} onChange={(e) => set((s) => setColl(s, { size: e.target.value as SizeId }))}>
                  {SIZES.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </td>
              <td />
            </tr>
            <tr>
              <th>Bus factor</th>
              <td>
                {r.bw.factorFact.value} = {r.bw.factor.toFixed(3)}
              </td>
              <td>
                <Badge f={r.bw.factorFact} />
              </td>
            </tr>
            <tr>
              <th>Bottleneck</th>
              <td data-testid="busbw-bottleneck">
                {r.bw.hop.from.label} → {r.bw.hop.to.label} ({LINK_LABEL[r.bw.hop.link]}): {mib(r.bw.link.bytes)} in {r.bw.link.sends} sends, at {gb(r.bw.link.gbps)}
                {r.bw.channels > 1 ? `; ${r.bw.channels} channels × ${gb(r.bw.link.gbps)}` : ''}
              </td>
              <td>
                <Badge f={r.bw.hop.bandwidth} />
              </td>
            </tr>
            <tr>
              <th>Expected busbw (upper limit)</th>
              <td data-testid="busbw-limit">{gb(r.bw.limitGBps)}</td>
              <td />
            </tr>
            <tr>
              <th>Ideal algbw</th>
              <td>{gb(r.bw.algbwGBps)}</td>
              <td />
            </tr>
            <tr>
              <th>Ideal time</th>
              <td>{time(r.bw.timeS)}</td>
              <td />
            </tr>
            <tr>
              <th>Your busbw</th>
              <td>
                <input data-testid="busbw-measured" type="number" min={0} step="any" value={measured} onChange={(e) => setMeasured(e.target.value)} aria-label="Measured busbw in GB/s" /> GB/s{' '}
                {m > 0 && <span data-testid="busbw-percent">= {Math.round((m / r.bw.limitGBps) * 100)} % of the limit</span>}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      )}
      {r.ok && r.bw.degraded.length > 0 && (
        <p data-testid="busbw-degraded">
          The paths {r.bw.degraded.join(', ')} have a degraded link: {SIM_FACTS.degradedHop.value}. The full collective waits for the slowest path, so the measured busbw will be lower than the limit.
        </p>
      )}
      <ul className="notes" data-testid="coll-notes">
        {notes.map((f) => (
          <li key={f.value}>
            {f.value} <Badge f={f} />
            {f.note && <div>{f.note}</div>}
          </li>
        ))}
      </ul>
      <h3>Read and practise</h3>
      <ul>
        {COLL_LEARN.map((l) => (
          <li key={l.label}>
            <SourceRef source={l.source}>{l.label}</SourceRef>
          </li>
        ))}
      </ul>
    </section>
  )
}
