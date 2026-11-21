import { create } from 'zustand'

// The two parts of the topo -m cell that the user clicked: a highlight of the canvas only, not in the URL.
export const useHighlight = create<{ pair: string[]; setPair: (pair: string[]) => void }>()((set) => ({
  pair: [],
  setPair: (pair) => set({ pair }),
}))
