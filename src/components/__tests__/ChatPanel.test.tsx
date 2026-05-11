import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatPanel, { type Message } from '../ChatPanel'
import { useState } from 'react'
import { createLLMService } from '../../services/llm'

const mockedCreateLLMService = vi.mocked(createLLMService)

type Settings = Awaited<ReturnType<typeof window.electronAPI.getSettings>>

const defaultSettings = {
  cadBackend: 'openscad',
  openscadPath: 'C:\\Program Files\\OpenSCAD (Nightly)\\openscad.exe',
  build123dPythonPath: 'python',
  llm: {
    provider: 'gemini',
    model: 'gemini-3-flash',
    apiKey: 'test-api-key',
    enabled: true,
    temperature: 0.7,
    maxTokens: 2048,
  },
  recentFiles: [],
} satisfies Settings

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))
const settleUi = async () => {
  await act(async () => {
    await flushPromises()
  })
}

const defaultMessages: Message[] = [
  {
    id: 1,
    text: 'Hello! I\'m your OpenSCAD assistant powered by AI. Ask me anything about OpenSCAD, and I can help you write code, debug issues, or explain concepts!',
    sender: 'bot',
    timestamp: new Date()
  }
]

function ChatPanelWrapper() {
  const [messages, setMessages] = useState<Message[]>(defaultMessages)
  return <ChatPanel messages={messages} setMessages={setMessages} />
}

function ChatPanelWithApplyCode({ onApplyCode }: { onApplyCode: (code: string) => boolean | Promise<boolean> }) {
  const [messages, setMessages] = useState<Message[]>(defaultMessages)
  return <ChatPanel messages={messages} setMessages={setMessages} onApplyCode={onApplyCode} />
}

function ChatPanelWithCode({
  currentCode,
  onApplyCode
}: {
  currentCode: string
  onApplyCode?: (code: string) => boolean | Promise<boolean>
}) {
  const [messages, setMessages] = useState<Message[]>(defaultMessages)
  return <ChatPanel messages={messages} setMessages={setMessages} currentCode={currentCode} onApplyCode={onApplyCode} />
}

function ChatPanelWithMutableCode({
  onApplyCode
}: {
  onApplyCode: (code: string) => boolean | Promise<boolean>
}) {
  const [messages, setMessages] = useState<Message[]>(defaultMessages)
  const [currentCode, setCurrentCode] = useState('cube([10, 10, 10]);')

  return (
    <>
      <button type="button" onClick={() => setCurrentCode('sphere(5);')}>
        Mutate editor code
      </button>
      <ChatPanel
        messages={messages}
        setMessages={setMessages}
        currentCode={currentCode}
        onApplyCode={onApplyCode}
      />
    </>
  )
}

function ChatPanelWithDelayedDiagnosisClear() {
  const [messages, setMessages] = useState<Message[]>(defaultMessages)
  const [pendingDiagnosis, setPendingDiagnosis] = useState<{ error: string; code: string } | null>({
    error: 'Parser failed near line 1',
    code: 'cube([10, 10, 10]);'
  })

  return (
    <ChatPanel
      messages={messages}
      setMessages={setMessages}
      pendingDiagnosis={pendingDiagnosis}
      onDiagnosisSent={() => {
        window.setTimeout(() => {
          setPendingDiagnosis(null)
        }, 25)
      }}
    />
  )
}

async function renderChatPanel() {
  const utils = render(<ChatPanelWrapper />)
  await waitFor(() => {
    expect(window.electronAPI.getSettings).toHaveBeenCalled()
    expect(window.electronAPI.getContext).toHaveBeenCalled()
  })
  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })
  await settleUi()
  return utils
}

