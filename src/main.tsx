import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useUi } from './state/ui'
import { App } from './ui/App'
import { applyTheme } from './ui/theme'
import './ui/styles.css'

applyTheme(useUi.getState().theme) // before the first render, so the page does not flash

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
