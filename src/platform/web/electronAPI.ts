import type {
  CADBackend,
  ElectronAPI,
  LLMRequestPayload,
  LoadedProject,
  ProjectFile,
  RecentFile,
  Settings
} from '../../types/electron-api'
import {
  buildMessageContent,
  buildSystemContent,
  extractContent,
  streamSseResponse
} from '../../services/llm/utils'
import { trackAnalyticsEvent } from '../../services/analytics'
import { logger } from '../../utils/logger'
import { getGatewayBaseUrls } from './gatewayConfig'
import { OpenScadWasmRenderer } from './openscadRenderer'

const SETTINGS_STORAGE_KEY = 'torrify.web.settings.v1'
const RECENT_FILES_STORAGE_KEY = 'torrify.web.recent.v1'
const DEFAULT_GATEWAY_MODEL = 'google/gemini-3-flash-preview'
const DEFAULT_WEB_RENDER_MODE = 'wasm'
const DEFAULT_WASM_RENDER_TIMEOUT_MS = 45000
const TRANSPARENT_PIXEL_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAukB9Qm18q8AAAAASUVORK5CYII='

const streamCallbacks = new Map<string, (delta: string, full: string, done: boolean) => void>()
const streamControllers = new Map<string, AbortController>()
const wasmRenderer = new OpenScadWasmRenderer()
let cleanupBound = false

type WebRenderMode = 'wasm' | 'api'
const RENDER_CODE_PREVIEW_MAX_LINES = 12
const RENDER_CODE_PREVIEW_MAX_CHARS = 600

function nowIso(): string {
  return new Date().toISOString()
}

function getRenderBaseUrl(): string {
  return (import.meta.env.VITE_RENDER_API_URL || '').trim().replace(/\/+$/, '')
}

function getPositiveEnvNumber(value: string | undefined, fallback: number): number {
  const raw = Number(value)
  if (!Number.isFinite(raw) || raw <= 0) {
    return fallback
  }
  return Math.floor(raw)
}

function getGatewayTimeoutMs(): number {
  return getPositiveEnvNumber(import.meta.env.VITE_WEB_GATEWAY_TIMEOUT_MS, 30_000)
}

function getRenderTimeoutMs(): number {
  return getPositiveEnvNumber(import.meta.env.VITE_WEB_RENDER_TIMEOUT_MS, 45_000)
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback
  }
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }
  return fallback
}

function getWebRenderMode(): WebRenderMode {
  const mode = (import.meta.env.VITE_WEB_RENDER_MODE || DEFAULT_WEB_RENDER_MODE).trim().toLowerCase()
  return mode === 'api' ? 'api' : 'wasm'
}

function getWasmRenderTimeoutMs(): number {
  const raw = Number(import.meta.env.VITE_WEB_WASM_RENDER_TIMEOUT_MS)
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_WASM_RENDER_TIMEOUT_MS
  }
  return Math.floor(raw)
}

function shouldAllowApiFallback(): boolean {
  return parseBooleanEnv(import.meta.env.VITE_WEB_WASM_API_FALLBACK, true)
}

function summarizeRenderCode(code: string): string {
  const normalized = code.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return ''
  }

  const preview = normalized.split('\n').slice(0, RENDER_CODE_PREVIEW_MAX_LINES).join('\n')
  if (preview.length <= RENDER_CODE_PREVIEW_MAX_CHARS) {
    return preview
  }

  return `${preview.slice(0, RENDER_CODE_PREVIEW_MAX_CHARS)}...<truncated>`
}

function logWebRenderFailure(stage: string, code: string, details: Record<string, unknown> = {}): void {
  logger.error(`[WebRender] ${stage}`, {
    mode: getWebRenderMode(),
    renderBaseUrl: getRenderBaseUrl() || null,
    codeLength: code.length,
    codePreview: summarizeRenderCode(code),
    ...details
  })
}

function getContextFilename(backend: CADBackend): string {
  return backend === 'build123d' ? 'context_build123d.txt' : 'context_openscad.txt'
}

function clampRecentFiles(files: RecentFile[]): RecentFile[] {
  const deduped = new Map<string, RecentFile>()
  for (const file of files) {
    if (!file.filePath?.trim()) {
      continue
    }
    deduped.set(file.filePath, {
      filePath: file.filePath,
      lastOpened: file.lastOpened || nowIso()
    })
  }
  return Array.from(deduped.values()).slice(0, 10)
}

function loadRecentFiles(): RecentFile[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return clampRecentFiles(
      parsed
        .filter((item: unknown) => item && typeof item === 'object')
        .map((item) => {
          const record = item as Record<string, unknown>
          return {
            filePath: typeof record.filePath === 'string' ? record.filePath : '',
            lastOpened: typeof record.lastOpened === 'string' ? record.lastOpened : nowIso()
          }
        })
    )
  } catch {
    return []
  }
}

function saveRecentFiles(files: RecentFile[]): void {
  try {
    localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(clampRecentFiles(files)))
  } catch {
    // Ignore storage failures.
  }
}

function addRecentFile(filePath: string): void {
  const normalized = filePath.trim()
  if (!normalized) {
    return
  }
  const existing = loadRecentFiles().filter((file) => file.filePath !== normalized)
  saveRecentFiles([{ filePath: normalized, lastOpened: nowIso() }, ...existing])
}

function normalizeSettings(input: Partial<Settings> | null | undefined): Settings {
  const llm: Partial<Settings['llm']> = input?.llm ?? {}
  const managedModel = import.meta.env.VITE_GATEWAY_MODEL?.trim() || DEFAULT_GATEWAY_MODEL
  return {
    cadBackend: 'openscad',
    openscadPath: '',
    build123dPythonPath: '',
    llm: {
      provider: 'gateway',
      model: managedModel,
      apiKey: '',
      enabled: llm.enabled !== false,
      customEndpoint: undefined,
      temperature: typeof llm.temperature === 'number' ? llm.temperature : 0.7,
      maxTokens: typeof llm.maxTokens === 'number' ? llm.maxTokens : 4096,
      gatewayBaseUrl:
        typeof llm.gatewayBaseUrl === 'string' && llm.gatewayBaseUrl.trim().length > 0
          ? llm.gatewayBaseUrl.trim()
          : undefined,
      gatewayLicenseKey:
        typeof llm.gatewayLicenseKey === 'string' ? llm.gatewayLicenseKey : ''
    },
    analytics: {
      enabled: input?.analytics?.enabled !== false
    },
    recentFiles: loadRecentFiles(),
    hasSeenDemo: typeof input?.hasSeenDemo === 'boolean' ? input.hasSeenDemo : false
  }
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) {
      return normalizeSettings(undefined)
    }
    const parsed = JSON.parse(raw) as Partial<Settings>
    return normalizeSettings(parsed)
  } catch {
    return normalizeSettings(undefined)
  }
}

function persistSettings(settings: Settings): void {
  const normalized = normalizeSettings(settings)
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Ignore storage failures.
  }
  if (normalized.recentFiles) {
    saveRecentFiles(normalized.recentFiles)
  }
}

function createFilePicker(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    input.onchange = () => {
      const file = input.files && input.files[0] ? input.files[0] : null
      resolve(file)
      input.remove()
    }
    document.body.appendChild(input)
    input.click()
  })
}

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsText(file)
  })
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const result = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    result[index] = binary.charCodeAt(index)
  }
  return result
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function sanitizeFilename(input: string | undefined, fallback: string): string {
  const cleaned = Array.from((input || '').trim())
    .map((char) => {
      const code = char.charCodeAt(0)
      if (code <= 0x1f || '<>:"/\\|?*'.includes(char)) {
        return '_'
      }
      return char
    })
    .join('')
  return cleaned || fallback
}

