import { designById } from '../catalog/designs'
import { choicesFor, type Config } from '../config/config'
import { PRESETS, presetOf } from '../config/presets'
import { alsoChanged } from '../config/diff'
import { label, optionState } from '../config/rules'
import { useApp } from '../state/store'
import { useUi } from '../state/ui'
import { EXPAND_ALL_SERVERS, collapseAll, expandAll, serverCount, withConfig, type AppState } from '../state/transitions'
import { OverlayControls } from './OverlayControls'

const SECTIONS: { title: string; open: boolean; fields: [keyof Config, string][] }[] = [
  {
    title: 'Compute',
    open: true,
    fields: [
      ['platform', 'Platform'],
      ['build', 'System build'],
      ['cooling', 'Cooling'],
    ],
  },
  {
    title: 'Compute fabric',
    open: true,
    fields: [
      ['fabric', 'Compute fabric'],
      ['design', 'Reference design'],
      ['topology', 'Topology'],
      ['planes', 'Planes'],
      ['suCount', 'Scale'],
      ['lastSuEmpty', 'Empty slots in the last SU'],
      ['spares', 'Spare pool'],
      ['ufm', 'UFM'],
    ],
  },
  {
    title: 'Ethernet and management',
    open: false,
    fields: [
      ['frontendSpines', 'Frontend spines'],
      ['frontendLeaves', 'Frontend leaves'],
      ['oobSwitches', 'Out-of-band switches'],
      ['automation', 'Network automation'],
    ],
  },
  {
    title: 'Storage',
    open: false,
    fields: [
      ['storageFabric', 'Storage network'],
      ['cboxes', 'VAST CBoxes'],
      ['dboxes', 'VAST DBoxes'],
      ['gds', 'GPUDirect Storage'],
      ['ceph', 'Ceph'],
      ['linstor', 'Linstor'],
    ],
  },
  {
    title: 'Platform and edge',
    open: false,
    fields: [
      ['clusterManager', 'Cluster manager'],
      ['orchestration', 'Orchestration'],
      ['rafay', 'Rafay controller'],
      ['vms', 'Workloads'],
      ['lb', 'Control-plane VIP'],
      ['edgeRouters', 'Edge routers'],
      ['uplink', 'Uplink'],
      ['itsm', 'ITSM integration'],
    ],
  },
  {
    title: 'Overlays',
    open: false,
    fields: [
      ['tenants', 'GPU tenants'],
      ['uat', 'UAT tenant'],
      ['allocated', 'Allocated'],
      ['degraded', 'Degraded nodes'],
      ['quarantined', 'Quarantined nodes'],
      ['maintenance', 'Nodes in maintenance'],
      ['phases', 'Delivery phases'],
    ],
  },
  {
    title: 'Simulate',
    open: false,
    fields: [
      ['p1Threshold', 'P1 threshold'],
      ['p2Threshold', 'P2 threshold'],
    ],
  },
]

function PresetField() {
  const { config, set } = useApp()
  const current = presetOf(config)
  return (
    <div className="field">
      <label>
        <span>Preset</span>
        <select
          data-testid="cfg-preset"
          value={current?.id ?? 'custom'}
          onChange={(e) => {
            const p = PRESETS.find((x) => x.id === e.target.value)
            if (p) change(set, p.config)
          }}
        >
          {!current && (
            <option value="custom" disabled>
              Custom
            </option>
          )}
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function Field({ k, label }: { k: keyof Config; label: string }) {
  const { config, set } = useApp()
  const choices = choicesFor(config, k)
  const states = choices.map((c) => ({ c, s: optionState(config, k, c.value) }))
  const off = states.flatMap(({ c, s }) => (s.enabled ? [] : [{ c, reason: s.reason }]))
  return (
    <div className="field">
      <label>
        <span>{label}</span>
        <select
          data-testid={`cfg-${k}`}
          value={String(config[k])}
          onChange={(e) => {
            const c = choices.find((x) => String(x.value) === e.target.value)
            if (c) change(set, { [k]: c.value } as Partial<Config>)
          }}
        >
          {states.map(({ c, s }) => (
            <option key={String(c.value)} value={String(c.value)} disabled={!s.enabled} title={c.label}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {off.length > 0 && (
        <details>
          <summary>{off.length === 1 ? 'Why is 1 option off?' : `Why are ${off.length} options off?`}</summary>
          <ul>
            {off.map(({ c, reason }) => (
              <li key={String(c.value)}>
                <b>{c.label}:</b> {reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

export function ConfigPanel() {
  const { config, set } = useApp()
  const d = designById(config.design)
  const tooBig = serverCount(config) > EXPAND_ALL_SERVERS
  const scale = choicesFor(config, 'suCount').find((c) => c.value === config.suCount)?.label ?? `${config.suCount} SU`
  return (
    <section className="panel">
      <h2>Configuration</h2>
      <AlsoChanged />
      <p className="summary-line">
        {d.short} · {config.topology === 'tor' ? 'top-of-rack' : 'rail-optimized'} · {config.planes} plane · {scale}
      </p>
      <PresetField />
      {SECTIONS.map((sec) => (
        <details key={sec.title} className="section" open={sec.open}>
          <summary>{sec.title}</summary>
          {sec.title === 'Overlays' && <OverlayControls />}
          {sec.fields.map(([key, label]) => (
            <Field key={key} k={key} label={label} />
          ))}
        </details>
      ))}
      <div className="buttons">
        <button type="button" onClick={() => set(expandAll)} disabled={tooBig}>
          Expand all SUs
        </button>
        <button type="button" onClick={() => set(collapseAll)}>
          Collapse all
        </button>
      </div>
      {tooBig && (
        <p className="note">
          Above {EXPAND_ALL_SERVERS} {d.serverWord}, open the SUs one at a time: all of them is too large to draw.
        </p>
      )}
      <p className="note">How to use the explorer, and its keys: the ? button in the header.</p>
    </section>
  )
}

// A change of the configuration, and a note of the other switches that it also changed.
function change(set: (f: (s: AppState) => AppState) => void, patch: Partial<Config>) {
  const before = useApp.getState().config
  set((s) => withConfig(s, patch))
  const after = useApp.getState().config
  const keys = after === before ? [] : alsoChanged(before, after, Object.keys(patch) as (keyof Config)[])
  useUi.setState({ forced: keys.length > 0 ? { config: after, keys } : null })
}

const FIELD_LABEL = new Map<keyof Config, string>(SECTIONS.flatMap((sec) => sec.fields.map(([k, l]) => [k, l] as [keyof Config, string])))

// Always in the panel (a live region): only its text changes, so a screen reader reads the new text.
function AlsoChanged() {
  const config = useApp((s) => s.config)
  const forced = useUi((u) => u.forced)
  const text =
    forced && forced.config === config ? `Also changed: ${forced.keys.map((k) => `${FIELD_LABEL.get(k) ?? k} → ${label(config, k, config[k])}`).join('; ')}` : ''
  return (
    <p role="status" data-testid="also-changed" className="note also-changed">
      {text}
    </p>
  )
}
