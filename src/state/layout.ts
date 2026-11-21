import { create } from 'zustand'

// The height of the trace bar: the canvas starts below it, and the view fits again when it changes.
export const useLayout = create<{ bar: number; setBar: (bar: number) => void }>()((set) => ({
  bar: 0,
  setBar: (bar) => set({ bar }),
}))
