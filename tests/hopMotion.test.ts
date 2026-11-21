import { describe, expect, it } from 'vitest'
import { packetDuration, startAnts } from '../src/ui/hopMotion'

describe('packetDuration', () => {
  it('takes less time than a hop while Play runs, and a fixed time when the trace is still', () => {
    expect(packetDuration(400)).toBe(320)
    expect(packetDuration(2000)).toBe(1600)
    expect(packetDuration(null)).toBe(900)
  })
})
describe('startAnts', () => {
  it('does nothing with reduced motion or no edge', () => {
    const el = { dataset: {} as Record<string, string> } as unknown as HTMLElement
    const none = { empty: () => true } as never
    const cy = { destroyed: () => false } as never
    startAnts(cy, none, { reduced: false, el })()
    expect(el.dataset.ants).toBe('off')
    startAnts(cy, { empty: () => false } as never, { reduced: true, el })()
    expect(el.dataset.ants).toBe('off')
  })
})
