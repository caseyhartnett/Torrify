/**
 * Preload script for Electron.
 * Exposes a secure API to the renderer process via `contextBridge`.
 */
import { contextBridge, ipcRenderer } from 'electron'
import type {
  CADBackend,
  ElectronAPI,
  LLMRequestPayload,
  ProjectFile,
  Settings
} from '../src/types/electron-api'

/**
 * The API exposed to the renderer process via `window.electronAPI`.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /** Renders OpenSCAD code to a preview image */
  renderScad: (code: string) => ipcRenderer.invoke('render-scad', code),

  /** Renders CAD code (OpenSCAD or build123d) to STL data */
  renderStl: (code: string) => ipcRenderer.invoke('render-stl', code),

  /** Saves a project file (.torrify) to disk */
  saveProject: (project: ProjectFile, currentFilePath?: string) =>
    ipcRenderer.invoke('save-project', project, currentFilePath),

  /** Opens a project file from disk */
  loadProject: () => ipcRenderer.invoke('load-project'),

  /** Exports the raw source code to a file (e.g., .scad or .py) */
  exportScad: (code: string, backend?: CADBackend, currentFilePath?: string) =>
    ipcRenderer.invoke('export-scad', code, backend, currentFilePath),

  /** Exports the rendered STL data to a file */
  exportStl: (stlBase64: string | null, currentFilePath?: string) =>
    ipcRenderer.invoke('export-stl', stlBase64, currentFilePath),

  /** Returns the application's temporary directory path */
  getTempDir: () => ipcRenderer.invoke('get-temp-dir'),

  /** Loads the current application settings */
  getSettings: () => ipcRenderer.invoke('get-settings'),

  /** Saves the provided settings to disk */
  saveSettings: (settings: Settings) => ipcRenderer.invoke('save-settings', settings),

  /** Verifies if the specified OpenSCAD executable path is valid */
  checkOpenscadPath: (path: string) => ipcRenderer.invoke('check-openscad-path', path),

  /** Verifies if the specified Python interpreter path is valid for build123d */
  checkPythonPath: (path: string) => ipcRenderer.invoke('check-python-path', path),

  /** Validates if the selected CAD backend is properly configured */
  validateCadBackend: (backend: CADBackend) => ipcRenderer.invoke('validate-cad-backend', backend),

  /** Opens a native file picker to select the OpenSCAD executable */
  selectOpenscadPath: () => ipcRenderer.invoke('select-openscad-path'),

  /** Checks if the welcome/onboarding screen should be displayed */
  shouldShowWelcome: () => ipcRenderer.invoke('should-show-welcome'),

  /** Resets application settings to factory defaults */
  resetSettings: () => ipcRenderer.invoke('reset-settings'),

  /** Opens a native file picker to load a raw CAD source file */
  openScadFile: (backend?: CADBackend) => ipcRenderer.invoke('open-scad-file', backend || 'openscad'),

  /** Saves raw CAD source code directly to a file */
  saveScadFile: (code: string, filePath?: string, backend?: CADBackend) =>
    ipcRenderer.invoke('save-scad-file', code, filePath, backend || 'openscad'),

  /** Updates the main window title bar */
  setWindowTitle: (title: string) => ipcRenderer.invoke('set-window-title', title),

  /** Checks if OpenRouter is properly configured (API key exists) */
  getOpenRouterConfigured: () => ipcRenderer.invoke('get-openrouter-configured') as Promise<boolean>,

  /** Sends a message to the AI and waits for a full response */
  llmSendMessage: (payload: LLMRequestPayload) => ipcRenderer.invoke('llm-send-message', payload),

  /** Initiates a streaming response from the AI */
  llmStreamMessage: (payload: LLMRequestPayload) => ipcRenderer.invoke('llm-stream-message', payload),

  /** Aborts an active LLM streaming request */
  llmStreamAbort: (streamId: string) => ipcRenderer.invoke('llm-stream-abort', streamId),

  /** Registers a listener for streaming chunks from the main process */
  onLlmStreamChunk: (streamId: string, callback: (delta: string, full: string, done: boolean) => void) => {
    const handler = (_: unknown, data: { streamId: string; delta: string; full: string; done: boolean }) => {
      if (data.streamId === streamId) {
        callback(data.delta, data.full, data.done)
        if (data.done) {
          ipcRenderer.removeListener('llm-stream-chunk', handler)
        }
      }
    }
    ipcRenderer.on('llm-stream-chunk', handler)
  },

  /** Retrieves the list of recently opened files */
  getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),

  /** Clears the recent files history */
  clearRecentFiles: () => ipcRenderer.invoke('clear-recent-files'),

  /** Removes a specific file from the recent files list */
  removeRecentFile: (filePath: string) => ipcRenderer.invoke('remove-recent-file', filePath),

  /** Opens a file from the recent files list */
  openRecentFile: (filePath: string) => ipcRenderer.invoke('open-recent-file', filePath),

  /** Loads embedded application documentation */
  loadDocumentation: () => ipcRenderer.invoke('load-documentation'),

  /** Retrieves the knowledge base context for a specific backend */
  getContext: (backend: CADBackend) => ipcRenderer.invoke('get-context', backend),

  /** Returns the current synchronization status of the knowledge base */
  getContextStatus: () => ipcRenderer.invoke('get-context-status'),

  /** Updates the local knowledge base from a cloud-hosted repository */
  updateContextFromCloud: (backend: CADBackend, url: string) =>
    ipcRenderer.invoke('update-context-from-cloud', backend, url),

  /** Resets the knowledge base to the bundled factory version */
  resetContextToFactory: (backend?: CADBackend) => ipcRenderer.invoke('reset-context-to-factory', backend),

  /** Retrieves available models from a local Ollama instance */
  getOllamaModels: (endpoint?: string) => ipcRenderer.invoke('get-ollama-models', endpoint),

  /** Retrieves available models from an OpenAI-compatible custom endpoint */
  getCustomModels: (endpoint?: string) => ipcRenderer.invoke('get-custom-models', endpoint),

  /** Checks connectivity and basic compatibility for a custom endpoint */
  checkCustomConnection: (endpoint?: string) => ipcRenderer.invoke('check-custom-connection', endpoint),

  /** Registers a listener for menu-driven application events */
  onMenuEvent: (channel: string, callback: () => void) => {
    const validChannels = [
      'menu-new-file', 'menu-open-file', 'menu-save-file', 'menu-save-as',
      'menu-export-scad', 'menu-export-stl', 'menu-render',
      'menu-llm-toggle', 'menu-llm-byok', 'menu-llm-pro', 'menu-llm-settings',
      'menu-help-bot', 'menu-show-demo', 'menu-settings'
    ]
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel)
      ipcRenderer.on(channel, callback)
    }
  },

  /** Removes all menu listeners for a given channel */
  removeMenuListener: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  }
} satisfies ElectronAPI)
