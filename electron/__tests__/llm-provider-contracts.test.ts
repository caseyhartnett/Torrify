import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GatewayService } from '../llm/GatewayService'
import { GeminiService } from '../llm/GeminiService'
import { OllamaService } from '../llm/OllamaService'
import { OpenAIService } from '../llm/OpenAIService'
import { OpenRouterService } from '../llm/OpenRouterService'
import { CustomService } from '../llm/CustomService'
import type { LLMConfig, LLMMessage } from '../llm/types'

const { gemini } = vi.hoisted(() => ({
  gemini: {
    getGenerativeModel: vi.fn(),
    startChat: vi.fn(),
    sendMessage: vi.fn(),
    sendMessageStream: vi.fn()
  }
}))

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: gemini.getGenerativeModel
  }))
}))

const baseMessages: LLMMessage[] = [{ role: 'user', content: 'Design a mounting bracket.' }]

const makeConfig = (provider: LLMConfig['provider'], partial: Partial<LLMConfig> = {}): LLMConfig => ({
  provider,
  model: partial.model ?? 'test-model',
  apiKey: partial.apiKey ?? 'test-api-key',
  enabled: true,
  temperature: partial.temperature ?? 0.7,
  maxTokens: partial.maxTokens ?? 2048,
  customEndpoint: partial.customEndpoint,
  gatewayLicenseKey: partial.gatewayLicenseKey
})

const jsonResponse = (body: unknown, ok = true, statusText = 'OK'): Response =>
  ({
    ok,
    statusText,
    json: async () => body,
    text: async () => JSON.stringify(body),
    body: null
  }) as unknown as Response

const streamResponse = (chunks: string[]): Response => {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    }
  })
  return {
    ok: true,
    statusText: 'OK',
    body,
    text: async () => '',
    json: async () => ({})
  } as unknown as Response
}

