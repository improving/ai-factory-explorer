// The label rules of the nccl-tests chart (dataviz: no label collision).

// The x labels to show: the first one, then each one at least `minGap` after the last label that shows.
export function thinTicks(xs: number[], minGap: number): boolean[] {
  let last = -Infinity
  return xs.map((x) => {
    if (x - last < minGap) return false
    last = x
    return true
  })
}

// The y of labels that must not cover each other: in their order, each at least `gap` below the one before; the group
// keeps its centre where it can.
export function spreadLabels(ys: number[], gap: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  const out = order.map((o) => o.y)
  for (let k = 1; k < out.length; k++) out[k] = Math.max(out[k]!, out[k - 1]! + gap)
  const shift = (order.reduce((a, o) => a + o.y, 0) - out.reduce((a, y) => a + y, 0)) / out.length
  const res = new Array<number>(ys.length)
  order.forEach((o, k) => (res[o.i] = out[k]! + shift))
  return res
}
