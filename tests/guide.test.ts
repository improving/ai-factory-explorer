import { describe, expect, it } from 'vitest'
import { GUIDES } from '../src/guides/guides'
import { setCollStep } from '../src/state/coll'
import { closeGuide, currentStep, openGuide, sameParams, stepNumber, stepShown } from '../src/state/guide'
import { INITIAL, withConfig } from '../src/state/transitions'
import { decodeState, encodeState } from '../src/state/url'

const each = () => GUIDES.flatMap((g) => g.steps.map((st, i) => ({ g, st, name: `${g.id} step ${i + 1}` })))

describe('the guides', () => {
  it('has the 6 guides of the spec and one for Schedule mode, each with 4 to 7 steps, each step with a title and a "Look at" text', () => {
    expect(GUIDES.map((g) => g.id)).toEqual(['first', 'trace', 'simulate', 'collectives', 'reader', 'parallelism', 'schedule'])
    for (const g of GUIDES) {
      expect(g.steps.length, g.id).toBeGreaterThanOrEqual(4)
      expect(g.steps.length, g.id).toBeLessThanOrEqual(8) // the time view added a step to First tour
      expect(g.title && g.goal, g.id).toBeTruthy()
    }
    for (const { st, name } of each()) expect(st.title && st.look, name).toBeTruthy()
  })

  it('gives the number of a step by its title, for the button of a panel', () => {
    expect(stepNumber('simulate', 'The verdict of the failure')).toBe(3)
    expect(stepNumber('simulate', 'The checklist of the runbook')).toBe(4)
    expect(stepNumber('first', 'The same map from three sources')).toBe(6)
    expect(stepNumber('schedule', 'A placed job')).toBe(1)
    expect(stepNumber('simulate', 'no such step')).toBeNull()
    expect(stepNumber('no-such-guide', 'A placed job')).toBeNull()
  })

  it('each step link keeps each of its values: a decode and an encode give the same parameters', () => {
    for (const { st, name } of each()) expect(sameParams(encodeState(decodeState(`#${st.hash}`)), st.hash), `${name}: ${st.hash}`).toBe(true)
  })

  it('each number with GB/s or % in the text of a step is in the text of one of its checks', () => {
    for (const { st, name } of each()) {
      for (const m of `${st.look} ${st.lesson ?? ''}`.matchAll(/(\d+(?:\.\d+)?) ?(?:GB\/s|%)/g)) {
        expect((st.checks ?? []).some((c) => c.text.includes(m[1]!)), `${name}: ${m[0]}`).toBe(true)
      }
    }
  })
})

describe('the guide state', () => {
  it('opens a step: the view of its link, and the guide; a change makes the step "not shown"', () => {
    const s = openGuide(INITIAL, 'collectives', 4)
    expect(s.guide).toEqual({ id: 'collectives', step: 4 })
    expect(s.mode).toBe('collectives')
    expect(s.coll!.scope).toBe('2n')
    expect(currentStep(s)!.step.title).toBe(GUIDES[3]!.steps[3]!.title)
    expect(stepShown(s)).toBe(true)
    expect(stepShown(setCollStep(s, 3))).toBe(false)
    expect(stepShown(withConfig(s, { suCount: 2 }))).toBe(false)
    expect(stepShown(openGuide(INITIAL, 'first', 1))).toBe(true)
  })

  it('Close removes the guide and keeps the view', () => {
    const s = openGuide(INITIAL, 'collectives', 4)
    const c = closeGuide(s)
    expect(c.guide).toBeNull()
    expect(c.coll).toEqual(s.coll)
    expect(closeGuide(c)).toBe(c)
  })

  it('refuses a guide or a step that does not exist', () => {
    expect(openGuide(INITIAL, 'nope', 1)).toBe(INITIAL)
    expect(openGuide(INITIAL, 'first', 0)).toBe(INITIAL)
    expect(openGuide(INITIAL, 'first', 99)).toBe(INITIAL)
    expect(currentStep(INITIAL)).toBeNull()
  })

  it('keeps the guide in the URL; a bad value gives no guide', () => {
    const s = openGuide(INITIAL, 'collectives', 4)
    expect(encodeState(s)).toContain('guide=collectives.4')
    expect(decodeState(`#${encodeState(s)}`).guide).toEqual({ id: 'collectives', step: 4 })
    expect(decodeState('#guide=nope.1').guide).toBeNull()
    expect(decodeState('#guide=first.0').guide).toBeNull()
    expect(decodeState('#guide=first.99').guide).toBeNull()
    expect(decodeState('#guide=first').guide).toBeNull()
    expect(encodeState(INITIAL)).not.toContain('guide')
  })

  it('compares links as sets of parameters, and leaves out the guide', () => {
    expect(sameParams('a=1&b=x/y', 'b=x%2Fy&a=1')).toBe(true)
    expect(sameParams('a=1&guide=first.2', 'a=1')).toBe(true)
    expect(sameParams('a=1', 'a=2')).toBe(false)
  })
})
