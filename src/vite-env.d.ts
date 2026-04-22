/// <reference types="vite/client" />

import type { ElectronAPI } from './types/electron-api'

declare global {
  const __WEB_RUNTIME__: boolean
  const __APP_VERSION__: string

  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
