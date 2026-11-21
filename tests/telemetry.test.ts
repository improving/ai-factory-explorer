import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { INITIAL, withConfig } from '../src/state/transitions'
import { assignments } from '../src/topology/assign'
import { SPAN, WINDOW_MIN, atOf, clockOf, clockShort, eventsOf, eventsOfHost, hostEvents, stripOf } from '../src/telemetry/events'
import { replayAt } from '../src/telemetry/replay'

const cfg = (patch: Partial<Config>): Config => withConfig(INITIAL, patch).config
const EVENTS = eventsOf(DEFAULT_CONFIG)

describe('the clock of the log', () => {
  it('names the day and the minute', () => {
    expect(clockOf(0)).toBe('day 1, 00:00')
    expect(clockOf(1439)).toBe('day 1, 23:59')
    expect(clockOf(1440)).toBe('day 2, 00:00')
    expect(clockOf(6 * 1440 + 14 * 60 + 20)).toBe('day 7, 14:20')
    expect(clockShort(6 * 1440 + 14 * 60 + 20)).toBe('14:20')
  })

  it('maps a cursor of a window to a minute of the log, and the window ends now', () => {
    expect(atOf('7d', 0)).toBe(0)
    expect(atOf('7d', SPAN)).toBe(SPAN - 1) // the last minute of the log
    expect(atOf('24h', 0)).toBe(SPAN - WINDOW_MIN['24h'])
    expect(atOf('24h', 1440)).toBe(SPAN - 1)
    expect(atOf('24h', 99999)).toBe(SPAN - 1) // a cursor outside the window stops at the end
    expect(atOf('24h', -5)).toBe(SPAN - 1440)
  })
})

describe('the events of the fleet', () => {
  it('gives the same week for the same configuration', () => {
    expect(eventsOf(DEFAULT_CONFIG)).toEqual(EVENTS)
  })

  it('gives a host the same week in another configuration', () => {
    const two = eventsOf(cfg({ suCount: 2 }))
    const one = hostEvents(EVENTS, 'su1-n05')
    const both = hostEvents(two, 'su1-n05')
    expect(both.map((e) => [e.at, e.kind, e.note])).toEqual(one.map((e) => [e.at, e.kind, e.note]))
    expect(hostEvents(two, 'su2-n05').length).toBeGreaterThan(0) // the new SU has its own week
  })

  it('has an event for the firmware window of every host, and an Xid for a few', () => {
    const hosts = [...assignments(DEFAULT_CONFIG).keys()]
    for (const id of hosts) {
      const own = hostEvents(EVENTS, id)
      expect(own.some((e) => e.kind === 'drain' && e.note.includes('firmware'))).toBe(true)
    }
    const xids = EVENTS.filter((e) => e.kind === 'xid')
    expect(xids.length).toBeGreaterThan(0)
    expect(xids.length).toBeLessThan(hosts.length / 2)
  })

  it('keeps the events in time order, inside the log', () => {
    for (let i = 1; i < EVENTS.length; i++) expect(EVENTS[i]!.at).toBeGreaterThanOrEqual(EVENTS[i - 1]!.at)
    expect(EVENTS[0]!.at).toBeGreaterThanOrEqual(0)
    expect(EVENTS.at(-1)!.at).toBeLessThan(SPAN)
  })

  it('closes every chain: the state at the end of the log is the state of the configuration', () => {
    const end = replayAt(DEFAULT_CONFIG, EVENTS, SPAN)
    for (const [id, a] of assignments(DEFAULT_CONFIG)) expect([id, end.get(id)!.state]).toEqual([id, a.state])
  })

  it('returns to the state that the host had, after a drain and after a repair', () => {
    const id = 'su1-n05'
    const own = hostEvents(EVENTS, id)
    const start = assignments(DEFAULT_CONFIG).get(id)!.state
    const drain = own.find((e) => e.kind === 'drain')!
    const release = own.find((e) => e.kind === 'release')!
    expect(replayAt(DEFAULT_CONFIG, EVENTS, drain.at - 1).get(id)!.state).toBe(start)
    expect(replayAt(DEFAULT_CONFIG, EVENTS, drain.at).get(id)!.state).toBe('maintenance')
    expect(replayAt(DEFAULT_CONFIG, EVENTS, release.at).get(id)!.state).toBe(start)
  })

  it('quarantines the host of an Xid until the repair', () => {
    const xid = EVENTS.find((e) => e.kind === 'xid')!
    const repair = hostEvents(EVENTS, xid.host).find((e) => e.kind === 'repair' && e.at > xid.at)!
    expect(replayAt(DEFAULT_CONFIG, EVENTS, xid.at).get(xid.host)!.state).toBe('quarantined')
    expect(replayAt(DEFAULT_CONFIG, EVENTS, repair.at).get(xid.host)!.state).not.toBe('quarantined')
  })

  it('counts the signals up to the cursor, and not after it', () => {
    const last = EVENTS.at(-1)!
    const all = replayAt(DEFAULT_CONFIG, EVENTS, SPAN)
    const host = [...all.keys()].find((id) => all.get(id)!.throttles > 0)!
    const own = hostEvents(EVENTS, host)
    const firstThrottle = own.find((e) => e.kind === 'throttle')!
    expect(replayAt(DEFAULT_CONFIG, EVENTS, firstThrottle.at - 1).get(host)!.throttles).toBe(0)
    expect(replayAt(DEFAULT_CONFIG, EVENTS, firstThrottle.at).get(host)!.throttles).toBe(1)
    expect(replayAt(DEFAULT_CONFIG, EVENTS, SPAN).get(last.host)!.xids).toBeGreaterThanOrEqual(0)
  })

  it('gives every host of the configuration a state at every minute', () => {
    const at = replayAt(DEFAULT_CONFIG, EVENTS, 0)
    expect(at.size).toBe(assignments(DEFAULT_CONFIG).size)
    expect(replayAt(DEFAULT_CONFIG, EVENTS, SPAN).size).toBe(at.size)
  })

  it('is quick at 18 SUs', () => {
    const big = cfg({ suCount: 18 })
    const started = Date.now()
    const events = eventsOf(big)
    const at = replayAt(big, events, SPAN / 2)
    expect(events.length).toBeGreaterThan(5000)
    expect(at.size).toBe(assignments(big).size)
    expect(Date.now() - started).toBeLessThan(3000)
  })

  it('a host with no event of a kind has none', () => {
    const quiet = eventsOfHost('su1-n01', 'available').filter((e) => e.kind === 'xid')
    expect(quiet.length).toBe(0)
  })
})

