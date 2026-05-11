import { ipcMain, dialog, app } from 'electron'
import * as fs from 'fs'
import {
  SettingsSchema,
  FilePathSchema,
  CADBackendSchema
} from '../validation/schemas'
import { createCADService } from '../cad'
import {
  getCurrentSettings,
  setCurrentSettings,
  saveSettings,
  loadSettings
} from '../settings'
import { SETTINGS_FILE } from '../constants'
import { FETCH_TIMEOUT_MS } from '../constants'
import { createCappedBuffer } from '../cad/process-utils'
import { getErrorMessage } from '../utils/error'
import { logger } from '../utils/logger'
import type { Settings } from '../settings/types'

const LOCAL_OLLAMA_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function normalizeOllamaEndpoint(endpointInput: unknown): { ok: true; endpoint: string } | { ok: false; error: string } {
  if (endpointInput === undefined || endpointInput === null || endpointInput === '') {
    return { ok: true, endpoint: 'http://127.0.0.1:11434' }
  }
  if (typeof endpointInput !== 'string' || endpointInput.length > 2048) {
    return { ok: false, error: 'Invalid Ollama endpoint' }
  }
  try {
    const url = new URL(endpointInput.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, error: 'Invalid Ollama endpoint protocol' }
    }
    const allowRemote = process.env.TORRIFY_ALLOW_REMOTE_OLLAMA === '1'
    if (!allowRemote && !LOCAL_OLLAMA_HOSTS.has(url.hostname)) {
      return {
        ok: false,
        error: 'Remote Ollama endpoints are blocked by default. Set TORRIFY_ALLOW_REMOTE_OLLAMA=1 to allow.'
      }
    }
    return { ok: true, endpoint: url.toString().replace(/\/+$/, '') }
  } catch {
    return { ok: false, error: 'Invalid Ollama endpoint' }
  }
}

