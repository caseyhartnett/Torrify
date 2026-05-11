import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerLlmHandlers } from '../ipc/llm-handlers'
import type { LLMService } from '../llm'

const { state } = vi.hoisted(() => ({
  state: {
    handlers: {} as Record<string, (...args: unknown[]) => unknown>,
    mockCreateLLMService: vi.fn(),
    mockGetCurrentSettings: vi.fn(),
    webContentsSend: vi.fn()
  }
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      state.handlers[channel] = fn
    })
  }
}))

vi.mock('../settings', () => ({
  getCurrentSettings: () => state.mockGetCurrentSettings()
}))

vi.mock('../llm', () => ({
  createLLMService: (...args: unknown[]) => state.mockCreateLLMService(...args)
}))

describe('llm-handlers integration', () => {
  beforeEach(() => {
    Object.keys(state.handlers).forEach((key) => delete state.handlers[key])
    state.mockCreateLLMService.mockReset()
    state.mockGetCurrentSettings.mockReset()
    state.webContentsSend.mockReset()

    state.mockGetCurrentSettings.mockReturnValue({
      llm: {
        provider: 'gemini',
        model: 'gemini-3-flash',
        apiKey: 'test-key',
        enabled: true
      }
    })

    registerLlmHandlers(() => ({
      webContents: {
        send: state.webContentsSend
      }
    }) as never)
  })

  it('routes llm-send-message payload to created service with normalized backend', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ content: 'ok', model: 'gemini-3-flash' })
    const service = {
      sendMessage,
      supportsStreaming: () => true,
      getProviderName: () => 'Mock'
    } as unknown as LLMService
    state.mockCreateLLMService.mockReturnValue(service)

    const result = await (state.handlers['llm-send-message'] as (...args: unknown[]) => Promise<unknown>)(
      null,
      {
        messages: [{ role: 'user', content: 'hello' }],
        currentCode: 'cube([1,2,3]);',
        cadBackend: 'build123d',
        apiContext: 'context fixture'
      }
    )

    expect(state.mockCreateLLMService).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'gemini' })
    )
    expect(sendMessage).toHaveBeenCalledWith(
      [{ role: 'user', content: 'hello' }],
      'cube([1,2,3]);',
      'build123d',
      'context fixture'
    )
    expect(result).toEqual({
      success: true,
      response: { content: 'ok', model: 'gemini-3-flash' }
    })
  })

  it('returns a validation error for malformed llm-send-message payload', async () => {
    const result = await (state.handlers['llm-send-message'] as (...args: unknown[]) => Promise<unknown>)(
      null,
      { bad: true }
    )

    expect(result).toEqual({
      success: false,
      error: 'Invalid message payload structure'
    })
  })

  it('creates a streamId and sends chunks through webContents for llm-stream-message', async () => {
    const streamMessage = vi.fn().mockImplementation(async (_messages, onChunk) => {
      onChunk('A', 'A', false)
      onChunk('B', 'AB', true)
      return { abort: vi.fn() }
    })
    state.mockCreateLLMService.mockReturnValue({
      sendMessage: vi.fn(),
      streamMessage,
      supportsStreaming: () => true,
      getProviderName: () => 'Mock'
    } as unknown as LLMService)

    const response = await (state.handlers['llm-stream-message'] as (...args: unknown[]) => Promise<{ streamId: string }>)(
      null,
      { messages: [{ role: 'user', content: 'stream this' }], cadBackend: 'openscad' }
    )

    expect(response.streamId).toMatch(/^llm-stream-/)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(streamMessage).toHaveBeenCalledWith(
      [{ role: 'user', content: 'stream this' }],
      expect.any(Function),
      undefined,
      'openscad',
      undefined
    )
    expect(state.webContentsSend).toHaveBeenCalledWith(
      'llm-stream-chunk',
      expect.objectContaining({
        streamId: response.streamId,
        delta: 'A',
        full: 'A',
        done: false
      })
    )
    expect(state.webContentsSend).toHaveBeenCalledWith(
      'llm-stream-chunk',
      expect.objectContaining({
        streamId: response.streamId,
        delta: 'B',
        full: 'AB',
        done: true
      })
    )
  })

  it('accepts screenshot data URLs in streaming payloads', async () => {
    const imageDataUrl = `data:image/png;base64,${'A'.repeat(4096)}`
    const streamMessage = vi.fn().mockImplementation(async (_messages, onChunk) => {
      onChunk('', '', true)
      return { abort: vi.fn() }
    })
    state.mockCreateLLMService.mockReturnValue({
      sendMessage: vi.fn(),
      streamMessage,
      supportsStreaming: () => true,
      getProviderName: () => 'Mock'
    } as unknown as LLMService)

    const response = await (state.handlers['llm-stream-message'] as (...args: unknown[]) => Promise<{ streamId: string | null; error?: string }>)(
      null,
      {
        messages: [
          {
            role: 'user',
            content: 'Analyze this render.',
            imageDataUrls: [imageDataUrl]
          }
        ]
      }
    )

    expect(response.error).toBeUndefined()
    expect(response.streamId).toMatch(/^llm-stream-/)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(streamMessage).toHaveBeenCalledWith(
      [
        {
          role: 'user',
          content: 'Analyze this render.',
          imageDataUrls: [imageDataUrl]
        }
      ],
      expect.any(Function),
      undefined,
      'openscad',
      undefined
    )
  })

  it('wires llm-stream-abort to active controller', async () => {
    const abort = vi.fn()
    const streamMessage = vi.fn().mockResolvedValue({ abort })
    state.mockCreateLLMService.mockReturnValue({
      sendMessage: vi.fn(),
      streamMessage,
      supportsStreaming: () => true,
      getProviderName: () => 'Mock'
    } as unknown as LLMService)

    const response = await (state.handlers['llm-stream-message'] as (...args: unknown[]) => Promise<{ streamId: string }>)(
      null,
      { messages: [{ role: 'user', content: 'abort me' }] }
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    ;(state.handlers['llm-stream-abort'] as (...args: unknown[]) => unknown)(null, response.streamId)
    expect(abort).toHaveBeenCalled()
  })
})
