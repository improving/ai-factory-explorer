import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLayout } from '../state/layout'
import { useApp } from '../state/store'
import { setTimeCursor, setTimeWindow } from '../state/transitions'
import { SPAN, WINDOW_IDS, WINDOW_LABEL, WINDOW_MIN, atOf, clockOf, stripOf, type TelEvent } from '../telemetry/events'
import { PauseIcon, PlayIcon } from './icons'

const BUCKETS = 180
const TICKS = 120 // Play: the window in about 14 seconds

// The bar of the time view: the window, the cursor, and the strip of the events.
// It is over the fabric, the racks, and a server, and the overlays follow the cursor.
export function TimeBar({ events }: { events: TelEvent[] }) {
  const { mode, time, set } = useApp()
  const box = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  useLayoutEffect(() => {
    const el = box.current
    const setBar = useLayout.getState().setBar
    if (!el) return
    const measure = () => setBar(Math.ceil(el.getBoundingClientRect().height))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      ro.disconnect()
      setBar(0)
    }
  }, [mode])
  const len = time ? WINDOW_MIN[time.window] : 0
  const step = Math.max(5, Math.round(len / TICKS / 5) * 5)
  useEffect(() => {
    if (!playing || !time) return
    const id = setInterval(() => set((s) => setTimeCursor(s, (s.time?.cursor ?? 0) + step)), 120)
    return () => clearInterval(id)
  }, [playing, time?.window, step, set])
  useEffect(() => {
    if (playing && time && time.cursor >= len) setPlaying(false)
  }, [playing, time, len])
  const from = time ? SPAN - WINDOW_MIN[time.window] : 0
  const strip = useMemo(() => stripOf(events, from, from + len, BUCKETS), [events, from, len])
  const max = Math.max(1, ...strip.map((b) => b.count))
  if (mode !== 'explore' || !time) return null
  const at = atOf(time.window, time.cursor)
  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)))
    set((s) => setTimeCursor(s, Math.round(f * len)))
  }
  const play = () => {
    if (time.cursor >= len) set((s) => setTimeCursor(s, 0))
    setPlaying((p) => !p)
  }
  return (
    <div className="tracebar rows timebar" data-testid="timebar" ref={box}>
      <div className="tb-row">
        <span className="modes" role="radiogroup" aria-label="Window of the log">
          {WINDOW_IDS.map((w) => (
            <button key={w} type="button" role="radio" aria-checked={time.window === w} data-testid={`time-window-${w}`} onClick={() => set((s) => setTimeWindow(s, w))}>
              {WINDOW_LABEL[w]}
            </button>
          ))}
        </span>
        <button type="button" className="play" data-testid="time-play" aria-pressed={playing} onClick={play}>
          {playing ? <PauseIcon /> : <PlayIcon />} {playing ? 'Pause' : time.cursor >= len ? 'Play again' : 'Play'}
        </button>
        <input
          data-testid="time-cursor"
          className="time-slider"
          type="range"
          min={0}
          max={len}
          step={5}
          value={time.cursor}
          aria-label="The minute of the window"
          onChange={(e) => set((s) => setTimeCursor(s, Number(e.target.value)))}
        />
        <b data-testid="time-clock">{clockOf(at)}</b>
        <button type="button" data-testid="time-now" disabled={time.cursor >= len} onClick={() => set((s) => setTimeCursor(s, len))}>
          Now
        </button>
        <span className="status-line" data-testid="time-status">
          {strip.reduce((n, b) => n + b.count, 0)} events in the window
        </span>
      </div>
      <div className="tb-row">
        <svg className="time-strip" data-testid="time-strip" viewBox={`0 0 ${BUCKETS} 18`} preserveAspectRatio="none" role="img" aria-label="The events of the window" onClick={pick}>
          {strip.map((b, i) => (
            <rect key={i} x={i} y={18 - (16 * Math.sqrt(b.count)) / Math.sqrt(max)} width={1} height={(16 * Math.sqrt(b.count)) / Math.sqrt(max)} className={`tb-${b.kind}`} />
          ))}
          <rect x={(time.cursor / len) * BUCKETS - 0.2} y={0} width={0.4} height={18} className="tb-cursor" />
        </svg>
      </div>
    </div>
  )
}
