import { describe, expect, it } from 'vitest'
import { PLAY_MS, stopPlay, usePlay } from '../src/state/play'

describe('play', () => {
  it('has three speeds, fast first', () => {
    expect(PLAY_MS).toEqual({ fast: 400, normal: 1000, slow: 2000 })
    expect(usePlay.getState()).toMatchObject({ playing: false, speed: 'fast' })
  })
  it('stopPlay stops it and keeps the speed', () => {
    usePlay.setState({ playing: true, speed: 'slow' })
    stopPlay()
    expect(usePlay.getState()).toMatchObject({ playing: false, speed: 'slow' })
  })
})