function normalizeCustomEndpoint(endpointInput: unknown): { ok: true; endpoint: string } | { ok: false; error: string } {
  if (endpointInput === undefined || endpointInput === null || endpointInput === '') {
    return { ok: true, endpoint: 'http://127.0.0.1:1234/v1' }
  }
  if (typeof endpointInput !== 'string' || endpointInput.length > 2048) {
    return { ok: false, error: 'Invalid custom endpoint' }
  }
  try {
    const url = new URL(endpointInput.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, error: 'Invalid custom endpoint protocol' }
    }
    return { ok: true, endpoint: url.toString().replace(/\/+$/, '') }
  } catch {
    return { ok: false, error: 'Invalid custom endpoint' }
  }
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('get-settings', () => {
    return getCurrentSettings()
  })

  ipcMain.handle('get-openrouter-configured', () => {
    return !!process.env.OPENROUTER_API_KEY?.trim()
  })

  ipcMain.handle('save-settings', (_event, settingsInput: unknown) => {
    const parseResult = SettingsSchema.safeParse(settingsInput)
    if (!parseResult.success) {
      return { success: false, error: 'Invalid settings format' }
    }
    const settings: Settings = parseResult.data
    setCurrentSettings(settings)
    saveSettings(settings)
    return { success: true }
  })

  ipcMain.handle('check-openscad-path', (_event, pathInput: unknown) => {
    const parseResult = FilePathSchema.safeParse(pathInput)
    if (!parseResult.success) {
      return false
    }
    return fs.existsSync(parseResult.data)
  })

  ipcMain.handle('validate-cad-backend', async (_event, backendInput: unknown) => {
    const parseResult = CADBackendSchema.safeParse(backendInput)
    if (!parseResult.success) {
      return { valid: false, error: 'Invalid backend' }
    }
    const backend = parseResult.data
    const currentSettings = getCurrentSettings()
    try {
      const cadService = createCADService({
        backend,
        openscadPath: currentSettings.openscadPath,
        build123dPythonPath: currentSettings.build123dPythonPath
      })
      return await cadService.validateSetup()
    } catch (error) {
      return { valid: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('check-python-path', async (_event, pathInput: unknown) => {
    const parseResult = FilePathSchema.safeParse(pathInput)
    if (!parseResult.success) {
      return { valid: false, error: 'Invalid path' }
    }
    const pythonPath = parseResult.data
    const { spawn } = await import('child_process')

    return new Promise((resolve) => {
      const proc = spawn(pythonPath, ['--version'], { windowsHide: true })

      const stdoutBuf = createCappedBuffer()
      proc.stdout?.on('data', (data) => stdoutBuf.append(data))

      const timeout = setTimeout(() => {
        proc.kill()
        resolve({ valid: false, error: 'Timeout checking Python' })
      }, 5000)

      proc.on('close', (code) => {
        clearTimeout(timeout)
        if (code === 0) {
          resolve({ valid: true, version: stdoutBuf.rawValue.trim() })
        } else {
          resolve({ valid: false, error: 'Python not found' })
        }
      })

      proc.on('error', () => {
        clearTimeout(timeout)
        resolve({ valid: false, error: 'Python executable not found' })
      })
    })
  })

  ipcMain.handle('should-show-welcome', () => {
    const settings = getCurrentSettings()
    const openscadConfigured = Boolean(settings.openscadPath) && fs.existsSync(settings.openscadPath)
    const apiKeyConfigured =
      settings.llm.provider === 'openrouter'
        ? !!process.env.OPENROUTER_API_KEY?.trim()
        : settings.llm.provider === 'gateway'
          ? !!settings.llm.gatewayLicenseKey?.trim()
          : settings.llm.provider === 'ollama'
            ? true
            : !!settings.llm.apiKey?.trim()
    return !openscadConfigured || !apiKeyConfigured
  })

  ipcMain.handle('get-ollama-models', async (_event, endpointInput?: unknown) => {
    try {
      const endpointResult = normalizeOllamaEndpoint(endpointInput)
      if (!endpointResult.ok) {
        return { success: false, models: [], error: endpointResult.error }
      }
      const ollamaEndpoint = endpointResult.endpoint
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      let response: Response
      try {
        response = await fetch(`${ollamaEndpoint}/api/tags`, { signal: controller.signal })
      } finally {
        clearTimeout(timeout)
      }

      if (!response.ok) {
        throw new Error(`Ollama API returned ${response.status}`)
      }

      const data = await response.json()
      const models = (Array.isArray(data?.models) ? data.models : []).map((model: unknown) => {
        const record = model && typeof model === 'object' ? (model as Record<string, unknown>) : {}
        return {
          name: typeof record.name === 'string' ? record.name : 'unknown',
          size: typeof record.size === 'number' ? record.size : 0,
          modified: typeof record.modified_at === 'string' ? record.modified_at : ''
        }
      })

      return { success: true, models }
    } catch (error) {
      logger.error('Failed to fetch Ollama models', error)
      let errorMessage = 'Failed to connect to Ollama'
      if (error instanceof Error) {
        if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
          errorMessage =
            'Ollama is not running. Please start Ollama first (run "ollama serve" or start the Ollama application).'
        } else if (error.message.includes('timeout')) {
          errorMessage = "Ollama is not responding. Check if it's running and the endpoint is correct."
        } else {
          errorMessage = `Connection error: ${error.message}`
        }
      }
      return {
        success: false,
        models: [],
        error: errorMessage
      }
    }
  })

  ipcMain.handle('check-custom-connection', async (_event, endpointInput?: unknown) => {
    try {
      const endpointResult = normalizeCustomEndpoint(endpointInput)
      if (!endpointResult.ok) {
        return { success: false, error: endpointResult.error, supportsResponses: false }
      }
      const base = endpointResult.endpoint
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      let response: Response
      try {
        response = await fetch(`${base}/models`, { signal: controller.signal })
      } finally {
        clearTimeout(timeout)
      }

      if (response.ok) {
        return {
          success: true,
          message: 'Connected successfully',
          endpoint: base,
          supportsResponses: false
        }
      }

      const responsesProbe = await fetch(`${base}/responses`, {
        method: 'OPTIONS'
      })
      return {
        success: response.status === 404 ? responsesProbe.ok : false,
        message:
          response.status === 404
            ? responsesProbe.ok
              ? 'Connected (responses-compatible endpoint)'
              : `Connected, but endpoint may be incompatible (status ${response.status})`
            : `Connection failed: HTTP ${response.status}`,
        endpoint: base,
        supportsResponses: response.status === 404 ? responsesProbe.ok : false
      }
    } catch (error) {
      logger.error('Failed to check custom endpoint connection', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: `Connection error: ${message}`, supportsResponses: false }
    }
  })

  ipcMain.handle('get-custom-models', async (_event, endpointInput?: unknown) => {
    try {
      const endpointResult = normalizeCustomEndpoint(endpointInput)
      if (!endpointResult.ok) {
        return { success: false, models: [], error: endpointResult.error }
      }
      const base = endpointResult.endpoint
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      let response: Response
      try {
        response = await fetch(`${base}/models`, { signal: controller.signal })
      } finally {
        clearTimeout(timeout)
      }
      if (!response.ok) {
        throw new Error(`Custom API returned ${response.status}`)
      }
      const data = await response.json()
      const models = (Array.isArray(data?.data) ? data.data : [])
        .map((item: unknown) => {
          const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
          const id = typeof record.id === 'string' ? record.id : ''
          if (!id) {
            return null
          }
          return { id, name: id }
        })
        .filter((item: { id: string; name: string } | null): item is { id: string; name: string } => item !== null)
      return { success: true, models }
    } catch (error) {
      logger.error('Failed to fetch custom models', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, models: [], error: `Connection error: ${message}` }
    }
  })

  ipcMain.handle('reset-settings', () => {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        fs.unlinkSync(SETTINGS_FILE)
      }
      loadSettings()
      return { success: true }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('select-openscad-path', async () => {
    const filters =
      process.platform === 'win32'
        ? [
            { name: 'Executable', extensions: ['exe'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        : [{ name: 'All Files', extensions: ['*'] }]

    const result = await dialog.showOpenDialog({
      title: 'Select OpenSCAD Executable',
      defaultPath: app.getPath('home'),
      properties: ['openFile'],
      filters
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }

    const selectedPath = result.filePaths[0]
    if (!fs.existsSync(selectedPath)) {
      return { canceled: true, error: 'Selected file does not exist' }
    }

    return { canceled: false, filePath: selectedPath }
  })
}
