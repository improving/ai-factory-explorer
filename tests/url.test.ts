import { describe, expect, it } from 'vitest'
import { closeDoc, openDoc, DEFAULT_TIME, INITIAL, setTime, setTimeCursor, setTimeWindow, applyScenario, fail, openChecklist, openOverview, openRack, openRacks, openServer, openSu, select, setColor, setDiagView, setFace, setHop, setIncident, setLoadCursor, setLoadSpec, setSchedView, setTelemetry, setTopo, setTopoSource, setMode, setTraceOptions, toggleLayer, toggleRail, toggleStep, withConfig } from '../src/state/transitions'
import { DEFAULT_LOAD, TICKS } from '../src/schedule/load'
import { SPAN, WINDOW_MIN } from '../src/telemetry/events'
import { decodeState, encodeState } from '../src/state/url'
import { DEFAULT_COLL, setColl, setCollStep } from '../src/state/coll'
import { playGroup, setCollView, setParCell, setParDim, setPlan } from '../src/state/par'

describe('the tab of the inspector in the URL', () => {
  it('opens the tab of a link, and writes none for the first tab', () => {
    expect(encodeState(INITIAL)).not.toContain('itab')
    expect(decodeState('#sel=su1-n71&itab=lifecycle').tab).toBe('lifecycle')
    expect(encodeState(decodeState('#sel=su1-n71&itab=lifecycle'))).toContain('itab=lifecycle')
    expect(decodeState('#sel=su1-n71').tab).toBe('specs')
  })

  it('drops a tab that does not exist, and one that the selected part does not have', () => {
    expect(decodeState('#itab=no-such-tab').tab).toBe('specs')
    expect(decodeState('#itab=lifecycle&sel=su1-n71').tab).toBe('lifecycle') // a server
    expect(decodeState('#itab=lifecycle&sel=su1-leaf-r3').tab).toBe('specs') // a leaf has no lifecycle
  })
})

describe('the view of the fabric in the URL', () => {
  it('keeps the source of the port map, and writes none for the design', () => {
    expect(encodeState(INITIAL)).not.toContain('tsrc')
    const s = setTopoSource(INITIAL, 'discovered')
    expect(encodeState(s)).toContain('tsrc=discovered')
    expect(decodeState(encodeState(s)).topoSource).toBe('discovered')
  })

  it('drops a source that does not exist', () => {
    expect(decodeState('#tsrc=no-such-source').topoSource).toBe('design')
  })
})

describe('the diagnosis in the URL', () => {
  it('round-trips the chain view, the incident, the checklist, and the ticked steps', () => {
    let s = setMode(INITIAL, 'simulate')
    s = setDiagView(s, 'chain')
    s = setIncident(s, 'xid79-multinode')
    s = openChecklist(s, 'RB-03')
    s = toggleStep(s, 'RB-03', 1, '10:14:02')
    s = toggleStep(s, 'RB-03', 3, '10:16:40')
    const url = encodeState(s)
    expect(url).toContain('mode=simulate')
    expect(url).toContain('dv=chain')
    expect(url).toContain('inc=xid79-multinode')
    expect(url).toContain('ck=RB-03')
    expect(new URLSearchParams(url).get('cd')).toBe('RB-03.1,RB-03.3')
    const back = decodeState(url)
    expect(back.diag).toMatchObject({ view: 'chain', incident: 'xid79-multinode', checklist: 'RB-03', done: ['RB-03.1', 'RB-03.3'] })
    expect(back.diag.at).toEqual({}) // the clock of a tick does not travel with the link
  })

  it('writes none of the diagnosis keys at their defaults', () => {
    const url = encodeState(INITIAL)
    for (const key of ['dv', 'inc', 'ck', 'cd']) expect(url).not.toContain(key)
  })

  it('drops an incident, a checklist, or a step that does not exist', () => {
    const s = decodeState('#mode=simulate&dv=chain&inc=no-such-incident&ck=RB-05&cd=RB-05.1,RB-03.9,zz')
    expect(s.diag).toMatchObject({ view: 'chain', incident: 'current', checklist: null, done: [] })
  })
})

