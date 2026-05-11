import type {
  CADBackend,
  LLMConfig,
  LLMMessage,
  LLMResponse,
  LLMService,
  StreamCallback,
  StreamController
} from './types'
import {
  buildMessageContent,
  buildSystemContent,
  extractContent,
  fetchWithTimeout,
  streamSseResponse,
  type MessageContent,
  type SystemMessageContent
} from './utils'
import { logger } from '../utils/logger'

type CustomApiMode = 'chat-completions' | 'responses'
type ResponsesInputContentPart = { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string }

const DEFAULT_CUSTOM_ENDPOINT = 'http://127.0.0.1:1234/v1'

function normalizeEndpoint(endpoint?: string): string {
  const value = endpoint?.trim()
  if (!value) {
    return DEFAULT_CUSTOM_ENDPOINT
  }
  return value.replace(/\/+$/, '')
}

function normalizeApiBase(endpoint: string): string {
  const lower = endpoint.toLowerCase()
  if (lower.endsWith('/chat/completions')) {
    return endpoint.slice(0, -'/chat/completions'.length)
  }
  if (lower.endsWith('/responses')) {
    return endpoint.slice(0, -'/responses'.length)
  }
  return endpoint
}

function withPath(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`
}

function buildAuthHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }
  return headers
}

function inferMode(baseUrl: string): CustomApiMode {
  const normalized = baseUrl.toLowerCase()
  if (normalized.endsWith('/responses')) {
    return 'responses'
  }
  return 'chat-completions'
}

function isCompatibilityFallbackError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return error.message.includes('(404)') || error.message.includes('(405)')
}

function systemContentToText(systemContent: SystemMessageContent): string {
  return typeof systemContent === 'string'
    ? systemContent
    : systemContent.map((part) => part.text).join('')
}

function buildChatPayloadMessages(
  messages: LLMMessage[],
  systemContent: SystemMessageContent
): Array<{ role: string; content: MessageContent }> {
  return [
    { role: 'system', content: systemContentToText(systemContent) },
    ...messages.map((message) => ({
      role: message.role,
      content: buildMessageContent(message)
    }))
  ]
}

function buildResponsesInputMessages(
  messages: LLMMessage[]
): Array<{ role: string; content: string | ResponsesInputContentPart[] }> {
  return messages.map((message) => {
    const imageDataUrls = message.imageDataUrls ?? []
    if (imageDataUrls.length === 0) {
      return {
        role: message.role,
        content: message.content
      }
    }

    const content: ResponsesInputContentPart[] = []
    if (message.content) {
      content.push({ type: 'input_text', text: message.content })
    }
    for (const url of imageDataUrls) {
      content.push({ type: 'input_image', image_url: url })
    }
    return {
      role: message.role,
      content
    }
  })
}

function extractResponsesOutputText(output: unknown): string {
  if (!Array.isArray(output)) {
    return ''
  }
  return output
    .map((item) => {
      const content = item && typeof item === 'object' ? (item as Record<string, unknown>).content : null
      if (!Array.isArray(content)) {
        return ''
      }
      return content
        .map((part) => {
          if (!part || typeof part !== 'object') {
            return ''
          }
          const record = part as Record<string, unknown>
          if (typeof record.text === 'string') {
            return record.text
          }
          if (
            record.type === 'output_text' &&
            typeof record.text === 'string'
          ) {
            return record.text
          }
          return ''
        })
        .join('')
    })
    .join('')
}

export class CustomService implements LLMService {
  private readonly config: LLMConfig
  private readonly endpoint: string
  private readonly mode: CustomApiMode

  constructor(config: LLMConfig) {
    this.config = config
    const normalizedEndpoint = normalizeEndpoint(config.customEndpoint)
    this.mode = inferMode(normalizedEndpoint)
    this.endpoint = normalizeApiBase(normalizedEndpoint)
  }

  async sendMessage(
    messages: LLMMessage[],
    currentCode?: string,
    cadBackend: CADBackend = 'openscad',
    apiContext?: string
  ): Promise<LLMResponse> {
    if (!messages || messages.length === 0) {
      throw new Error('Messages array cannot be empty')
    }
    if (!messages.some((m) => m.role === 'user')) {
      throw new Error('At least one user message is required')
    }

    if (this.mode === 'responses') {
      return this.sendWithResponses(messages, currentCode, cadBackend, apiContext)
    }
    try {
      return await this.sendWithChatCompletions(messages, currentCode, cadBackend, apiContext)
    } catch (error) {
      if (!isCompatibilityFallbackError(error)) {
        throw error
      }
      logger.debug('[Custom] Falling back to /responses for non-chat-compatible endpoint')
      return this.sendWithResponses(messages, currentCode, cadBackend, apiContext)
    }
  }

  private async sendWithChatCompletions(
    messages: LLMMessage[],
    currentCode?: string,
    cadBackend: CADBackend = 'openscad',
    apiContext?: string
  ): Promise<LLMResponse> {
    const systemContent = buildSystemContent({
      model: this.config.model,
      cadBackend,
      currentCode,
      apiContext,
      loggerPrefix: 'Custom'
    })
    const payloadMessages = buildChatPayloadMessages(messages, systemContent)

    const response = await fetchWithTimeout(withPath(this.endpoint, '/chat/completions'), {
      method: 'POST',
      headers: buildAuthHeaders(this.config.apiKey),
      body: JSON.stringify({
        model: this.config.model,
        messages: payloadMessages,
        temperature: this.config.temperature ?? 0.7,
        max_tokens: this.config.maxTokens ?? 128000
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Custom endpoint error (${response.status}): ${errorText || response.statusText}`)
    }

    const data = await response.json()
    const content = extractContent(data?.choices?.[0]?.message?.content)
    return {
      content,
      model: this.config.model,
      usage: {
        promptTokens: data?.usage?.prompt_tokens ?? 0,
        completionTokens: data?.usage?.completion_tokens ?? 0,
        totalTokens: data?.usage?.total_tokens ?? 0
      }
    }
  }

  private async sendWithResponses(
    messages: LLMMessage[],
    currentCode?: string,
    cadBackend: CADBackend = 'openscad',
    apiContext?: string
  ): Promise<LLMResponse> {
    const systemContent = buildSystemContent({
      model: this.config.model,
      cadBackend,
      currentCode,
      apiContext,
      loggerPrefix: 'Custom'
    })
    const inputMessages = buildResponsesInputMessages(messages)

    const response = await fetchWithTimeout(withPath(this.endpoint, '/responses'), {
      method: 'POST',
      headers: buildAuthHeaders(this.config.apiKey),
      body: JSON.stringify({
        model: this.config.model,
        instructions: systemContentToText(systemContent),
        input: inputMessages,
        temperature: this.config.temperature ?? 0.7,
        max_output_tokens: this.config.maxTokens ?? 128000
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Custom endpoint error (${response.status}): ${errorText || response.statusText}`)
    }

    const data = await response.json()
    const content =
      typeof data?.output_text === 'string' ? data.output_text : extractResponsesOutputText(data?.output)

    return {
      content,
      model: this.config.model,
      usage: {
        promptTokens: data?.usage?.input_tokens ?? 0,
        completionTokens: data?.usage?.output_tokens ?? 0,
        totalTokens: data?.usage?.total_tokens ?? 0
      }
    }
  }

  async streamMessage(
    messages: LLMMessage[],
    onChunk: StreamCallback,
    currentCode?: string,
    cadBackend: CADBackend = 'openscad',
    apiContext?: string
  ): Promise<StreamController> {
    if (!messages || messages.length === 0) {
      throw new Error('Messages array cannot be empty')
    }
    if (!messages.some((m) => m.role === 'user')) {
      throw new Error('At least one user message is required')
    }

    const abortController = new AbortController()
    const controller: StreamController = {
      abort: () => abortController.abort()
    }
    let latestContent = ''

    ;(async () => {
      try {
        const systemContent = buildSystemContent({
          model: this.config.model,
          cadBackend,
          currentCode,
          apiContext,
          loggerPrefix: 'Custom'
        })
        const payloadMessages = buildChatPayloadMessages(messages, systemContent)
        const responsesInputMessages = buildResponsesInputMessages(messages)
        const responsesInstructions = systemContentToText(systemContent)

        const openAiBody = {
          model: this.config.model,
          messages: payloadMessages,
          temperature: this.config.temperature ?? 0.7,
          max_tokens: this.config.maxTokens ?? 128000,
          stream: true
        }

        const attemptStream = async (useResponses: boolean) => {
          const url = useResponses ? withPath(this.endpoint, '/responses') : withPath(this.endpoint, '/chat/completions')
          const body = useResponses
            ? {
                model: this.config.model,
                instructions: responsesInstructions,
                input: responsesInputMessages,
                temperature: this.config.temperature ?? 0.7,
                max_output_tokens: this.config.maxTokens ?? 128000,
                stream: true
              }
            : openAiBody
          const response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: buildAuthHeaders(this.config.apiKey),
            body: JSON.stringify(body),
            signal: abortController.signal
          })
          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Custom endpoint error (${response.status}): ${errorText || response.statusText}`)
          }
          return response
        }

        let response: Response
        if (this.mode === 'responses') {
          response = await attemptStream(true)
          await this.streamResponses(response, (delta, full, done) => {
            latestContent = full
            onChunk(delta, full, done)
          })
          return
        }

        try {
          response = await attemptStream(false)
        } catch (error) {
          if (!isCompatibilityFallbackError(error)) {
            throw error
          }
          logger.debug('[Custom] Falling back to /responses streaming for non-chat-compatible endpoint')
          response = await attemptStream(true)
          await this.streamResponses(response, (delta, full, done) => {
            latestContent = full
            onChunk(delta, full, done)
          })
          return
        }

        await streamSseResponse(
          response,
          (delta, full, done) => {
            latestContent = full
            onChunk(delta, full, done)
          },
          'Custom'
        )
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        logger.error('Custom streaming error', error)
        onChunk(`\n\n[Error: ${errorMessage}]`, latestContent, true)
      }
    })()

    return controller
  }

  private async streamResponses(response: Response, onChunk: StreamCallback): Promise<void> {
    if (!response.body) {
      throw new Error('Response body is not available for streaming')
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let accumulated = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        onChunk('', accumulated, true)
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line || line.startsWith(':') || !line.startsWith('data: ')) {
          continue
        }
        const data = line.slice(6)
        if (data === '[DONE]') {
          onChunk('', accumulated, true)
          return
        }
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>
          const type = typeof parsed.type === 'string' ? parsed.type : ''
          const delta =
            (type === 'response.output_text.delta' && typeof parsed.delta === 'string'
              ? parsed.delta
              : (parsed.delta && typeof parsed.delta === 'object' && typeof (parsed.delta as Record<string, unknown>).text === 'string'
                  ? ((parsed.delta as Record<string, unknown>).text as string)
                  : ''))
          if (delta) {
            accumulated += delta
            onChunk(delta, accumulated, false)
          }
          if (type === 'response.completed') {
            onChunk('', accumulated, true)
            return
          }
        } catch {
          logger.warn('[Custom] Failed to parse responses SSE chunk:', data)
        }
      }
    }
  }

  supportsStreaming(): boolean {
    return true
  }

  getProviderName(): string {
    return 'Custom / Local Model'
  }
}
