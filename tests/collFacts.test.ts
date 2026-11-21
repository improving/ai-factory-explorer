import { describe, expect, it } from 'vitest'
import { COLL_FACTS } from '../src/catalog/collectives'
import type { Fact } from '../src/catalog/fact'

// A confirmed fact says only what its source says: what the app does is assumed, with a note.
describe('the facts of Collectives mode', () => {
  it('has no confirmed fact that describes the app', () => {
    const flat = Object.entries(COLL_FACTS).flatMap(([k, v]) => ('status' in v ? [[k, v as Fact<string>] as const] : Object.entries(v as Record<string, Fact<string>>)))
    expect(flat.filter(([, f]) => f.status === 'confirmed' && /\bthe app\b/.test(f.value)).map(([k]) => k)).toEqual([])
  })
})
