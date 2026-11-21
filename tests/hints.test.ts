import { describe, expect, it } from 'vitest'
import { openHint } from '../src/ui/hints'

describe('openHint', () => {
  it('says what a double-click does, and nothing for a part that does not open', () => {
    expect(openHint('server', undefined, 'fabric')).toBe('Double-click to open')
    expect(openHint('su', undefined, 'fabric')).toBe('Double-click to open or close')
    expect(openHint('block', 'pods', 'overview')).toBe('Double-click to open the fabric')
    expect(openHint('rack', undefined, 'racks')).toBe('Double-click to show its ports')
    expect(openHint('rack', undefined, 'node')).toBeNull()
    expect(openHint('tray', undefined, 'node')).toBeNull()
    expect(openHint('gpu', undefined, 'node')).toBeNull()
  })
})
