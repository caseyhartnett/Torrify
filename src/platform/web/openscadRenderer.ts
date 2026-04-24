import type { RenderFailureClass } from '../../types/electron-api'
import { logger } from '../../utils/logger'

interface WorkerRenderRequest {
  readonly id: string
  readonly type: 'render'
  readonly code: string
}

interface WorkerRenderResponse {
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

interface PendingRequest {
  readonly resolve: (result: WorkerRenderResponse) => void
  readonly reject: (error: Error) => void
  readonly timeoutId: number
}

export class OpenScadWasmRenderer {
  private worker: Worker | null = null
  private requestCounter = 0
  private readonly pending = new Map<string, PendingRequest>()

  private ensureWorker(): Worker {
    if (this.worker) {
      return this.worker
    }

    const worker = new Worker(new URL('./openscadWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerRenderResponse>) => {
      const response = event.data
      const pending = this.pending.get(response.id)
      if (!pending) {
        return
      }

      window.clearTimeout(pending.timeoutId)
      this.pending.delete(response.id)
      if (!response.success) {
        logger.error('OpenSCAD worker reported a render failure', {
          requestId: response.id,
          error: response.error
        })
      }
      pending.resolve(response)
    }
    worker.onerror = (event: ErrorEvent) => {
      const message =
        event.message || (event.error instanceof Error ? event.error.message : '') || 'OpenSCAD worker crashed'
      logger.error('OpenSCAD worker runtime error', {
        message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
      })
      this.terminate(message)
    }
    worker.onmessageerror = () => {
      logger.error('OpenSCAD worker message channel failed')
      this.terminate('OpenSCAD worker message channel failed')
    }

    this.worker = worker
    return worker
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      window.clearTimeout(pending.timeoutId)
      pending.reject(error)
      this.pending.delete(id)
    }
  }

  terminate(reason = 'OpenSCAD worker terminated'): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.rejectAll(new Error(reason))
  }

  async renderStl(code: string, timeoutMs: number): Promise<WorkerRenderResponse> {
    if (!code.trim()) {
      return {
        id: 'empty',
        success: false,
        error: 'No OpenSCAD code provided for rendering.',
        details: {
          failureClass: 'empty_input',
          failureStage: 'wasm_init'
        }
      }
    }

    const worker = this.ensureWorker()
    const id = `web-render-${Date.now()}-${this.requestCounter++}`

    const response = await new Promise<WorkerRenderResponse>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pending.delete(id)
        const message = `OpenSCAD WASM render timed out after ${Math.round(timeoutMs / 1000)}s`
        logger.error('OpenSCAD WASM render timed out', {
          requestId: id,
          timeoutMs,
          codeLength: code.length
        })
        this.terminate(message)
        reject(new Error(message))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timeoutId })

      const request: WorkerRenderRequest = {
        id,
        type: 'render',
        code
      }
      worker.postMessage(request)
    })

    return response
  }
}
