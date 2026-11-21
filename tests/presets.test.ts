import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config/config'
import { PRESETS, presetOf } from '../src/config/presets'
import { withPatch } from '../src/config/rules'

describe('presets', () => {
  it.each(PRESETS)('$id applies to the default configuration', (p) => {
    expect(withPatch(DEFAULT_CONFIG, p.config)).not.toBeNull()
  })
  it('have unique ids', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length)
  })
  it('find the preset of a configuration at any scale and with any panel 4-6 values', () => {
    expect(presetOf(DEFAULT_CONFIG)?.id).toBe('superpod-b300-xdr')
    expect(presetOf({ ...DEFAULT_CONFIG, suCount: 8 })?.id).toBe('superpod-b300-xdr')
    expect(presetOf({ ...DEFAULT_CONFIG, cboxes: 16 })?.id).toBe('superpod-b300-xdr')
    expect(presetOf({ ...DEFAULT_CONFIG, topology: 'tor' })).toBeUndefined()
  })
  it('do not set a site scale', () => {
    for (const p of PRESETS) {
      expect(p.config.spares, p.id).toBeUndefined()
      expect(p.config.cboxes, p.id).toBeUndefined()
    }
  })
})
