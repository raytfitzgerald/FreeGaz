import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { ensureBridge } from './platform/bridge'
import { router } from './app/router'
import { startTheme } from './app/theme'
import { initRuntime, startAutoConnect } from './runtime/composition'
import { startFanControl } from './runtime/fan'
import { loadSettings } from './stores/settings'
import './styles.css'

const bridge = ensureBridge()
const info = await bridge.invoke('app.info', {})
await loadSettings()
startTheme()
const runtime = initRuntime(info)
startFanControl(runtime)

const root = document.getElementById('root')
if (!root) throw new Error('#root missing')

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

void startAutoConnect(runtime)
