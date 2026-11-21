import { create } from 'zustand'

export type Speed = 'fast' | 'normal' | 'slow'

// The time on each hop when a trace plays (the user: "fast" is the default).
export const PLAY_MS: Record<Speed, number> = { fast: 400, normal: 1000, slow: 2000 }

// Play is a state of the page only: a URL opens a trace on its hop and does not play it.
export const usePlay = create<{ playing: boolean; speed: Speed }>()(() => ({ playing: false, speed: 'fast' }))

export const stopPlay = () => usePlay.setState({ playing: false })
