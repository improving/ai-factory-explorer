import { useRef, useState } from 'react'
import { useApp } from '../state/store'
import { useCy } from '../state/cy'
import { useUi } from '../state/ui'
import { designOf } from '../topology/fabric'
import { GuideList } from './GuideList'
import { ThemeSwitch } from './ThemeSwitch'
import { BookIcon, HelpIcon, ImageIcon, LinkIcon, MapIcon } from './icons'

export const HELP_DIALOG = 'help-dialog'

const MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

// The tools at the right end of the header: the map, the PNG, help, the theme, and a link to this view.
export function HeaderTools() {
  const config = useApp((s) => s.config)
  const mode = useApp((s) => s.mode)
  const view = useApp((s) => s.view)
  const cy = useCy((s) => s.cy)
  const map = useUi((u) => u.map)
  const help = useRef<HTMLDialogElement>(null)
  const guides = useRef<HTMLDialogElement>(null)
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const rails = designOf(config).rails.value

  // The graph, not the page: the panels and the header are not in the PNG.
  const savePng = () => {
    if (!cy) return
    const where = view.level === 'rack' ? `-${view.rackId}` : view.level === 'node' ? `-${view.serverId}` : view.level === 'racks' ? `-su${view.su}` : ''
    const a = document.createElement('a')
    a.href = cy.png({ full: true, scale: 2 })
    a.download = `ai-factory-${mode}-${view.level}${where}.png`
    a.click()
  }

  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(location.href)
      setCopy('copied')
      setTimeout(() => setCopy('idle'), 2000)
    } catch {
      setCopy('failed') // file:// or no permission: show the link to copy by hand
    }
  }

  return (
    <div className="header-tools">
      <button type="button" className="icon" data-testid="guides-open" aria-label="Guides" title="Guided tours of each mode" onClick={() => guides.current?.showModal()}>
        <BookIcon />
      </button>
      <button type="button" className="icon" aria-label="Help" title="Help and keys (?)" onClick={() => help.current?.showModal()}>
        <HelpIcon />
      </button>
      <ThemeSwitch />
      <button type="button" className="icon" data-testid="toggle-map" aria-pressed={map} aria-label={map ? 'Hide map' : 'Show map'} title={map ? 'Hide the map' : 'Show the map'} onClick={() => useUi.setState({ map: !map })}>
        <MapIcon />
      </button>
      <button type="button" className="icon" data-testid="save-png" aria-label="Save a PNG" title="Save the graph as a PNG (the panels are not in it)" onClick={savePng}>
        <ImageIcon />
      </button>
      <button type="button" className="icon" aria-label="Copy link" title="Copy the link to this view" onClick={copyLink}>
        <LinkIcon />
      </button>
      <span className="copy-status" data-testid="copy-status" role="status">
        {copy === 'copied' ? 'Copied' : copy === 'failed' ? `Press ${MAC ? 'Cmd' : 'Ctrl'}+C` : ''}
      </span>
      {copy === 'failed' && <input className="copy-box" readOnly value={location.href} aria-label="The link to this view" ref={(el) => el?.select()} onBlur={() => setCopy('idle')} />}
      <dialog ref={help} id={HELP_DIALOG} aria-label="How to use" className="help-dialog" onClick={(e) => e.target === help.current && help.current?.close()}>
        <h2>How to use</h2>
        <ul className="help">
          <li>New here? Start with Guides → First tour.</li>
          <li>Select a preset, or change one switch: the switches after it follow.</li>
          <li>Click "Factory" (or press Esc in the fabric) for the overview of all networks; double-click the pods to open the fabric.</li>
          <li>Double-click an SU to open or close it; double-click a server, or an NVL72 tray, to see inside it.</li>
          <li>Click a part to see it in the inspector. Trace and Simulate are the other two modes.</li>
          <li>The URL keeps the view: Copy link gives it to another person.</li>
        </ul>
        <h3>Keys</h3>
        <ul className="help">
          <li>/: search for a part or a runbook.</li>
          <li>Esc: up one level.</li>
          <li>0 to {rails - 1}: highlight one rail.</li>
          <li>← →: the previous or the next hop of a trace.</li>
          <li>Tab: on the canvas, the next part; Shift+Tab, the previous one. Enter opens it in the inspector.</li>
          <li>+ −: zoom in or out.</li>
          <li>?: this help.</li>
        </ul>
        <form method="dialog">
          <button type="submit">Close</button>
        </form>
      </dialog>
      <GuideList dialog={guides} />
    </div>
  )
}
