import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ensureBridge } from './platform/bridge'
import { MiniHudApp } from './minihud/MiniHudApp'
import './brand/fonts'
import './styles.css'

ensureBridge()

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <MiniHudApp />
    </StrictMode>,
  )
}
