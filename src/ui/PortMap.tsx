import { useMemo } from 'react'
import { useApp } from '../state/store'
import { select, setTopoSource } from '../state/transitions'
import { openGuide, stepNumber } from '../state/guide'
import { portMapCsv, portMapRows } from '../topology/rackPorts'
import { diffNames, diffSummary, FINDING_LABEL, rackDiff, SOURCE_BY_ID, SOURCES, SOURCE_NOTE, type SourceId } from '../topology/sources'
import { downloadText } from './download'
import { rowKeys } from './rowKeys'
import { SourceRef } from './SourceRef'
import { hasRef } from '../refs'

// The port map of the open rack: both ends of each cable, to compare with ibnetdiscover (M3 lab step 5).
// The source control switches the map to the site intent or to the discovery, and each difference is named.
export function PortMap({ rackId }: { rackId: string }) {
  const { config, selected, topoSource, set } = useApp()
  const rows = useMemo(() => portMapRows(config, rackId), [config, rackId])
  const diff = useMemo(() => (topoSource === 'design' ? null : rackDiff(config, rackId, topoSource)), [config, rackId, topoSource])
  // A diff row matches a cable of the rack by either end: a compute rack names the server port, and a network
  // rack names the leaf port of the same cable.
  const byEnd = useMemo(() => {
    const m = new Map<string, NonNullable<typeof diff>['rows'][number]>()
    for (const r of diff?.rows ?? []) {
      m.set(r.near, r)
      if (r.far) m.set(r.far, r)
      if (r.sourceFar) m.set(r.sourceFar, r)
    }
    return m
  }, [diff])
  const extras = diff?.rows.filter((r) => r.finding === 'extra') ?? []
  const source = SOURCE_BY_ID.get(topoSource)!
  const guideStep = stepNumber('first', 'The same map from three sources')
  const download = () => downloadText(`port-map-${rackId}${diff ? `-${topoSource}` : ''}.csv`, portMapCsv(rows, diff), 'text/csv')
  return (
    <details className={rows.length === 0 ? 'portmap empty' : 'portmap'} open data-testid="portmap">
      <summary>
        Port map: {rows.length} cables
        {diff && diff.differs > 0 ? `, ${diff.differs} differ from the design` : ''}
      </summary>
      {rows.length === 0 ? (
        <p className="note">No compute fabric cable has an end in this rack.</p>
      ) : (
        <>
          <div className="portmap-head">
            <label className="inline">
              Source
              <select data-testid="portmap-source" value={topoSource} onChange={(e) => set((s) => setTopoSource(s, e.target.value as SourceId))}>
                {SOURCES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="note" data-testid="portmap-source-note">
              {source.note}{' '}
              {/* The note stands alone when the portal does not carry its source: no dead word. */}
              {hasRef(source.how.source) && (
                <SourceRef source={source.how.source} name="Open the source of this view in the Library">
                  Source
                </SourceRef>
              )}
            </span>
            <button type="button" data-testid="portmap-csv" onClick={download}>
              Download CSV
            </button>
            {guideStep !== null && (
              <button type="button" data-testid="portmap-guide" title="Open the guide at this step" onClick={() => set((s) => openGuide(s, 'first', guideStep))}>
                Guide
              </button>
            )}
          </div>
          {diff && (
            <p className={diff.differs > 0 ? 'note diff-line' : 'note'} data-testid="portmap-diff">
              {diffSummary(diff)}
              {diff.differs > 0 && (
                <span data-testid="portmap-diff-names"> {diffNames(diff)}</span>
              )}
            </p>
          )}
          <table>
            <thead>
              <tr>
                <th>Cable</th>
                {diff && <th>Difference</th>}
                <th>A device</th>
                <th>A U</th>
                <th>A port</th>
                <th>A NIC</th>
                <th>B device</th>
                <th>B rack</th>
                <th>B U</th>
                <th>B port</th>
                <th>Cable and optics</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = byEnd.get(r.a.id) ?? byEnd.get(r.b.id)
                const finding = d?.finding ?? 'same'
                return (
                  <tr key={r.cable} className={[selected === r.cable || selected === r.a.id || selected === r.b.id ? 'on' : '', diff && finding !== 'same' ? `diff-${finding}` : ''].join(' ').trim() || undefined} onClick={() => set((s) => select(s, r.cable))} {...rowKeys(() => set((s) => select(s, r.cable)))}>
                    <td>{r.cable}</td>
                    {diff && (
                      <td data-testid={`portmap-diff-${r.a.id.replace(/[^\w-]+/g, '_')}`} title={d?.why}>
                        {FINDING_LABEL[finding]}
                        {d?.finding === 'moved' && <span className="note"> to {d.sourceFar}</span>}
                        {d?.finding === 'wrong-rail' && <span className="note"> rail {d.sourceRail}</span>}
                      </td>
                    )}
                    <td>{r.a.device}</td>
                    <td>{r.a.u}</td>
                    <td>{r.a.port}</td>
                    <td>{r.a.nic}</td>
                    <td>{r.b.device}</td>
                    <td>{r.b.rack}</td>
                    <td>{r.b.u}</td>
                    <td>{r.b.port}</td>
                    <td>{r.type}</td>
                  </tr>
                )
              })}
              {extras.map((r) => (
                <tr key={r.near} className="diff-extra">
                  <td>—</td>
                  {diff && (
                    <td title={r.why}>
                      {FINDING_LABEL.extra}
                      <span className="note"> from {r.sourceFar}</span>
                    </td>
                  )}
                  <td>{r.near.split('/')[0]}</td>
                  <td></td>
                  <td>{r.near.split('/')[1]}</td>
                  <td></td>
                  <td>{r.sourceFar?.split('/')[0]}</td>
                  <td></td>
                  <td></td>
                  <td>{r.sourceFar?.split('/')[1]}</td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
          {diff && (
            <p className="note" data-testid="portmap-note">
              {SOURCE_NOTE.value}: <span className={`status ${SOURCE_NOTE.status}`}>{SOURCE_NOTE.status}</span> A difference is a documentation error or an unrecorded change; both go in the change record.
            </p>
          )}
        </>
      )}
    </details>
  )
}
