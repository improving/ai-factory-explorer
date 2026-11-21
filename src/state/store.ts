import { create } from 'zustand'
import type { AppState } from './transitions'
import { decodeState } from './url'

export type Store = AppState & { set: (f: (s: AppState) => AppState) => void }

export const useApp = create<Store>()((set) => ({
  ...decodeState(typeof location === 'undefined' ? '' : location.hash),
  set: (f) => set((s) => f(s)),
}))
