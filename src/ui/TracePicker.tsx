import { useEffect, useMemo, useState } from 'react'
import { platformFor } from '../catalog/platforms'
import { useApp } from '../state/store'
import { pickGpu } from '../state/transitions'
import { designOf } from '../topology/fabric'
import { partId, serverExists, serverId, serverOf, suOf } from '../topology/ids'

// Select a GPU for the trace from any view: an SU, a server (or an NVL72 tray) of it, and a GPU. The first GPU is
// the source, the second the destination (as a click on a GPU in a node view).
export function TracePicker() {
  const { config, trace, set } = useApp()
  const perSu = designOf(config).serversPerSu.value
  const gpus = platformFor(config).gpusPerServer.value
  const source = trace ? serverOf(trace.src) : null
  const [pickedSu, setSu] = useState(source ? (suOf(source) ?? 1) : 1)
  const su = Math.min(pickedSu, config.suCount) // a smaller scale: the last SU
  // The servers (or NVL72 trays) of one SU only, with no graph.
  const servers = useMemo(() => Array.from({ length: perSu }, (_, i) => serverId(su, i + 1)).filter((id) => serverExists(config, id)), [config, su, perSu])
  const [server, setServer] = useState(source ?? servers[0] ?? '')
  const [pickedGpu, setGpu] = useState(0)
  const gpu = pickedGpu < gpus ? pickedGpu : 0 // another platform: the select and the pick use the same GPU
  useEffect(() => {
    // A new source: the lists start at its server.
    if (source) {
      setSu(suOf(source) ?? 1)
      setServer(source)
    }
  }, [source])
  useEffect(() => {
    if (!servers.includes(server)) setServer(servers[0] ?? '')
  }, [servers, server])

  const use = () =>
    set((s) => {
      const next = pickGpu(s, partId(server, `gpu${gpu}`))
      // A source that the view does not draw (the fabric, the overview, another server): no selection.
      const drawn = next.view.level === 'node' && next.view.serverId === server
      return next.trace && next.trace.dst === null && !drawn ? { ...next, selected: null } : next
    })

  return (
    <span className="group trace-picker" data-testid="trace-picker">
      {config.suCount > 1 && (
        <select aria-label="SU" value={su} onChange={(e) => setSu(Number(e.target.value))}>
          {Array.from({ length: config.suCount }, (_, i) => (
            <option key={i} value={i + 1}>
              SU {i + 1}
            </option>
          ))}
        </select>
      )}
      <select aria-label="Server" value={server} onChange={(e) => setServer(e.target.value)}>
        {servers.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      <select aria-label="GPU" value={gpu} onChange={(e) => setGpu(Number(e.target.value))}>
        {Array.from({ length: gpus }, (_, i) => (
          <option key={i} value={i}>
            GPU {i}
          </option>
        ))}
      </select>
      <button type="button" disabled={!server} onClick={use}>
        Use this GPU
      </button>
    </span>
  )
}