describe('the URL', () => {
  it('round-trips a full state', () => {
    let s = withConfig(INITIAL, { suCount: 4 })
    s = openSu(s, 2)
    s = openServer(s, 'su2-n10')
    s = select(s, 'su2-n10/gpu1')
    s = toggleRail(s, 1)
    const back = decodeState(encodeState(s))
    expect(back.config).toEqual(s.config)
    expect(back.view).toEqual(s.view)
    expect([...back.expanded]).toEqual([2])
    expect(back.selected).toBe('su2-n10/gpu1')
    expect(back.rail).toBe(1)
  })

  it('uses the defaults for an empty hash', () => {
    expect(decodeState('')).toEqual(INITIAL)
  })


  it('applies the SU count before the server, so a server in SU 4 opens', () => {
    expect(decodeState('server=su4-n01&su=4').view).toEqual({ level: 'node', serverId: 'su4-n01' })
  })

  it('drops each bad value of an old or hand-edited link, and keeps the good ones', () => {
    const s = decodeState('#su=3&platform=h999&planes=dual&rail=9&server=su9-n99&sel=spine-99&open=0,x,1')
    expect(s.config).toEqual(INITIAL.config)
    expect(s.view).toEqual({ level: 'fabric' })
    expect(s.rail).toBeNull()
    expect(s.selected).toBeNull()
    expect([...s.expanded]).toEqual([1])
  })

  it('opens a milestone 1 link (no design) on B300 XDR', () => {
    const s = decodeState('#su=4&server=su2-n10')
    expect(s.config.design).toBe('b300-xdr')
    expect(s.view).toEqual({ level: 'node', serverId: 'su2-n10' })
  })

  it('repairs the rest of the configuration from the platform', () => {
    expect(decodeState('#platform=h100').config).toMatchObject({
      platform: 'h100',
      build: 'dgx',
      fabric: 'ib-ndr',
      design: 'ndr-h100',
      topology: 'rail',
      planes: 'single',
      suCount: 4,
    })
  })

  it('opens a GB300 link at 8 SU', () => {
    const s = decodeState('#platform=gb300-nvl72&su=8')
    expect(s.config.design).toBe('gb300-xdr')
    expect(s.config.suCount).toBe(8)
  })

  it('round-trips an open Enterprise group', () => {
    let s = withConfig(INITIAL, { build: 'oem-hgx', fabric: 'spectrum-x', design: 'ent-b300', suCount: 16 })
    s = openSu(s, 9)
    const back = decodeState(encodeState(s))
    expect(back.config).toEqual(s.config)
    expect([...back.expanded]).toEqual([9])
  })

  it('writes nothing for the default state', () => {
    expect(encodeState(INITIAL)).toBe('')
  })

  it('round-trips the overview with a selected block and the new keys', () => {
    let s = withConfig(INITIAL, { cboxes: 8, orchestration: 'both', cooling: 'liquid' })
    s = select(openOverview(s), 'blk-vast')
    const back = decodeState(encodeState(s))
    expect(back.view).toEqual({ level: 'overview' })
    expect(back.selected).toBe('blk-vast')
    expect(back.config).toEqual(s.config)
  })

  it('round-trips a rack, its side, and a selected part', () => {
    const s = select(setFace(openRack(openRacks(INITIAL, 1), 'su1-k1'), 'rear'), 'su1-k1-pdu2')
    const back = decodeState(encodeState(s))
    expect(back.view).toEqual(s.view)
    expect(back.selected).toBe('su1-k1-pdu2')
  })

  it('keeps a face that is not the side of the ports', () => {
    const s = setFace(openRack(openRacks(withConfig(INITIAL, { platform: 'h100' }), 1), 'su1-k1'), 'front')
    expect(decodeState(encodeState(s)).view).toMatchObject({ face: 'front' })
  })

  it('falls back to the fabric for a rack link of an SU that the configuration does not have', () => {
    expect(decodeState('#racks=9&rack=su9-k1&face=rear').view).toEqual({ level: 'fabric' })
  })

  it('round-trips the overlays', () => {
    const s = setTelemetry(toggleLayer(toggleLayer(setColor(openOverview(INITIAL), 'tenant'), 'power'), 'oob'), true)
    expect(encodeState(s)).toMatch(/color=tenant/)
    const back = decodeState(encodeState(s))
    expect(back.overlay).toEqual({ color: 'tenant', hidden: ['oob', 'power'], telemetry: true, topo: false })
  })

  it('drops a bad overlay value', () => {
    expect(decodeState('#color=rainbow&hide=oob,warp').overlay).toEqual({ color: 'none', hidden: ['oob'], telemetry: false, topo: false })
  })

  it('gives no selection to a telemetry block without the telemetry overlay', () => {
    expect(decodeState('#view=overview&sel=blk-prometheus').selected).toBeNull()
    expect(decodeState('#view=overview&telemetry=1&sel=blk-prometheus').selected).toBe('blk-prometheus')
  })

  it('round-trips the topo -m switch', () => {
    const s = setTopo(openServer(INITIAL, 'su1-n05'), true)
    expect(encodeState(s)).toMatch(/topo=1/)
    expect(decodeState(encodeState(s)).overlay.topo).toBe(true)
  })

  it('round-trips a trace: the GPUs, the options, the hop, and the view', () => {
    const s = setHop(setTraceOptions(applyScenario(INITIAL, 'dual-plane'), { pxn: false, plane: 1 }), 3)
    const hash = encodeState(s)
    expect(hash).toMatch(/mode=trace/)
    expect(hash).toMatch(/view=trace/)
    const back = decodeState(hash)
    expect(back.trace).toEqual(s.trace)
    expect(back.view).toEqual({ level: 'trace' })
    expect(back.config.planes).toBe('dual')
  })

  it('drops a trace with a bad GPU, and a hop past the end of the path', () => {
    expect(decodeState('#mode=trace&trace=su1-n05/gpu9,su1-n40/gpu5&view=trace')).toMatchObject({ mode: 'trace', trace: null, view: { level: 'fabric' } })
    expect(decodeState('#mode=trace&trace=su1-n05/gpu2,su1-n40/gpu5&view=trace&hop=99').trace?.hop).toBe(5)
  })

  it('round-trips a factory trace, and drops a bad path', () => {
    const s = applyScenario(INITIAL, 'control-sm')
    const back = decodeState(encodeState(s))
    expect(encodeState(s)).toMatch(/path=control-sm/)
    expect(back.trace).toEqual(s.trace)
    expect(back.view).toEqual({ level: 'trace' })
    expect(decodeState('#mode=trace&trace=su1-n05/gpu2&path=warp&view=trace')).toMatchObject({ trace: { path: null, dst: null }, view: { level: 'fabric' } })
  })

  it('round-trips the failures, and drops a bad id or mode', () => {
    const s = fail(fail(INITIAL, 'su1-leaf-r3', 'down'), 'blk-ufm', 'active')
    expect(encodeState(s)).toMatch(/fail=su1-leaf-r3%3Adown%2Cblk-ufm%3Aactive/)
    expect(decodeState(encodeState(s)).failures).toEqual(s.failures)
    expect(decodeState('#fail=su9-leaf-r3:down,blk-ufm:warp,spine-01:down').failures).toEqual([{ id: 'spine-01', mode: 'down' }])
    expect(decodeState('#fail=spine-01:toString,blk-ufm:constructor').failures).toEqual([])
  })

  it('round-trips Collectives mode, but not the selected pair', () => {
    let s = setMode(INITIAL, 'collectives')
    s = setColl(s, { scope: '2n', size: '4g' })
    s = setCollStep(s, 5)
    s = { ...s, coll: { ...s.coll!, pair: '3>4' } }
    expect(encodeState(s)).toContain('coll=allreduce.ring.2n.5.4g')
    expect(decodeState(encodeState(s)).coll).toEqual({ collective: 'allreduce', algorithm: 'ring', scope: '2n', step: 5, size: '4g', channel: 0, pair: null, view: 'collective', par: DEFAULT_COLL.par, group: null })
  })

  it('gives the default of each bad part of a Collectives link, and keeps the step inside the schedule', () => {
    expect(decodeState('#mode=collectives&coll=xx.ring.9.99.zz').coll).toEqual({ collective: 'allreduce', algorithm: 'ring', scope: '1n', step: 14, size: '1g', channel: 0, pair: null, view: 'collective', par: DEFAULT_COLL.par, group: null })
    expect(decodeState('#mode=collectives').coll).toEqual({ collective: 'allreduce', algorithm: 'ring', scope: '1n', step: 0, size: '1g', channel: 0, pair: null, view: 'collective', par: DEFAULT_COLL.par, group: null })
    expect(decodeState('#coll=allgather.ring.2.3.1g').coll).toBeNull() // no mode: no Collectives state
  })

  it('opens a milestone 10 link, and an algorithm that is not valid gives the first valid one', () => {
    expect(decodeState('#mode=collectives&coll=allgather.ring.2.3.1g').coll).toMatchObject({ collective: 'allgather', scope: '2n', step: 3 })
    expect(decodeState('#mode=collectives&coll=allreduce.tree.n8.6.1g').coll).toMatchObject({ algorithm: 'tree', scope: 'n8', step: 6 })
    expect(decodeState('#mode=collectives&coll=allreduce.tree.1n.2.1g').coll).toMatchObject({ algorithm: 'ring', scope: '1n', step: 2 })
  })

  it.each([
    ['allreduce', 'nvls', '1n'],
    ['allreduce', 'tree', 'n4'],
    ['allgather', 'pat', 'n16'],
    ['reducescatter', 'pat', 'n8'],
    ['alltoall', 'p2p', '2n'],
    ['broadcast', 'ring', 'n16'],
  ] as const)('round-trips %s with %s on the scope %s', (collective, algorithm, scope) => {
    let s = setColl(setMode(INITIAL, 'collectives'), { collective, scope })
    s = setCollStep(setColl(s, { algorithm }), 1)
    expect(s.coll).toMatchObject({ collective, algorithm, scope, step: 1 })
    expect(decodeState(encodeState(s)).coll).toEqual(s.coll)
  })

  it('keeps the channel in the URL, and drops a channel that the scope does not have', () => {
    let s = setColl(setMode(INITIAL, 'collectives'), { scope: '2n' })
    s = setColl(s, { channel: 'all' })
    expect(encodeState(s)).toContain('coll=allreduce.ring.2n.0.1g.call')
    expect(decodeState(encodeState(s)).coll!.channel).toBe('all')
    expect(decodeState('#mode=collectives&coll=allreduce.ring.2n.4.1g.c5').coll).toMatchObject({ channel: 5, step: 4 })
    expect(decodeState('#mode=collectives&coll=allreduce.ring.n8.0.1g.c3').coll!.channel).toBe(0)
    expect(encodeState(setMode(INITIAL, 'collectives'))).toContain('coll=allreduce.ring.1n.0.1g')
    expect(encodeState(setMode(INITIAL, 'collectives'))).not.toContain('.c0')
  })

  it('keeps the Parallelism view, the plan, and a group in the URL', () => {
    let s = setParCell(setParDim(setPlan(setCollView(setMode(INITIAL, 'collectives'), 'parallelism'), { pp: 2, dp: 2 }), 'dp'), 11)
    expect(encodeState(s)).toContain('cview=par')
    expect(encodeState(s)).toContain('par=4.8.1.1.2.2.dp.c11')
    expect(decodeState(encodeState(s)).coll).toEqual(s.coll)
    s = playGroup(setParCell(setPlan(s, { pp: 1, dp: 4 }), 11))
    expect(encodeState(s)).toContain('coll=allreduce.ring.group.0.1g.gdp3')
    expect(encodeState(s)).not.toContain('cview')
    expect(decodeState(encodeState(s)).coll).toEqual(s.coll)
  })

  it('gives the default of each bad part of a plan, and 1 node for a group that the plan does not have', () => {
    expect(decodeState('#mode=collectives&cview=par&par=3.8.x.1.4.1.zz.c99').coll!.par).toEqual({ servers: 4, tp: 8, cp: 1, ep: 1, dp: 4, pp: 1, dim: 'tp', cell: null })
    expect(decodeState('#mode=collectives&par=4.8.1.1.4.1.tp&coll=allreduce.ring.group.0.1g.gdp9').coll).toMatchObject({ scope: '1n', group: null })
    expect(decodeState('#mode=collectives&par=4.8.1.1.4.1.tp&coll=allreduce.ring.group.0.1g.gpp0').coll).toMatchObject({ scope: '1n', group: null })
    expect(decodeState('#mode=collectives&coll=allreduce.ring.group.0.1g').coll).toMatchObject({ scope: '1n', group: null })
    expect(encodeState(setMode(INITIAL, 'collectives'))).not.toContain('par=')
  })
})

