/// <reference lib="webworker" />

import { createOpenSCAD, type OpenSCADInstance } from 'openscad-wasm'
import { classifyRenderFailure } from './renderPreflight'
import type { RenderFailureClass } from '../../types/electron-api'

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
  readonly details?: {
    initMs?: number
    renderMs?: number
    encodeMs?: number
    stlBytes?: number
    failureClass?: RenderFailureClass
    workerLogTail?: string
    failureStage?: 'wasm_init' | 'wasm_exec' | 'stl_encode'
  }
}

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
  // Create a fresh instance per render. Reusing a warm instance has shown
  // opaque numeric failures on follow-up renders in this stack.
  return createOpenSCAD({
    print: (text: string) => {
      rememberWorkerLog(text)
    },
    printErr: (text: string) => {
      rememberWorkerLog(text)
    }
  })
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
    const initStart = performance.now()
    const openscad = await getOpenScad()
    const initMs = performance.now() - initStart
    const renderStart = performance.now()
    const stlText = await openscad.renderToStl(request.code)
    const renderMs = performance.now() - renderStart
    if (!stlText?.trim()) {
      postResponse({
        id: request.id,
        success: false,
        error: 'OpenSCAD rendered no STL output.',
        details: {
          initMs,
          renderMs,
          failureClass: 'unknown',
          workerLogTail: getRecentWorkerError(),
          failureStage: 'wasm_exec'
        }
      })
      return
    }

    const encodeStart = performance.now()
    const stlBase64 = toBase64(stlText)
    const encodeMs = performance.now() - encodeStart

    postResponse({
      id: request.id,
      success: true,
      stlBase64,
      details: {
        initMs,
        renderMs,
        encodeMs,
        stlBytes: new TextEncoder().encode(stlText).byteLength,
        workerLogTail: getRecentWorkerError()
      }
    })
  } catch (error) {
    const errorMessage = formatRenderError(error)
    postResponse({
      id: request.id,
      success: false,
      error: errorMessage,
      details: {
        failureClass: classifyRenderFailure(errorMessage),
        workerLogTail: getRecentWorkerError(),
        failureStage: getRecentWorkerError() ? 'wasm_exec' : 'wasm_init'
      }
    })
  }
}
