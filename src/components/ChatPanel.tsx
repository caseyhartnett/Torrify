import { useRef, useEffect, useCallback, useState } from 'react'
import { createLLMService, PROVIDER_NAMES, requiresApiKey, type LLMMessage, type StreamController } from '../services/llm'
import type { CADBackend } from '../services/cad'
import { trackAnalyticsEvent } from '../services/analytics'
import { getRuntimeCapabilities } from '../platform/capabilities'
import { logger } from '../utils/logger'

/**
 * Represents a single message in the chat conversation.
 */
export interface Message {
  /** Unique identifier for the message */
  id: number
  /** The text content of the message */
  text: string
  /** Whether the message was sent by the user or the AI bot */
  sender: 'user' | 'bot'
  /** When the message was created */
  timestamp: Date
  /** If true, the message represents an error state */
  error?: boolean
  /** Optional array of base64 image data URLs attached to this message */
  readonly imageDataUrls?: string[]
  /** Whether this message is currently being streamed from the LLM */
  isStreaming?: boolean
}

/**
 * Data required to diagnose a CAD rendering error.
 */
interface PendingDiagnosis {
  /** The error message received from the CAD backend */
  error: string
  /** The code that caused the error */
  code: string
}

/**
 * Props for the ChatPanel component.
 */
interface ChatPanelProps {
  /** Current code in the editor, used as context for the LLM */
  currentCode?: string
  /** Array of image data URLs waiting to be sent with the next message */
  pendingSnapshots?: string[]
  /** Callback triggered after snapshots have been successfully sent */
  onSnapshotsSent?: () => void
  /** Callback to apply suggested code back to the main editor */
  onApplyCode?: (code: string) => boolean | Promise<boolean>
  /** Array of existing chat messages */
  messages: Message[]
  /** State setter for updating the chat messages */
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  /** The currently active CAD backend (OpenSCAD or build123d) */
  cadBackend?: CADBackend
  /** Optional diagnosis data if a render error just occurred */
  pendingDiagnosis?: PendingDiagnosis | null
  /** Callback to clear the pending diagnosis state */
  onDiagnosisSent?: () => void
  /** Version number of settings to trigger refreshes when configuration changes */
  settingsVersion?: number
}

/**
 * Internal result type for code extraction.
 */
interface ExtractedCode {
  /** The extracted CAD code, or null if no code was found */
  code: string | null
  /** The remaining text content of the message (the explanation) */
  message: string
}

/**
 * Strips specific XML-like tags used for CAD code blocks.
 * 
 * @param code - The raw code string potentially containing tags
 * @param backend - The CAD backend type to determine which tags to strip
 * @returns The cleaned code string
 */
const stripCodeTags = (code: string, backend: CADBackend): string => {
  const tagPattern = backend === 'openscad'
    ? /^\s*<\/?openscad>\s*$/gim
    : /^\s*<\/?python>\s*$/gim
  return code.replace(tagPattern, '').trim()
}

/**
 * Extracts CAD code from a raw LLM response string.
 * Supports both XML-style tags (<openscad>, <python>) and standard Markdown code fences.
 * 
 * @param text - The full response text from the LLM
 * @param backend - The CAD backend being used (defaults to 'openscad')
 * @returns An object containing the extracted code and the remaining message text
 */
const extractCodeFromResponse = (text: string, backend: CADBackend = 'openscad'): ExtractedCode => {
  const codeChunks: string[] = []
  let match: RegExpExecArray | null

  // Use backend-specific tag and language identifier
  const tagName = backend === 'openscad' ? 'openscad' : 'python'
  const fenceLangs = backend === 'openscad' ? ['openscad', 'scad'] : ['python', 'py', 'build123d']
  
  const tagRegex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'gi')
  
  // 1. Try to extract from custom XML-style tags
  while ((match = tagRegex.exec(text)) !== null) {
    const chunk = match[1].trim()
    if (chunk) {
      codeChunks.push(chunk)
    }
  }

  // Determine the descriptive part of the message (outside of tags)
  const assistantMatch = text.match(/<assistant>([\s\S]*?)<\/assistant>/i)
  let cleanedText = assistantMatch 
    ? assistantMatch[1].trim() 
    : text.replace(tagRegex, '').trim()

  // 2. Fallback to standard Markdown triple-backtick fences if no tags found
  if (codeChunks.length === 0) {
    const langPattern = fenceLangs.join('|')
    const fencedRegex = new RegExp(`\`\`\`(?:${langPattern})\\s*([\\s\\S]*?)\`\`\``, 'gi')
    
    while ((match = fencedRegex.exec(text)) !== null) {
      const chunk = match[1].trim()
      if (chunk) {
        codeChunks.push(chunk)
      }
    }
    
    if (!assistantMatch) {
      cleanedText = cleanedText.replace(fencedRegex, '').trim()
    }
  }

  // 3. Fallback for truncated responses (handle opening tag with no closing tag)
  if (codeChunks.length === 0 && new RegExp(`<${tagName}>`, 'i').test(text)) {
    const truncatedMatch = text.match(new RegExp(`<${tagName}>([\\s\\S]*)`, 'i'))
    if (truncatedMatch && truncatedMatch[1].trim()) {
      const cleaned = stripCodeTags(truncatedMatch[1], backend)
      if (cleaned) {
        codeChunks.push(cleaned)
        logger.debug(`[ChatPanel] Extracted code from truncated response (no closing </${tagName}>)`, { 
          length: cleaned.length 
        })
      }
    }
  }

  const combinedCode = codeChunks.length > 0 ? `${codeChunks.join('\n\n')}\n` : null
  
  return {
    code: combinedCode,
    message: cleanedText,
  }
}