function nextStreamId(): string {
  return `web-llm-stream-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createTimedAbortSignal(timeoutMs: number, upstream?: AbortSignal): {
  readonly signal: AbortSignal
  readonly didTimeout: () => boolean
  readonly cleanup: () => void
} {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const handleAbort = () => controller.abort()
  if (upstream) {
    if (upstream.aborted) {
      controller.abort()
    } else {
      upstream.addEventListener('abort', handleAbort, { once: true })
    }
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      window.clearTimeout(timeoutId)
      if (upstream) {
        upstream.removeEventListener('abort', handleAbort)
      }
    }
  }
}

function getCallback(streamId: string): ((delta: string, full: string, done: boolean) => void) | undefined {
  return streamCallbacks.get(streamId)
}

function completeStream(streamId: string): void {
  streamCallbacks.delete(streamId)
  streamControllers.delete(streamId)
}

async function sendGatewayRequest(
  payload: LLMRequestPayload,
  stream: boolean,
  signal?: AbortSignal
): Promise<Response> {
  const settings = loadSettings()
  const model = import.meta.env.VITE_GATEWAY_MODEL?.trim() || DEFAULT_GATEWAY_MODEL
  const cadBackend = payload.cadBackend === 'build123d' ? 'build123d' : 'openscad'
  const systemContent = buildSystemContent({
    model,
    cadBackend,
    currentCode: payload.currentCode,
    apiContext: payload.apiContext,
    loggerPrefix: 'WebGateway'
  })
  const messages = [
    { role: 'system', content: systemContent },
    ...payload.messages.map((message) => ({
      role: message.role,
      content: buildMessageContent(message)
    }))
  ]

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  const licenseKey = (settings.llm.gatewayLicenseKey || '').trim()
  const chatPaths = licenseKey ? ['/api/chat'] : ['/api/chat/free', '/api/chat']
  if (licenseKey) {
    headers['X-License-Key'] = licenseKey
  }

  const body = JSON.stringify({
    model,
    messages,
    stream,
    temperature: settings.llm.temperature ?? 0.7,
    max_tokens: settings.llm.maxTokens ?? 4096
  })

  let lastError: unknown = null
  const attemptErrors: string[] = []
  const baseUrls = getGatewayBaseUrls(settings.llm.gatewayBaseUrl)
  for (const baseUrl of baseUrls) {
    for (const chatPath of chatPaths) {
      const endpoint = `${baseUrl}${chatPath}`
      const timedSignal = createTimedAbortSignal(getGatewayTimeoutMs(), signal)
      try {
        let response: Response
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers,
            signal: timedSignal.signal,
            body
          })
        } finally {
          timedSignal.cleanup()
        }

        if (response.ok) {
          return response
        }

        const responseText = (await response.text()).trim()
        const normalizedText = responseText.replace(/\s+/g, ' ')
        const suffix = normalizedText ? ` ${normalizedText.slice(0, 180)}` : ''
        attemptErrors.push(`${response.status} ${endpoint}${suffix}`)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          lastError = error
        }
        if (timedSignal.didTimeout()) {
          attemptErrors.push(`timeout ${endpoint}`)
          continue
        }
        // Respect active aborts from stream cancellation.
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error
        }
      }
    }
  }

  if (attemptErrors.length > 0) {
    throw new Error(`Gateway request failed across all endpoints: ${attemptErrors.join(' | ')}`)
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Gateway request failed: all configured base URLs were unreachable')
}

async function startGatewayStream(streamId: string, payload: LLMRequestPayload): Promise<void> {
  const controller = new AbortController()
  streamControllers.set(streamId, controller)
  let full = ''

  try {
    const response = await sendGatewayRequest(payload, true, controller.signal)
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `Gateway request failed with ${response.status}`)
    }
    await streamSseResponse(response, (delta, accumulated, done) => {
      full = accumulated
      const callback = getCallback(streamId)
      if (callback) {
        callback(delta, accumulated, done)
      }
      if (done) {
        completeStream(streamId)
      }
    }, 'WebGateway')
  } catch (error) {
    const callback = getCallback(streamId)
    if (callback) {
      const message = error instanceof Error ? error.message : 'Unknown streaming error'
      callback(`\n\n[System Error: ${message}]`, full, true)
    }
    completeStream(streamId)
  }
}

async function renderStlViaApi(code: string): Promise<{ success: boolean; stlBase64?: string; timestamp: number; error?: string }> {
  const renderBaseUrl = getRenderBaseUrl()
  if (!renderBaseUrl) {
    const error = 'Web render endpoint is not configured. Set VITE_RENDER_API_URL for web rendering.'
    logWebRenderFailure('API render is not configured', code, { error })
    return {
      success: false,
      timestamp: Date.now(),
      error
    }
  }

  try {
    const timedSignal = createTimedAbortSignal(getRenderTimeoutMs())
    let response: Response
    try {
      response = await fetch(`${renderBaseUrl}/api/render`, {
        method: 'POST',
        signal: timedSignal.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, format: 'stl' })
      })
    } finally {
      timedSignal.cleanup()
    }
    const data = (await response.json()) as Record<string, unknown>
    const stlBase64 =
      typeof data.stlBase64 === 'string'
        ? data.stlBase64
        : typeof data.data === 'string'
          ? data.data
          : undefined
    if (response.ok && stlBase64) {
      return {
        success: true,
        stlBase64,
        timestamp: Date.now()
      }
    }
    const error = typeof data.error === 'string' ? data.error : `Render failed (${response.status})`
    logWebRenderFailure('API render returned a failure response', code, {
      endpoint: `${renderBaseUrl}/api/render`,
      status: response.status,
      error
    })
    return {
      success: false,
      error,
      timestamp: Date.now()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Render request failed'
    logWebRenderFailure('API render request threw an exception', code, {
      endpoint: `${renderBaseUrl}/api/render`,
      timeoutMs: getRenderTimeoutMs(),
      error: message
    })
    return {
      success: false,
      error: message,
      timestamp: Date.now()
    }
  }
}

async function renderStlViaWasm(code: string): Promise<{ success: boolean; stlBase64?: string; timestamp: number; error?: string }> {
  try {
    const response = await wasmRenderer.renderStl(code, getWasmRenderTimeoutMs())
    if (!response.success) {
      logWebRenderFailure('WASM render returned a failure response', code, {
        timeoutMs: getWasmRenderTimeoutMs(),
        error: response.error || 'Unknown error'
      })
    }
    return {
      success: response.success,
      stlBase64: response.stlBase64,
      timestamp: Date.now(),
      error: response.error
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenSCAD WASM render failed'
    logWebRenderFailure('WASM render threw an exception', code, {
      timeoutMs: getWasmRenderTimeoutMs(),
      error: message
    })
    return {
      success: false,
      timestamp: Date.now(),
      error: message
    }
  }
}

async function renderStlWithPolicy(code: string): Promise<{ success: boolean; stlBase64?: string; timestamp: number; error?: string }> {
  const mode = getWebRenderMode()
  if (mode === 'api') {
    return renderStlViaApi(code)
  }

  const wasmResult = await renderStlViaWasm(code)
  if (wasmResult.success) {
    return wasmResult
  }

  const canFallbackToApi = shouldAllowApiFallback() && !!getRenderBaseUrl()
  if (!canFallbackToApi) {
    logWebRenderFailure('WASM render failed with no API fallback available', code, {
      error: wasmResult.error || 'Unknown error',
      apiFallbackEnabled: shouldAllowApiFallback(),
      apiFallbackConfigured: !!getRenderBaseUrl()
    })
    return wasmResult
  }

  const apiResult = await renderStlViaApi(code)
  if (apiResult.success) {
    return apiResult
  }

  logWebRenderFailure('WASM render and API fallback both failed', code, {
    wasmError: wasmResult.error || 'Unknown error',
    apiError: apiResult.error || 'Unknown error'
  })
  return {
    success: false,
    timestamp: Date.now(),
    error: `WASM render failed: ${wasmResult.error || 'Unknown error'} | API fallback failed: ${apiResult.error || 'Unknown error'}`
  }
}

async function loadProjectFromPicker(): Promise<{ canceled: boolean; project?: LoadedProject; filePath?: string; error?: string }> {
  const file = await createFilePicker('.torrify,.json,.opencursor')
  if (!file) {
    return { canceled: true }
  }
  trackAnalyticsEvent('project_upload_selected', {
    source: 'file_picker',
    fileType: 'torrify',
    fileSizeBytes: file.size
  })
  try {
    const raw = await readTextFile(file)
    const parsed = JSON.parse(raw) as LoadedProject
    addRecentFile(file.name)
    trackAnalyticsEvent('project_upload_parsed', {
      source: 'file_picker',
      fileType: 'torrify',
      success: true,
      fileSizeBytes: file.size
    })
    return {
      canceled: false,
      project: parsed,
      filePath: file.name
    }
  } catch (error) {
    trackAnalyticsEvent('project_upload_parsed', {
      source: 'file_picker',
      fileType: 'torrify',
      success: false,
      errorType: error instanceof Error ? error.name : 'UnknownError'
    })
    return {
      canceled: true,
      error: error instanceof Error ? error.message : 'Invalid project file'
    }
  }
}

function buildWebElectronAPI(): ElectronAPI {
  return {
    async renderScad(code: string) {
      void code
      return {
        success: true,
        image: TRANSPARENT_PIXEL_DATA_URI,
        timestamp: Date.now()
      }
    },

    async renderStl(code: string) {
      return renderStlWithPolicy(code)
    },

    async saveProject(project: ProjectFile) {
      try {
        const filename = sanitizeFilename('project.torrify', 'project.torrify')
        const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
        triggerDownload(blob, filename)
        trackAnalyticsEvent('project_download_initiated', {
          source: 'save_project',
          fileType: 'torrify',
          backend: project.cadBackend ?? 'openscad'
        })
        return { canceled: false, filePath: filename }
      } catch (error) {
        return {
          canceled: true,
          error: error instanceof Error ? error.message : 'Failed to save project'
        }
      }
    },

    async loadProject() {
      return loadProjectFromPicker()
    },

    async exportScad(code: string, backend: CADBackend = 'openscad', currentFilePath?: string) {
      const extension = backend === 'build123d' ? 'py' : 'scad'
      const basename = sanitizeFilename(currentFilePath, `model.${extension}`)
      const filename = basename.endsWith(`.${extension}`) ? basename : `${basename}.${extension}`
      triggerDownload(new Blob([code], { type: 'text/plain;charset=utf-8' }), filename)
      addRecentFile(filename)
      trackAnalyticsEvent('source_export_initiated', {
        source: 'export_source',
        backend,
        fileType: extension
      })
      return { canceled: false, filePath: filename }
    },

    async exportStl(stlBase64: string | null, currentFilePath?: string) {
      if (!stlBase64) {
        return { canceled: true }
      }
      const fileBase = sanitizeFilename(currentFilePath, 'model')
      const filename = fileBase.toLowerCase().endsWith('.stl') ? fileBase : `${fileBase}.stl`
      const bytes = decodeBase64(stlBase64)
      const arrayBuffer = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(arrayBuffer).set(bytes)
      triggerDownload(new Blob([arrayBuffer], { type: 'model/stl' }), filename)
      trackAnalyticsEvent('stl_export_initiated', {
        source: 'export_stl',
        fileType: 'stl'
      })
      return { canceled: false, filePath: filename }
    },

    async getTempDir() {
      return '/tmp'
    },

    async getSettings() {
      return loadSettings()
    },

    async saveSettings(settings: Settings) {
      persistSettings(settings)
      return { success: true }
    },

    async checkOpenscadPath(path: string) {
      void path
      return true
    },

    async checkPythonPath(path: string) {
      void path
      return { valid: false, error: 'build123d is not available in web runtime' }
    },

    async validateCadBackend(backend: CADBackend) {
      if (backend === 'openscad') {
        return { valid: true, version: 'OpenSCAD Web (WASM)' }
      }
      return { valid: false, error: 'build123d is not available in web runtime' }
    },

    async selectOpenscadPath() {
      return { canceled: true }
    },

    async shouldShowWelcome() {
      return false
    },

    async resetSettings() {
      try {
        localStorage.removeItem(SETTINGS_STORAGE_KEY)
        localStorage.removeItem(RECENT_FILES_STORAGE_KEY)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to reset settings' }
      }
    },

    async openScadFile(backend: CADBackend = 'openscad') {
      const file = await createFilePicker(backend === 'build123d' ? '.py,.txt' : '.scad,.txt')
      if (!file) {
        return { canceled: true }
      }
      try {
        const code = await readTextFile(file)
        addRecentFile(file.name)
        return { canceled: false, filePath: file.name, code }
      } catch (error) {
        return {
          canceled: true,
          error: error instanceof Error ? error.message : 'Failed to open file'
        }
      }
    },

    async saveScadFile(code: string, filePath?: string, backend: CADBackend = 'openscad') {
      const extension = backend === 'build123d' ? 'py' : 'scad'
      const defaultName = `model.${extension}`
      const basename = sanitizeFilename(filePath, defaultName)
      const filename = basename.endsWith(`.${extension}`) ? basename : `${basename}.${extension}`
      triggerDownload(new Blob([code], { type: 'text/plain;charset=utf-8' }), filename)
      addRecentFile(filename)
      return { canceled: false, filePath: filename }
    },

    async setWindowTitle(title: string) {
      document.title = title
    },

    async getOpenRouterConfigured() {
      return true
    },

    async llmSendMessage(payload: LLMRequestPayload) {
      try {
        const response = await sendGatewayRequest(payload, false)
        const responseText = await response.text()
        let parsed: Record<string, unknown> = {}
        try {
          parsed = JSON.parse(responseText) as Record<string, unknown>
        } catch {
          if (!response.ok) {
            return { success: false, error: responseText || `Gateway request failed with ${response.status}` }
          }
        }

        if (!response.ok) {
          const message = typeof parsed.error === 'string' ? parsed.error : responseText
          return {
            success: false,
            error: message || `Gateway request failed with ${response.status}`
          }
        }

        const choice = Array.isArray(parsed.choices) ? parsed.choices[0] as Record<string, unknown> : null
        const message = choice && typeof choice === 'object' ? choice.message as Record<string, unknown> : null
        const content = extractContent(message?.content)
        const usage = parsed.usage as Record<string, unknown> | undefined

        return {
          success: true,
          response: {
            content,
            model: typeof parsed.model === 'string' ? parsed.model : loadSettings().llm.model,
            usage: {
              promptTokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : 0,
              completionTokens: typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : 0,
              totalTokens: typeof usage?.total_tokens === 'number' ? usage.total_tokens : 0
            }
          }
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Gateway request failed'
        }
      }
    },

    async llmStreamMessage(payload: LLMRequestPayload) {
      const streamId = nextStreamId()
      queueMicrotask(() => {
        void startGatewayStream(streamId, payload)
      })
      return { streamId }
    },

    async llmStreamAbort(streamId: string) {
      const controller = streamControllers.get(streamId)
      if (controller) {
        controller.abort()
      }
      completeStream(streamId)
    },

    onLlmStreamChunk(streamId: string, callback: (delta: string, full: string, done: boolean) => void) {
      streamCallbacks.set(streamId, callback)
    },

    async getRecentFiles() {
      return loadRecentFiles()
    },

    async clearRecentFiles() {
      saveRecentFiles([])
      return { success: true }
    },

    async removeRecentFile(filePath: string) {
      const filtered = loadRecentFiles().filter((file) => file.filePath !== filePath)
      saveRecentFiles(filtered)
      return { success: true }
    },

    async openRecentFile(filePath: string) {
      void filePath
      return { canceled: true, error: 'Recent file reopen is not available in web runtime' }
    },

    async loadDocumentation() {
      return {
        success: true,
        docs: {
          'web-help.md':
            'Web mode is running with managed gateway access and browser-side OpenSCAD WASM rendering. Configure your optional PRO license key in Settings > AI Configuration.'
        }
      }
    },

    async getContext(backend: CADBackend) {
      const filename = getContextFilename(backend)
      try {
        const response = await fetch(`/${filename}`, { cache: 'no-store' })
        if (!response.ok) {
          return { success: false, error: `Failed to load ${filename}` }
        }
        const content = await response.text()
        return { success: true, content, source: 'bundled' as const, filename }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to load context' }
      }
    },

    async getContextStatus() {
      const now = nowIso()
      return {
        success: true,
        openscad: {
          user: { exists: false, size: 0, modified: null },
          bundled: { exists: true, size: 0, modified: now },
          active: 'bundled' as const
        },
        build123d: {
          user: { exists: false, size: 0, modified: null },
          bundled: { exists: true, size: 0, modified: now },
          active: 'bundled' as const
        }
      }
    },

    async updateContextFromCloud(backend: CADBackend, url: string) {
      void backend
      void url
      return { success: false, error: 'Knowledge base updates are not available in web runtime' }
    },

    async resetContextToFactory() {
      return { success: true, message: 'Web runtime always uses bundled context' }
    },

    async getOllamaModels() {
      return { success: false, models: [], error: 'Ollama is not available in web runtime' }
    },

    onMenuEvent(channel: string, callback: () => void) {
      void channel
      void callback
      // No native menu in web runtime.
    },

    removeMenuListener(channel: string) {
      void channel
      // No native menu in web runtime.
    }
  }
}

export function installWebElectronAPI(): void {
  const webApi = buildWebElectronAPI()
  const globalWindow = window as typeof window & { electronAPI?: ElectronAPI }
  globalWindow.electronAPI = webApi
  if (!cleanupBound) {
    window.addEventListener('beforeunload', () => wasmRenderer.terminate())
    cleanupBound = true
  }
}
