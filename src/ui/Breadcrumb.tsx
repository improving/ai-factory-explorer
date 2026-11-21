import { designById } from '../catalog/designs'
import { platformFor } from '../catalog/platforms'
import { groupLabel } from '../parallel/plan'
import { useApp } from '../state/store'
import { openFabric, openOverview, openRacks, up } from '../state/transitions'
import { parseServerId } from '../topology/ids'
import { rackOf } from '../topology/racks'
import { PATH_LABEL } from '../routing/factory'
import { ALGORITHM_LABEL, COLLECTIVE_LABEL } from '../collectives/schedule'
import { scopeLabel } from '../collectives/scope'
import { channelCount } from '../state/coll'

export function Breadcrumb() {
  const { view, config, trace, mode, coll, set } = useApp()
  if (mode === 'collectives' && coll) {
    if (coll.view === 'parallelism') {
      const p = coll.par
      return (
        <nav className="crumbs" data-testid="breadcrumb">
          <strong>
            Collectives: Parallelism, TP {p.tp} × CP {p.cp} × DP {p.dp} × PP {p.pp} (EP {p.ep}), {p.servers} {platformFor(config).form === 'nvl72-tray' ? 'trays' : 'servers'}
          </strong>
        </nav>
      )
    }
    return (
      <nav className="crumbs" data-testid="breadcrumb">
        <strong>
          Collectives: {COLLECTIVE_LABEL[coll.collective]}, {ALGORITHM_LABEL[coll.algorithm]}, {coll.scope === 'group' && coll.group ? groupLabel(coll.group) : scopeLabel(config, coll.scope)}
          {channelCount(config, coll) > 1 ? (coll.channel === 'all' ? ', all channels' : `, channel ${coll.channel}`) : ''}
        </strong>
      </nav>
    )
  }
  if (view.level === 'overview') {
    return (
      <nav className="crumbs" data-testid="breadcrumb">
        Factory
      </nav>
    )
  }
  const factory = (
    <button type="button" className="link" onClick={() => set(openOverview)}>
      Factory
    </button>
  )
  if (view.level === 'fabric') {
    return (
      <nav className="crumbs" data-testid="breadcrumb">
        {factory}
        {' › '}Pod
      </nav>
    )
  }
  const link = (label: string, onClick: () => void) => (
    <button type="button" className="link" onClick={onClick}>
      {label}
    </button>
  )
  if (view.level === 'trace') {
    return (
      <nav className="crumbs" data-testid="breadcrumb">
        {factory}
        {' › '}
        {link('Pod', () => set(openFabric))}
        {' › '}
        <strong>
          Trace: {trace?.path ? PATH_LABEL[trace.path] : `${trace?.src} → ${trace?.dst}`}
        </strong>
      </nav>
    )
  }
  if (view.level === 'racks' || view.level === 'rack') {
    const su = view.su
    return (
      <nav className="crumbs" data-testid="breadcrumb">
        {factory}
        {' › '}
        {link('Pod', () => set(openFabric))}
        {' › '}
        {view.level === 'racks' ? (
          `SU ${su} racks`
        ) : (
          <>
            {link(`SU ${su} racks`, () => set((s) => openRacks(s, su)))}
            {' › '}
            <strong>{rackOf(config, view.rackId)?.label ?? view.rackId}</strong>
          </>
        )}
      </nav>
    )
  }
  const p = parseServerId(view.serverId)!
  const rack = platformFor(config).form === 'nvl72-tray' ? Math.ceil(p.n / designById(config.design).serversPerRack.value) : null
  return (
    <nav className="crumbs" data-testid="breadcrumb">
      {factory}
      {' › '}
      {link('Pod', () => set(up))}
      {' › '}
      {link(`SU ${p.su}`, () => set((s) => openRacks(s, p.su)))}
      {rack !== null && <>{' › '}Rack {rack}</>}
      {' › '}
      <strong>{view.serverId}</strong>
    </nav>
  )
}
