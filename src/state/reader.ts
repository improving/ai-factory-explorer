import { create } from 'zustand'
import type { Collective } from '../collectives/schedule'

// The nccl-tests reader: a state of the page only. The pasted output does not go into the URL or the storage.
// collective: the choice of the user when the output does not name its test; limit: a typed limit (GB/s) for a run
// with no scope of the app; threshold: the percentage of the limit that passes, as typed (COLL_FACTS.readerThreshold).
export type Reader = { open: boolean; text: string; threshold: string; collective: Collective | null; limit: string }
export const useReader = create<Reader>()(() => ({ open: false, text: '', threshold: '80', collective: null, limit: '' }))

// The threshold as a number: 1 to 100; an empty or bad field gives 80.
export function thresholdOf(text: string): number {
  const v = Number(text)
  return text.trim() === '' || !Number.isFinite(v) ? 80 : Math.min(100, Math.max(1, v))
}