describe('the load of Schedule mode in the URL', () => {
  const load = setSchedView(INITIAL, 'load')

  it('opens the load view, in Schedule mode, and writes nothing for the decision view', () => {
    expect(encodeState(INITIAL)).not.toContain('sv=')
    expect(decodeState('#sv=load').load.view).toBe('load')
    expect(decodeState('#sv=load').mode).toBe('schedule')
    expect(encodeState(load)).toContain('sv=load')
    expect(encodeState(load)).not.toContain('ld=')
    expect(encodeState(load)).not.toContain('lt=')
  })

  it('keeps the spec and the cursor of a run', () => {
    let s = setLoadSpec(load, { seed: 12, nodes: 288, perMinute: 240 })
    s = setLoadCursor(s, 900)
    expect(encodeState(s)).toContain('ld=12.288.240')
    expect(encodeState(s)).toContain('lt=900')
    const back = decodeState(encodeState(s))
    expect(back.load).toEqual(s.load)
  })

  it('takes the nearest choice for a value that the panel does not offer', () => {
    const s = decodeState('#sv=load&ld=3.1000.100')
    expect(s.load.spec).toEqual({ seed: 3, nodes: 1152, perMinute: 120 })
    expect(decodeState('#sv=load&ld=abc.0.0').load.spec).toEqual({ seed: DEFAULT_LOAD.seed, nodes: 288, perMinute: 10 })
  })

  it('clamps the cursor to the run', () => {
    expect(decodeState('#sv=load&lt=-40').load.cursor).toBe(0)
    expect(decodeState('#sv=load&lt=99999').load.cursor).toBe(TICKS - 1)
    expect(decodeState('#sv=load&lt=abc').load.cursor).toBe(0)
    expect(setLoadCursor(INITIAL, 5.6).load.cursor).toBe(6)
  })

  it('keeps the spec out of the URL of the decision view', () => {
    const s = setLoadCursor(setLoadSpec(load, { seed: 3 }), 300)
    const decision = setSchedView(s, 'decision')
    expect(encodeState(decision)).not.toContain('ld=')
    expect(encodeState(decision)).not.toContain('lt=')
    expect(decision.load.spec.seed).toBe(3) // the work stays in the app, it is only not written
  })
})

