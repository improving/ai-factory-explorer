// A seeded PRNG, so that a load run is a function of its seed and a link gives the same numbers.
// The app has no Math.random: a screenshot, a test, and a link must agree.
export type Rng = () => number

// mulberry32: 32 bits of state, a good distribution for a model of this size, and ten lines.
export function makeRng(seed: number): Rng {
  let a = (Number.isFinite(seed) ? Math.round(seed) : 0) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// An integer from a to b, both included.
export const intBetween = (rng: Rng, a: number, b: number): number => a + Math.floor(rng() * (b - a + 1))

// One item of a weighted list. The weights do not have to add to 100.
export function pickWeighted<T>(rng: Rng, items: { v: T; w: number }[]): T {
  const total = items.reduce((n, i) => n + i.w, 0)
  let x = rng() * total
  for (const item of items) {
    x -= item.w
    if (x < 0) return item.v
  }
  return items[items.length - 1]!.v
}
