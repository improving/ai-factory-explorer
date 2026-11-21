// The id of a host seeds the models of the app (its week of events, its firmware), so su1-n01 has the same values
// in every configuration, and a reload gives the same picture.
export function idHash(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