describe('LLM provider contracts', () => {
  const fetchMock = vi.fn()
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    process.env.OPENROUTER_API_KEY = 'openrouter-test-key'

    gemini.getGenerativeModel.mockReset()
    gemini.startChat.mockReset()
    gemini.sendMessage.mockReset()
    gemini.sendMessageStream.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey
  })

  it('OpenAIService sends expected request shape and parses content', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: '```openscad\\ncube([10,10,10]);\\n```' } }],
        usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 }
      })
    )

    const service = new OpenAIService(makeConfig('openai', { model: 'gpt-4o-mini' }))
    const result = await service.sendMessage(baseMessages, 'cube([1,2,3]);', 'openscad', 'API fixture')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [endpoint, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(endpoint).toBe('https://api.openai.com/v1/chat/completions')
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json'
      })
    )

    const body = JSON.parse(String(options.body))
    expect(body.model).toBe('gpt-4o-mini')
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[1]).toMatchObject({ role: 'user', content: 'Design a mounting bracket.' })
    expect(result.content).toContain('cube([10,10,10]);')
    expect(result.usage).toEqual({ promptTokens: 11, completionTokens: 7, totalTokens: 18 })
  })

  it('OpenAIService streaming surfaces SSE chunks in callback contract', async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n'
      ])
    )

    const service = new OpenAIService(makeConfig('openai', { model: 'gpt-4o-mini' }))
    const seen: Array<{ delta: string; full: string; done: boolean }> = []

    await new Promise<void>((resolve, reject) => {
      void service
        .streamMessage(baseMessages, (delta, full, done) => {
          seen.push({ delta, full, done })
          if (done) resolve()
        })
        .catch(reject)
    })

    expect(seen[0]).toEqual({ delta: 'hello', full: 'hello', done: false })
    expect(seen[1]).toEqual({ delta: ' world', full: 'hello world', done: false })
    expect(seen.at(-1)).toEqual({ delta: '', full: 'hello world', done: true })
  })

  it('OpenRouterService uses env API key and provider-specific headers', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'done' } }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
      })
    )

    const service = new OpenRouterService(makeConfig('openrouter', { apiKey: '' }))
    await service.sendMessage(baseMessages)

    const [endpoint, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(endpoint).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(options.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer openrouter-test-key',
        'Content-Type': 'application/json',
        'X-Title': 'Torrify'
      })
    )
  })

  it('OpenRouterService fails fast when OPENROUTER_API_KEY is missing', async () => {
    process.env.OPENROUTER_API_KEY = ''
    const service = new OpenRouterService(makeConfig('openrouter', { apiKey: '' }))
    await expect(service.sendMessage(baseMessages)).rejects.toThrow('OpenRouter API key is not set')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('GatewayService sends license-key header and expected payload', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'gateway-ok' } }],
        usage: { prompt_tokens: 4, completion_tokens: 5, total_tokens: 9 }
      })
    )

    const service = new GatewayService(
      makeConfig('gateway', { gatewayLicenseKey: 'license-123', model: 'openai/gpt-4o-mini' })
    )
    const result = await service.sendMessage(baseMessages, undefined, 'build123d')

    const [endpoint, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(endpoint).toMatch(/\/api\/chat$/)
    expect(options.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-License-Key': 'license-123'
      })
    )
    expect(result.content).toBe('gateway-ok')
  })

  it('OllamaService uses endpoint override and preserves image-note contract', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        message: { content: 'ollama-ok' }
      })
    )

    const service = new OllamaService(
      makeConfig('ollama', { customEndpoint: 'http://localhost:11434', model: 'gpt-oss:20b' })
    )
    await service.sendMessage([
      {
        role: 'user',
        content: 'Analyze this reference image.',
        imageDataUrls: ['data:image/png;base64,AAA']
      }
    ])

    const [endpoint, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(endpoint).toBe('http://localhost:11434/api/chat')
    const body = JSON.parse(String(options.body))
    expect(body.stream).toBe(false)
    expect(body.messages[1].content).toContain("image(s) were attached but Ollama doesn't support vision")
  })

  it('GeminiService uses SDK model/chat contract with system prompt context prepended', async () => {
    gemini.getGenerativeModel.mockReturnValue({ startChat: gemini.startChat })
    gemini.startChat.mockReturnValue({ sendMessage: gemini.sendMessage })
    gemini.sendMessage.mockResolvedValue({
      response: Promise.resolve({
        text: () => 'gemini-ok'
      })
    })

    const service = new GeminiService(makeConfig('gemini', { model: 'gemini-3-flash' }))
    const result = await service.sendMessage(baseMessages, 'cube([3,3,3]);', 'openscad', 'api fixture')

    expect(gemini.getGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-3-flash' })
    expect(gemini.startChat).toHaveBeenCalledWith(
      expect.objectContaining({
        history: expect.any(Array),
        generationConfig: expect.objectContaining({ temperature: 0.7, maxOutputTokens: 2048 })
      })
    )
    expect(gemini.sendMessage).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining('Current code in editor')
        })
      ])
    )
    expect(result.content).toBe('gemini-ok')
  })

  it('CustomService uses OpenAI-compatible endpoint with optional auth', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'custom-ok' } }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }
      })
    )

    const service = new CustomService(
      makeConfig('custom', { customEndpoint: 'http://127.0.0.1:1234/v1', apiKey: '' })
    )
    const result = await service.sendMessage(baseMessages)

    const [endpoint, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(endpoint).toBe('http://127.0.0.1:1234/v1/chat/completions')
    expect(options.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json'
      })
    )
    expect((options.headers as Record<string, string>).Authorization).toBeUndefined()
    expect(result.content).toBe('custom-ok')
  })

  it('CustomService maps image messages to Responses API input parts', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        output_text: 'vision-ok',
        usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 }
      })
    )

    const service = new CustomService(
      makeConfig('custom', { customEndpoint: 'http://127.0.0.1:1234/v1/responses', apiKey: '' })
    )
    const result = await service.sendMessage([
      {
        role: 'user',
        content: 'Analyze this render.',
        imageDataUrls: ['data:image/png;base64,AAA']
      }
    ])

    const [endpoint, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(endpoint).toBe('http://127.0.0.1:1234/v1/responses')
    const body = JSON.parse(String(options.body))
    expect(body.instructions).toEqual(expect.any(String))
    expect(body.input).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Analyze this render.' },
          { type: 'input_image', image_url: 'data:image/png;base64,AAA' }
        ]
      }
    ])
    expect(result.content).toBe('vision-ok')
  })

  it('CustomService accepts a full chat completions route without duplicating the path', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'route-ok' } }]
      })
    )

    const service = new CustomService(
      makeConfig('custom', { customEndpoint: 'http://127.0.0.1:1234/v1/chat/completions', apiKey: '' })
    )
    const result = await service.sendMessage(baseMessages)

    const [endpoint] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(endpoint).toBe('http://127.0.0.1:1234/v1/chat/completions')
    expect(result.content).toBe('route-ok')
  })
})