describe('the strip of the bar', () => {
  it('gives the buckets that it is asked for, and the count of each one', () => {
    const strip = stripOf(EVENTS, 0, SPAN, 140)
    expect(strip).toHaveLength(140)
    expect(strip.reduce((n, b) => n + b.count, 0)).toBe(EVENTS.length)
    expect(strip[0]!.at).toBe(0)
  })

  it('keeps the worst kind of a bucket: an Xid over a signal over a state change', () => {
    const e = (at: number, kind: 'drain' | 'throttle' | 'xid') => ({ at, host: 'su1-n01', kind, note: '' })
    const strip = stripOf([e(5, 'drain'), e(15, 'drain'), e(15, 'throttle'), e(25, 'xid')], 0, 30, 3)
    expect(strip.map((b) => [b.count, b.kind])).toEqual([
      [1, 'state'],
      [2, 'signal'],
      [1, 'xid'],
    ])
    const all = stripOf(EVENTS, 0, SPAN, SPAN / 1440) // one bucket for each day
    expect(all.every((b) => b.kind !== 'none' && b.count > 0)).toBe(true)
    expect(all.some((b) => b.kind === 'xid')).toBe(true)
  })

  it('counts only the events of its range', () => {
    const lastDay = stripOf(EVENTS, SPAN - 1440, SPAN, 24)
    const inRange = EVENTS.filter((e) => e.at >= SPAN - 1440 && e.at < SPAN).length
    expect(lastDay.reduce((n, b) => n + b.count, 0)).toBe(inRange)
  })

  it('a range with no event has empty buckets', () => {
    const none = stripOf([], 0, SPAN, 20)
    expect(none.every((b) => b.count === 0 && b.kind === 'none')).toBe(true)
  })
})

describe('the initial state', () => {
  it('has the time view off', () => {
    expect(INITIAL.time).toBeNull()
  })
})