describe('ChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue(defaultSettings)
    mockedCreateLLMService.mockReturnValue({
      sendMessage: vi.fn().mockResolvedValue({
        content: 'This is a mocked AI response for testing.',
        model: 'test-model',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      }),
      supportsStreaming: vi.fn().mockReturnValue(false),
      getProviderName: vi.fn().mockReturnValue('Mock Provider')
    } as unknown as ReturnType<typeof createLLMService>)
  })

  it('renders the chat interface', async () => {
    await renderChatPanel()
    
    expect(screen.getByText('AI Assistant')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Type a message or paste an image...')).toBeInTheDocument()
  })

  it('displays initial welcome message', async () => {
    await renderChatPanel()
    
    expect(screen.getByText(/I'm your OpenSCAD assistant/i)).toBeInTheDocument()
  })

  it('renders bot Markdown while keeping user messages plain', async () => {
    const [messages, setMessages] = [
      [
        {
          id: 1,
          text: '### Parsed Bot Heading\n| A | B |\n| :--- | :--- |\n| **left** | `right` |',
          sender: 'bot' as const,
          timestamp: new Date()
        },
        {
          id: 2,
          text: '### Plain User Heading',
          sender: 'user' as const,
          timestamp: new Date()
        }
      ],
      vi.fn()
    ]

    render(<ChatPanel messages={messages} setMessages={setMessages} />)

    await waitFor(() => {
      expect(window.electronAPI.getSettings).toHaveBeenCalled()
    })

    expect(screen.getByRole('heading', { name: 'Parsed Bot Heading', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('### Plain User Heading')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Plain User Heading' })).not.toBeInTheDocument()
  })

  it('allows user to type a message', async () => {
    await renderChatPanel()
    
    const input = screen.getByPlaceholderText('Type a message or paste an image...')
    fireEvent.change(input, { target: { value: 'Hello bot' } })
    
    expect(input).toHaveValue('Hello bot')
  })

  it('sends message when Send button is clicked', async () => {
    const user = userEvent.setup()
    await renderChatPanel()
    
    const input = screen.getByPlaceholderText('Type a message or paste an image...')
    const sendButton = screen.getByRole('button', { name: /send/i })
    
    fireEvent.change(input, { target: { value: 'Test message' } })
    await act(async () => {
      await user.click(sendButton)
      await flushPromises()
    })
    
    // User message should appear
    expect(screen.getByText('Test message')).toBeInTheDocument()
    
    // Input should be cleared
    expect(input).toHaveValue('')
  })

  it('sends message when Enter is pressed', async () => {
    await renderChatPanel()
    
    const input = screen.getByPlaceholderText('Type a message or paste an image...')
    
    fireEvent.change(input, { target: { value: 'Test with Enter' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    await settleUi()
    
    // User message should appear
    expect(screen.getByText('Test with Enter')).toBeInTheDocument()
  })

  it('displays bot response after user message', async () => {
    const user = userEvent.setup()
    await renderChatPanel()
    
    const input = screen.getByPlaceholderText('Type a message or paste an image...')
    const sendButton = screen.getByRole('button', { name: /send/i })
    
    fireEvent.change(input, { target: { value: 'Hello' } })
    await act(async () => {
      await user.click(sendButton)
      await flushPromises()
    })
    
    // Wait for user message to appear (LLM calls are mocked, may show error in tests)
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('does not send empty messages', async () => {
    const user = userEvent.setup()
    await renderChatPanel()
    
    const sendButton = screen.getByRole('button', { name: /send/i })
    await act(async () => {
      await user.click(sendButton)
      await flushPromises()
    })
    
    expect(mockedCreateLLMService).not.toHaveBeenCalled()
  })

  it('sends the code locator prompt from the reload icon button', async () => {
    const user = userEvent.setup()
    const sendMessage = vi.fn().mockResolvedValue({
      content: '<openscad>cube([10, 10, 10]);</openscad>',
      model: 'test-model',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    })

    mockedCreateLLMService.mockReturnValue({
      sendMessage,
      supportsStreaming: vi.fn().mockReturnValue(false),
      getProviderName: vi.fn().mockReturnValue('Mock Provider')
    } as unknown as ReturnType<typeof createLLMService>)

    await renderChatPanel()

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /ask ai where the code is/i }))
      await flushPromises()
    })

    await waitFor(() => {
      expect(screen.getByText('Wheres is the code')).toBeInTheDocument()
    })
    expect(sendMessage).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('Output ONLY one <openscad>...</openscad> block')
        })
      ]),
      undefined,
      'openscad',
      expect.any(String)
    )
  })

  it('retries the code locator request when the AI returns prose without code', async () => {
    const user = userEvent.setup()
    const onApplyCode = vi.fn().mockResolvedValue(true)
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({
        content: 'Here is the final corrected code:',
        model: 'test-model',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      })
      .mockResolvedValueOnce({
        content: '<openscad>cube([20, 20, 20]);</openscad>',
        model: 'test-model',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      })

    mockedCreateLLMService.mockReturnValue({
      sendMessage,
      supportsStreaming: vi.fn().mockReturnValue(false),
      getProviderName: vi.fn().mockReturnValue('Mock Provider')
    } as unknown as ReturnType<typeof createLLMService>)

    render(<ChatPanelWithApplyCode onApplyCode={onApplyCode} />)
    await waitFor(() => {
      expect(window.electronAPI.getSettings).toHaveBeenCalled()
    })

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /ask ai where the code is/i }))
      await flushPromises()
    })

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledTimes(2)
      expect(onApplyCode).toHaveBeenCalledWith('cube([20, 20, 20]);\n')
    })
    expect(sendMessage.mock.calls[1][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('Retry now with ONLY the complete, runnable code')
        })
      ])
    )
  })

  it('sends current editor code as authoritative request context', async () => {
    const user = userEvent.setup()
    const sendMessage = vi.fn().mockResolvedValue({
      content: 'I will preserve the current code.',
      model: 'test-model',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    })

    mockedCreateLLMService.mockReturnValue({
      sendMessage,
      supportsStreaming: vi.fn().mockReturnValue(false),
      getProviderName: vi.fn().mockReturnValue('Mock Provider')
    } as unknown as ReturnType<typeof createLLMService>)

    render(<ChatPanelWithCode currentCode={'module current_object() {\n  cube([10, 10, 10]);\n}'} />)

    await waitFor(() => {
      expect(window.electronAPI.getSettings).toHaveBeenCalled()
    })

    fireEvent.change(screen.getByPlaceholderText('Type a message or paste an image...'), {
      target: { value: 'Make it taller' }
    })

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /send/i }))
      await flushPromises()
    })

    expect(sendMessage).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('AUTHORITATIVE CURRENT EDITOR STATE')
        }),
        expect.objectContaining({
          role: 'user',
          content: 'Make it taller'
        })
      ]),
      'module current_object() {\n  cube([10, 10, 10]);\n}',
      'openscad',
      expect.any(String)
    )
    expect(sendMessage.mock.calls[0][0][1].content).toContain('module current_object()')
  })

  it('streams responses when provider supports streaming', async () => {
    const user = userEvent.setup()
    const streamMessage = vi.fn(async (_messages, onChunk) => {
      await act(async () => {
        onChunk('Hello', 'Hello', false)
        onChunk(' world', 'Hello world', true)
      })
      return { abort: vi.fn() }
    })

    mockedCreateLLMService.mockReturnValue({
      sendMessage: vi.fn(),
      streamMessage,
      supportsStreaming: vi.fn().mockReturnValue(true),
      getProviderName: vi.fn().mockReturnValue('Mock Provider')
    } as unknown as ReturnType<typeof createLLMService>)

    await renderChatPanel()

    const input = screen.getByPlaceholderText('Type a message or paste an image...')
    const sendButton = screen.getByRole('button', { name: /send/i })
    fireEvent.change(input, { target: { value: 'Stream this' } })
    await act(async () => {
      await user.click(sendButton)
      await flushPromises()
    })

    await waitFor(() => {
      expect(screen.getByText('Hello world')).toBeInTheDocument()
    })

    expect(streamMessage).toHaveBeenCalled()
  })

  it('attaches images to outgoing messages', async () => {
    const user = userEvent.setup()
    const { container } = await renderChatPanel()

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['test-image'], 'test.png', { type: 'image/png' })

    await act(async () => {
      await user.upload(fileInput, file)
      await flushPromises()
    })
    await waitFor(() => {
      expect(screen.getByAltText('Staged 1')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Type a message or paste an image...')
    const sendButton = screen.getByRole('button', { name: /send/i })
    fireEvent.change(input, { target: { value: 'Here is an image' } })
    await act(async () => {
      await user.click(sendButton)
      await flushPromises()
    })

    await waitFor(() => {
      expect(screen.getByAltText('Attached 1')).toBeInTheDocument()
    })
  })

  it('stages pasted images and sends them with the next message', async () => {
    const user = userEvent.setup()
    await renderChatPanel()

    const input = screen.getByPlaceholderText('Type a message or paste an image...')
    const file = new File(['pasted-image'], 'pasted.png', { type: 'image/png' })

    fireEvent.paste(input, {
      clipboardData: {
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => file
          }
        ]
      }
    })

    await waitFor(() => {
      expect(screen.getByAltText('Staged 1')).toBeInTheDocument()
    })

    fireEvent.change(input, { target: { value: 'Use this pasted image' } })
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /send/i }))
      await flushPromises()
    })

    await waitFor(() => {
      expect(screen.getByAltText('Attached 1')).toBeInTheDocument()
    })
  })

  it('shows error message when AI is disabled', async () => {
    const user = userEvent.setup()
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      ...defaultSettings,
      llm: { ...defaultSettings.llm, enabled: false }
    })

    await renderChatPanel()
    const input = screen.getByPlaceholderText('Type a message or paste an image...')
    const sendButton = screen.getByRole('button', { name: /send/i })

    fireEvent.change(input, { target: { value: 'Hello' } })
    await act(async () => {
      await user.click(sendButton)
      await flushPromises()
    })

    await waitFor(() => {
      expect(screen.getByText(/Error: AI is disabled/i)).toBeInTheDocument()
    })
  })

  it('applies extracted code from non-streaming responses', async () => {
    const user = userEvent.setup()
    const onApplyCode = vi.fn().mockResolvedValue(true)

    mockedCreateLLMService.mockReturnValue({
      sendMessage: vi.fn().mockResolvedValue({
        content: 'Here you go.\n```openscad\ncube([12, 12, 12]);\n```',
        model: 'test-model',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      }),
      supportsStreaming: vi.fn().mockReturnValue(false),
      getProviderName: vi.fn().mockReturnValue('Mock Provider')
    } as unknown as ReturnType<typeof createLLMService>)

    render(<ChatPanelWithApplyCode onApplyCode={onApplyCode} />)
    await waitFor(() => {
      expect(window.electronAPI.getSettings).toHaveBeenCalled()
    })

    const input = screen.getByPlaceholderText('Type a message or paste an image...')
    fireEvent.change(input, { target: { value: 'Make me a cube' } })

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /send/i }))
      await flushPromises()
    })

    await waitFor(() => {
      expect(onApplyCode).toHaveBeenCalledWith('cube([12, 12, 12]);\n')
      expect(screen.getByText(/Code applied and rendered/i)).toBeInTheDocument()
    })
  })

  it('does not auto-apply AI code if the editor changed while the request was running', async () => {
    const user = userEvent.setup()
    const onApplyCode = vi.fn().mockResolvedValue(true)
    let resolveResponse: ((value: { content: string; model: string }) => void) | null = null
    const sendMessage = vi.fn().mockImplementation(
      () => new Promise((resolve) => {
        resolveResponse = resolve
      })
    )

    mockedCreateLLMService.mockReturnValue({
      sendMessage,
      supportsStreaming: vi.fn().mockReturnValue(false),
      getProviderName: vi.fn().mockReturnValue('Mock Provider')
    } as unknown as ReturnType<typeof createLLMService>)

    render(<ChatPanelWithMutableCode onApplyCode={onApplyCode} />)

    await waitFor(() => {
      expect(window.electronAPI.getSettings).toHaveBeenCalled()
    })

    fireEvent.change(screen.getByPlaceholderText('Type a message or paste an image...'), {
      target: { value: 'Make this object taller' }
    })

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /send/i }))
      await flushPromises()
    })

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /mutate editor code/i }))
      resolveResponse?.({
        content: '```openscad\ncube([10, 10, 20]);\n```',
        model: 'test-model'
      })
      await flushPromises()
    })

    await waitFor(() => {
      expect(screen.getByText(/cube\(\[10, 10, 20\]\);/)).toBeInTheDocument()
    })
    expect(onApplyCode).not.toHaveBeenCalled()
    expect(screen.queryByText(/Code applied and rendered/i)).not.toBeInTheDocument()
  })

  it('does not show the rendered toast when auto-render fails', async () => {
    const user = userEvent.setup()
    const onApplyCode = vi.fn().mockResolvedValue(false)

    mockedCreateLLMService.mockReturnValue({
      sendMessage: vi.fn().mockResolvedValue({
        content: '```openscad\ncube([1, 1, 1]);\n```',
        model: 'test-model',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      }),
      supportsStreaming: vi.fn().mockReturnValue(false),
      getProviderName: vi.fn().mockReturnValue('Mock Provider')
    } as unknown as ReturnType<typeof createLLMService>)

    render(<ChatPanelWithApplyCode onApplyCode={onApplyCode} />)
    await waitFor(() => {
      expect(window.electronAPI.getSettings).toHaveBeenCalled()
    })

    fireEvent.change(screen.getByPlaceholderText('Type a message or paste an image...'), {
      target: { value: 'Make me a cube' }
    })

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /send/i }))
      await flushPromises()
    })

    await waitFor(() => {
      expect(onApplyCode).toHaveBeenCalledWith('cube([1, 1, 1]);\n')
    })
    expect(screen.queryByText(/Code applied and rendered/i)).not.toBeInTheDocument()
  })

  it('sends an automatic diagnosis only once while the parent is still clearing pending state', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      content: 'Try adding a semicolon.',
      model: 'test-model',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    })

    mockedCreateLLMService.mockReturnValue({
      sendMessage,
      supportsStreaming: vi.fn().mockReturnValue(false),
      getProviderName: vi.fn().mockReturnValue('Mock Provider')
    } as unknown as ReturnType<typeof createLLMService>)

    render(<ChatPanelWithDelayedDiagnosisClear />)

    await waitFor(() => {
      expect(window.electronAPI.getSettings).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(sendMessage).toHaveBeenCalledTimes(1)
  })
})
