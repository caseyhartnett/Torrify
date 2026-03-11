/// <reference lib="webworker" />

import { createOpenSCAD, type OpenSCADInstance } from 'openscad-wasm'

interface RenderRequest {
  readonly id: string
  readonly type: 'render'
  readonly code: string
}

interface RenderResponse {
  readonly id: string
  readonly success: boolean
  readonly stlBase64?: string
  readonly error?: string
}

let openscadPromise: Promise<OpenSCADInstance> | null = null
const recentWorkerLogs: string[] = []
const MAX_RECENT_LOGS = 20

function rememberWorkerLog(text: string): void {
  const normalized = text.trim()
  if (!normalized) {
    return
  }

  recentWorkerLogs.push(normalized)
  if (recentWorkerLogs.length > MAX_RECENT_LOGS) {
    recentWorkerLogs.splice(0, recentWorkerLogs.length - MAX_RECENT_LOGS)
  }
}

function resetWorkerLogs(): void {
  recentWorkerLogs.length = 0
}

function getRecentWorkerError(): string | undefined {
  const prioritized = recentWorkerLogs.filter((line) => /error|failed|exception/i.test(line))
  const relevant = prioritized.length > 0 ? prioritized : recentWorkerLogs
  if (relevant.length === 0) {
    return undefined
  }

  return relevant.slice(-3).join(' | ')
}

function formatRenderError(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message.trim() : ''
  const recentLogMessage = getRecentWorkerError()

  if (errorMessage && recentLogMessage && !errorMessage.includes(recentLogMessage)) {
    return `${errorMessage} | ${recentLogMessage}`
  }

  if (errorMessage) {
    return errorMessage
  }

  if (recentLogMessage) {
    return recentLogMessage
  }

  return 'OpenSCAD WASM render failed'
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const chunkSize = 0x8000

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

async function getOpenScad(): Promise<OpenSCADInstance> {
  if (!openscadPromise) {
    // Use a static import here so the worker bundle eagerly contains the
    // OpenSCAD runtime instead of relying on nested dynamic imports.
    openscadPromise = createOpenSCAD({
      print: (text: string) => {
        rememberWorkerLog(text)
      },
      printErr: (text: string) => {
        rememberWorkerLog(text)
      }
    })
  }
  return openscadPromise
}

function postResponse(response: RenderResponse): void {
  self.postMessage(response)
}

self.onmessage = async (event: MessageEvent<RenderRequest>) => {
  const request = event.data
  if (!request || request.type !== 'render') {
    return
  }

  if (!request.code?.trim()) {
    postResponse({
      id: request.id,
      success: false,
      error: 'No OpenSCAD code provided for rendering.'
    })
    return
  }

  try {
    resetWorkerLogs()
    const openscad = await getOpenScad()
    const stlText = await openscad.renderToStl(request.code)
    if (!stlText?.trim()) {
      postResponse({
        id: request.id,
        success: false,
        error: 'OpenSCAD rendered no STL output.'
      })
      return
    }

    postResponse({
      id: request.id,
      success: true,
      stlBase64: toBase64(stlText)
    })
  } catch (error) {
    postResponse({
      id: request.id,
      success: false,
      error: formatRenderError(error)
    })
  }
}