describe('the time view in the URL', () => {
  it('writes nothing when the view is off', () => {
    expect(encodeState(INITIAL)).not.toContain('tw=')
    expect(encodeState(INITIAL)).not.toContain('t=')
  })

  it('opens a window at its end, and writes the cursor only when it is not the end', () => {
    expect(decodeState('#tw=24h').time).toEqual({ window: '24h', cursor: WINDOW_MIN['24h'] })
    expect(decodeState('#tw=7d').time).toEqual({ window: '7d', cursor: SPAN })
    expect(encodeState(setTime(INITIAL, DEFAULT_TIME))).toContain('tw=24h')
    expect(encodeState(setTime(INITIAL, DEFAULT_TIME))).not.toContain('t=')
    expect(encodeState(setTimeCursor(setTime(INITIAL, DEFAULT_TIME), 600))).toContain('t=600')
    expect(decodeState('#tw=7d&t=600').time).toEqual({ window: '7d', cursor: 600 })
  })

  it('drops a window that does not exist', () => {
    expect(decodeState('#tw=30d&t=600').time).toBeNull()
    expect(decodeState('#t=600').time).toBeNull()
  })

  it('clamps the cursor to the window', () => {
    expect(decodeState('#tw=24h&t=99999').time!.cursor).toBe(WINDOW_MIN['24h'])
    expect(decodeState('#tw=24h&t=-5').time!.cursor).toBe(0)
    expect(decodeState('#tw=24h&t=abc').time!.cursor).toBe(0)
  })

  it('keeps the clock when the window changes, and stops at the nearest edge', () => {
    const seven = setTime(INITIAL, { window: '7d', cursor: 6000 }) // day 5
    const day = setTimeWindow(seven, '24h')
    expect(day.time!.window).toBe('24h')
    expect(day.time!.cursor).toBe(0) // day 5 is before the last day, so the cursor stops at its start
    const middle = setTimeWindow(setTime(INITIAL, { window: '24h', cursor: 720 }), '7d')
    expect(middle.time!.cursor).toBe(SPAN - 1440 + 720) // the same clock, seven days of room
    expect(setTimeWindow(setTime(INITIAL, { window: '24h', cursor: 1440 }), '7d').time!.cursor).toBe(SPAN - 1) // the last minute of the log, which is now
  })

  it('turns the view off', () => {
    const on = setTimeCursor(setTime(INITIAL, DEFAULT_TIME), 100)
    expect(setTime(on, null).time).toBeNull()
    expect(encodeState(setTime(on, null))).not.toContain('tw=')
  })
})