/**
 * The ChatPanel component provides a conversational interface for interacting with the AI.
 * It handles message history, image attachments, streaming responses, and code extraction.
 * 
 * @param props - Component properties (see ChatPanelProps)
 * @returns The rendered chat interface
 */
function ChatPanel({ 
  currentCode, 
  pendingSnapshots, 
  onSnapshotsSent, 
  onApplyCode, 
  messages, 
  setMessages, 
  cadBackend = 'openscad', 
  pendingDiagnosis, 
  onDiagnosisSent, 
  settingsVersion = 0 
}: ChatPanelProps) {
  const runtimeCapabilities = getRuntimeCapabilities()
  const managedWebMode = runtimeCapabilities.usesManagedGatewayOnly
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [llmStatus, setLlmStatus] = useState<string>('Loading...')
  const [codeAppliedAt, setCodeAppliedAt] = useState<number | null>(null)
  const [apiContext, setApiContext] = useState<string | undefined>(undefined)
  const [includeContext, setIncludeContext] = useState(true)
  const [stagedImages, setStagedImages] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const streamControllerRef = useRef<StreamController | null>(null)
  const streamingMessageIdRef = useRef<number | null>(null)
  const onApplyCodeRef = useRef(onApplyCode)
  const onDiagnosisSentRef = useRef(onDiagnosisSent)
  const diagnosisInFlightRef = useRef(false)
  const sendToLlmRef = useRef<(userInput: string, imageDataUrls?: string[]) => Promise<void>>(async () => {})
  onApplyCodeRef.current = onApplyCode
  onDiagnosisSentRef.current = onDiagnosisSent

  const runWhenIdle = useCallback((task: () => void): (() => void) => {
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(task)
      return () => window.cancelIdleCallback(idleId)
    }

    const timeoutId = window.setTimeout(task, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  // Handle file selection for image import
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length > 0) {
      trackAnalyticsEvent('image_attachment_added', {
        source: 'chat',
        count: imageFiles.length
      })
    }

    imageFiles.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setStagedImages(prev => [...prev, dataUrl])
      }
      reader.readAsDataURL(file)
    })

    // Reset file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Remove a staged image
  const removeStagedImage = (index: number) => {
    setStagedImages(prev => prev.filter((_, i) => i !== index))
  }

  /**
   * Triggers a smooth scroll to the bottom of the chat history.
   */
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Scroll to bottom whenever messages list updates
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Clear the "Code applied" success message after a delay
  useEffect(() => {
    if (!codeAppliedAt) {
      return
    }

    const timer = window.setTimeout(() => {
      setCodeAppliedAt(null)
    }, 2000)

    return () => window.clearTimeout(timer)
  }, [codeAppliedAt])

  /**
   * Fetches and parses the API context (help/reference docs) for the current backend.
   * This context is injected into LLM prompts to improve code generation accuracy.
   */
  const loadApiContext = useCallback(async (backend: CADBackend) => {
    try {
      const result = await window.electronAPI.getContext(backend)
      if (result.success && result.content) {
        return result.content
      }
    } catch (error) {
      logger.error('Failed to load API context', error)
    }
    return undefined
  }, [])

  useEffect(() => {
    let cancelled = false
    const cancelIdleWork = runWhenIdle(() => {
      void loadApiContext(cadBackend).then((content) => {
        if (cancelled) return
        setApiContext(content)
      })
    })

    return () => {
      cancelled = true
      cancelIdleWork()
    }
  }, [cadBackend, loadApiContext, runWhenIdle])

  /**
   * Refreshes the display status of the AI provider based on current user settings.
   */
  const loadLLMStatus = useCallback(async () => {
    try {
      const settings = await window.electronAPI.getSettings()
      if (settings.llm.enabled) {
        if (settings.llm.provider === 'gateway') {
          if (settings.llm.gatewayLicenseKey?.trim()) {
            setLlmStatus(`${PROVIDER_NAMES[settings.llm.provider]} (${settings.llm.model})`)
          } else {
            setLlmStatus(
              managedWebMode
                ? `PRO Gateway (Free Tier)${settings.llm.model ? ` (${settings.llm.model})` : ''}`
                : 'PRO License Key Required - Configure in Settings'
            )
          }
        } else if (settings.llm.provider === 'openrouter') {
          const configured = await window.electronAPI.getOpenRouterConfigured()
          if (configured) {
            setLlmStatus(`${PROVIDER_NAMES[settings.llm.provider]} (${settings.llm.model})`)
          } else {
            setLlmStatus('OpenRouter API Key Required - Set OPENROUTER_API_KEY in environment')
          }
        } else if (!requiresApiKey(settings.llm.provider)) {
          setLlmStatus(`${PROVIDER_NAMES[settings.llm.provider]} (${settings.llm.model})`)
        } else if (settings.llm.apiKey?.trim()) {
          setLlmStatus(`${PROVIDER_NAMES[settings.llm.provider]} (${settings.llm.model})`)
        } else {
          setLlmStatus('API Key Required - Configure in Settings')
        }
      } else {
        setLlmStatus('AI Disabled')
      }
    } catch {
      setLlmStatus('AI Not Configured')
    }
  }, [managedWebMode])

  useEffect(() => {
    const cancelIdleWork = runWhenIdle(() => {
      void loadLLMStatus()
    })

    return cancelIdleWork
  }, [loadLLMStatus, runWhenIdle, settingsVersion])

  /**
   * Ensures context is available before the first AI request when enabled.
   */
  const getApiContextForRequest = useCallback(async () => {
    if (!includeContext) {
      return undefined
    }

    if (apiContext !== undefined) {
      return apiContext
    }

    const content = await loadApiContext(cadBackend)
    setApiContext(content)
    return content
  }, [apiContext, cadBackend, includeContext, loadApiContext])

  /**
   * Automatically handles error diagnosis when the main process reports a render failure.
   * Prepares a diagnostic prompt containing the error message and the offending code.
   */
  useEffect(() => {
    if (!pendingDiagnosis) {
      diagnosisInFlightRef.current = false
      return
    }

    if (!isLoading && !diagnosisInFlightRef.current) {
      diagnosisInFlightRef.current = true
      const processDiagnosis = async () => {
        const backendName = cadBackend === 'build123d' ? 'build123d (Python)' : 'OpenSCAD'
        const codeBlockLang = cadBackend === 'build123d' ? 'python' : 'openscad'
        
        const diagnosisText = `I got this error when trying to render my ${backendName} code. Please help me understand and fix the error.

**Error:**
\`\`\`
${pendingDiagnosis.error}
\`\`\`

**My Code:**
\`\`\`${codeBlockLang}
${pendingDiagnosis.code}
\`\`\``

        const userMessage: Message = {
          id: Date.now(),
          text: diagnosisText,
          sender: 'user',
          timestamp: new Date()
        }
        setIsLoading(true)
        setMessages(prev => [...prev, userMessage])
        
        onDiagnosisSentRef.current?.()
        
        await sendToLlmRef.current(diagnosisText)
      }
      
      void processDiagnosis().catch((error) => {
        logger.error('Failed to process automatic diagnosis request', error)
      })
    }
  }, [pendingDiagnosis, isLoading, cadBackend, setMessages])

  /**
   * Main communication loop with the LLM. 
   * Handles both streaming and non-streaming providers.
   * 
   * @param userInput - The text message from the user
   * @param imageDataUrls - Optional array of images to include in the multi-modal prompt
   */
  const sendToLlm = useCallback(async (userInput: string, imageDataUrls?: string[]) => {
    try {
      const settings = await window.electronAPI.getSettings()
      
      if (!settings.llm.enabled) {
        throw new Error('AI is disabled. Enable it in Settings.')
      }

      // Validate provider configuration before attempt
      if (settings.llm.provider === 'gateway') {
        if (!runtimeCapabilities.gatewayLicenseKeyOptional && !settings.llm.gatewayLicenseKey?.trim()) {
          throw new Error('PRO license key not configured. Add it in Settings.')
        }
      } else if (settings.llm.provider === 'openrouter') {
        const configured = await window.electronAPI.getOpenRouterConfigured()
        if (!configured) {
          throw new Error('OpenRouter API key not configured. Set OPENROUTER_API_KEY in environment.')
        }
      } else if (requiresApiKey(settings.llm.provider) && !settings.llm.apiKey?.trim()) {
        logger.debug('LLM Provider:', settings.llm.provider, 'Has API Key:', !!settings.llm.apiKey?.trim())
        throw new Error('API key not configured. Please add it in Settings.')
      }

      const llmService = createLLMService(settings.llm)
      const requestContext = await getApiContextForRequest()

      // Transform chat history into LLM-compatible message format
      const llmMessages: LLMMessage[] = messages
        .filter(m => !m.error && !m.isStreaming)
        .map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        }))

      llmMessages.push({
        role: 'user',
        content: userInput,
        imageDataUrls
      })

      if (llmService.supportsStreaming() && llmService.streamMessage) {
        const streamingMessageId = Date.now() + 1
        streamingMessageIdRef.current = streamingMessageId
        
        const streamingMessage: Message = {
          id: streamingMessageId,
          text: '',
          sender: 'bot',
          timestamp: new Date(),
          isStreaming: true
        }
        setMessages(prev => [...prev, streamingMessage])
        setIsStreaming(true)

        const controller = await llmService.streamMessage(
          llmMessages,
          async (_chunk, accumulated, done) => {
            if (done) {
              setIsStreaming(false)
              streamControllerRef.current = null

              logger.debug('[ChatPanel] Stream complete', {
                accumulatedLength: accumulated?.length ?? 0
              })

              const extracted = extractCodeFromResponse(accumulated, cadBackend)
              if (extracted.code) {
                logger.debug('[ChatPanel] Applying extracted code to editor')
                const rendered = await onApplyCodeRef.current?.(extracted.code)
                if (rendered === true) {
                  setCodeAppliedAt(Date.now())
                }
              }

              // Finalize the streaming message with cleaned text (explanation only)
              setMessages(prev => prev.map(m => 
                m.id === streamingMessageId 
                  ? { ...m, text: extracted.message || accumulated, isStreaming: false }
                  : m
              ))
              
              setIsLoading(false)
              if (imageDataUrls && imageDataUrls.length > 0) {
                onSnapshotsSent?.()
              }
            } else {
              // Update UI with partial response
              setMessages(prev => prev.map(m => 
                m.id === streamingMessageId 
                  ? { ...m, text: accumulated }
                  : m
              ))
            }
          },
          currentCode,
          cadBackend,
          requestContext
        )
        
        streamControllerRef.current = controller
      } else {
        // Handle non-streaming providers (e.g. standard API calls)
        const response = await llmService.sendMessage(
          llmMessages, 
          currentCode, 
          cadBackend, 
          requestContext
        )

        const extracted = extractCodeFromResponse(response.content, cadBackend)
        if (extracted.code) {
          const rendered = await onApplyCodeRef.current?.(extracted.code)
          if (rendered === true) {
            setCodeAppliedAt(Date.now())
          }
        }

        if (extracted.message) {
          const botMessage: Message = {
            id: Date.now() + 1,
            text: extracted.message,
            sender: 'bot',
            timestamp: new Date()
          }
          setMessages(prev => [...prev, botMessage])
        }
        
        setIsLoading(false)
        if (imageDataUrls && imageDataUrls.length > 0) {
          onSnapshotsSent?.()
        }
      }

    } catch (error: unknown) {
      logger.error('LLM communication error', error)
      const errorText = error instanceof Error ? error.message : 'Failed to get AI response'
      const errorMessage: Message = {
        id: Date.now() + 1,
        text: `Error: ${errorText}`,
        sender: 'bot',
        timestamp: new Date(),
        error: true
      }
      setMessages(prev => [...prev, errorMessage])
      setIsLoading(false)
      setIsStreaming(false)
      streamControllerRef.current = null
      if (imageDataUrls && imageDataUrls.length > 0) {
        onSnapshotsSent?.()
      }
    }
  }, [currentCode, messages, onSnapshotsSent, cadBackend, setMessages, getApiContextForRequest, runtimeCapabilities.gatewayLicenseKeyOptional])
  sendToLlmRef.current = sendToLlm

  /**
   * Orchestrates sending a new user message.
   * Collects staged images, adds message to history, and triggers LLM call.
   */
  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userInput = input
    setInput('')
    setIsLoading(true)

    const allImages = [...(pendingSnapshots || []), ...stagedImages]
    const hasImages = allImages.length > 0

    trackAnalyticsEvent('chat_message_sent', {
      source: 'chat',
      backend: cadBackend,
      hasImages,
      imageCount: allImages.length
    })

    const userMessage: Message = {
      id: Date.now(),
      text: userInput,
      sender: 'user',
      timestamp: new Date(),
      imageDataUrls: hasImages ? allImages : undefined
    }

    setMessages(prev => [...prev, userMessage])
    setStagedImages([])
    
    await sendToLlm(userInput, hasImages ? allImages : undefined)
  }

  /**
   * Terminates an active streaming request via the AbortController.
   */
  const handleStopStreaming = useCallback(() => {
    if (streamControllerRef.current) {
      streamControllerRef.current.abort()
      streamControllerRef.current = null
    }
    
    if (streamingMessageIdRef.current) {
      setMessages(prev => prev.map(m => 
        m.id === streamingMessageIdRef.current 
          ? { ...m, isStreaming: false, text: m.text + '\n\n[Stopped]' }
          : m
      ))
      streamingMessageIdRef.current = null
    }
    
    setIsStreaming(false)
    setIsLoading(false)
  }, [setMessages])

  /**
   * Handles keyboard shortcuts for the message textarea.
   * Sends the message on Enter (without Shift).
   * 
   * @param e - Keyboard event
   */
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamControllerRef.current) {
        streamControllerRef.current.abort()
      }
    }
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#3e3e42]">
        <h2 className="text-lg font-semibold">AI Assistant</h2>
        <p className="text-xs text-gray-400">
          {isStreaming ? (
            <span className="text-blue-400">Streaming...</span>
          ) : (
            llmStatus
          )}
        </p>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.sender === 'user'
                  ? 'bg-blue-600 text-white'
                  : message.error
                  ? 'bg-red-900/30 text-red-300 border border-red-700'
                  : 'bg-[#2d2d30] text-gray-200'
              }`}
            >
              {/* Display attached images */}
              {message.imageDataUrls && message.imageDataUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {message.imageDataUrls.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Attached ${i + 1}`}
                      className="max-w-full max-h-48 rounded cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => window.open(url, '_blank')}
                      title="Click to view full size"
                    />
                  ))}
                </div>
              )}
              <p className="text-sm whitespace-pre-wrap">
                {message.text}
                {message.isStreaming && (
                  <span className="inline-block w-2 h-4 ml-1 bg-blue-400 animate-pulse" />
                )}
              </p>
              <p className="text-xs opacity-60 mt-1">
                {message.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        {codeAppliedAt && (
          <div className="flex justify-center">
            <div className="text-xs text-green-300 bg-green-900/30 border border-green-700 px-2 py-1 rounded">
              Code applied and rendered
            </div>
          </div>
        )}
        {!!pendingSnapshots?.length && (
          <div className="flex justify-center">
            <div className="text-xs text-blue-200 bg-blue-900/30 border border-blue-700 px-2 py-1 rounded">
              Images queued: {pendingSnapshots.length}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-[#3e3e42]">
        {/* Staged Images Preview */}
        {stagedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {stagedImages.map((dataUrl, index) => (
              <div key={index} className="relative group">
                <img
                  src={dataUrl}
                  alt={`Staged ${index + 1}`}
                  className="w-16 h-16 object-cover rounded border border-[#3e3e42]"
                />
                <button
                  onClick={() => removeStagedImage(index)}
                  type="button"
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 hover:bg-red-700 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove image"
                  aria-label={`Remove staged image ${index + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        
        <div className="flex justify-end mb-2 px-1">
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer hover:text-gray-300 select-none">
            <input
              type="checkbox"
              checked={includeContext}
              onChange={(e) => setIncludeContext(e.target.checked)}
              className="rounded bg-[#2d2d30] border-[#3e3e42] text-blue-600 focus:ring-0 focus:ring-offset-0 w-3 h-3"
            />
            <span>Include API Context {cadBackend === 'build123d' ? '(~27KB)' : '(~2.5KB)'}</span>
          </label>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="px-3 py-2 bg-[#3e3e42] hover:bg-[#4e4e52] disabled:bg-[#2d2d30] disabled:cursor-not-allowed rounded transition-colors"
            title="Attach images"
            aria-label="Attach images"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 bg-[#2d2d30] text-white px-3 py-2 rounded border border-[#3e3e42] focus:outline-none focus:border-blue-500 resize-none"
            rows={2}
            aria-label="Chat message"
          />
          {isStreaming ? (
            <button
              onClick={handleStopStreaming}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-medium transition-colors"
              title="Stop streaming"
              aria-label="Stop streaming response"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium transition-colors"
              aria-label="Send message"
            >
              {isLoading ? 'Thinking...' : 'Send'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatPanel
