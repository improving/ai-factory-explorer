import { platformFor } from '../catalog/platforms'
import { useApp } from '../state/store'
import { setFace, setTopo } from '../state/transitions'

// Front and rear of the racks (a rack level); the topo -m matrix (the node view of an HGX server).
export function ViewTools() {
  const { view, config, overlay, mode, set } = useApp()
  if (mode === 'collectives') return null // the canvas shows the ring, not the view
  if (view.level === 'node') {
    if (platformFor(config).form !== 'hgx8') return null
    return (
      <div className="viewtools">
        <button type="button" data-testid="topo-toggle" aria-pressed={overlay.topo} onClick={() => set((s) => setTopo(s, !s.overlay.topo))}>
          nvidia-smi topo -m
        </button>
      </div>
    )
  }
  if (view.level !== 'racks' && view.level !== 'rack') return null
  return (
    <div className="viewtools">
      {(['front', 'rear'] as const).map((face) => (
        <button key={face} type="button" data-testid={`face-${face}`} aria-pressed={view.face === face} onClick={() => set((s) => setFace(s, face))}>
          {face === 'front' ? 'Front' : 'Rear'}
        </button>
      ))}
    </div>
  )
}
