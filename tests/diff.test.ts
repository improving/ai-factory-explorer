import { describe, expect, it } from 'vitest'
import { alsoChanged } from '../src/config/diff'
import { DEFAULT_CONFIG } from '../src/config/config'
import { withPatch } from '../src/config/rules'

describe('alsoChanged', () => {
  it('gives the switches that a change forced, not the one that the user changed', () => {
    const after = withPatch(DEFAULT_CONFIG, { platform: 'gb300-nvl72' })!
    const forced = alsoChanged(DEFAULT_CONFIG, after, ['platform'])
    expect(forced).not.toContain('platform')
    expect(forced.length).toBeGreaterThan(0)
    expect(alsoChanged(DEFAULT_CONFIG, DEFAULT_CONFIG, [])).toEqual([])
  })
})