describe('the Library in the URL', () => {
  it('round-trips the mode, the document, and the section', () => {
    const s = openDoc(setMode(INITIAL, 'library'), 'rb-03', '3-first-5-minutes')
    const url = encodeState(s)
    expect(url).toContain('mode=library')
    expect(url).toContain('doc=rb-03')
    expect(url).toContain('sec=3-first-5-minutes')
    const back = decodeState(`#${url}`)
    expect([back.mode, back.doc, back.sec]).toEqual(['library', 'rb-03', '3-first-5-minutes'])
  })

  it('writes no document for the list, and no section for the top of a document', () => {
    expect(encodeState(INITIAL)).not.toContain('doc=')
    const s = openDoc(INITIAL, 'rb-03')
    expect(encodeState(s)).toContain('doc=rb-03')
    expect(encodeState(s)).not.toContain('sec=')
  })

  it('drops a document that the portal does not carry, so that a stale link opens the list', () => {
    expect(decodeState('#mode=library&doc=no-such-doc').doc).toBeNull()
    expect(decodeState('#mode=library&doc=modules/m05').doc).toBeNull()
  })

  it('keeps the mode that the reader came from, and a link has no return path', () => {
    const fromExplore = openDoc(setMode(INITIAL, 'explore'), 'rb-03')
    expect(fromExplore.docFrom).toBe('explore')
    expect(decodeState('#mode=library&doc=rb-03').docFrom).toBeNull()
    expect(closeDoc(fromExplore).mode).toBe('explore')
    expect(closeDoc(fromExplore).doc).toBeNull()
  })

  it('keeps the return path when the reader opens another document from the body', () => {
    const first = openDoc(INITIAL, 'rb-03')
    expect(openDoc(first, 'rb-01', 'overview').docFrom).toBe('explore')
  })
})
