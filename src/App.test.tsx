import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { createLLMService } from './services/llm'

describe('App', () => {
  const mockedCreateLLMService = vi.mocked(createLLMService)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderApp = async () => {
    render(<App />)
    await waitFor(() => {
      expect(window.electronAPI.getSettings).toHaveBeenCalled()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it('renders all three panels', async () => {
    await renderApp()
    
    // Check for Chat Panel
    expect(screen.getByText('AI Assistant')).toBeInTheDocument()
    
    // Check for Editor Panel (Code tab)
    expect(screen.getByText('Code')).toBeInTheDocument()
    
    // Check for Preview Panel
    expect(screen.getByText('Render Preview')).toBeInTheDocument()
  })

  it('displays the correct initial state', async () => {
    await renderApp()
    
    // Check for initial preview message
    expect(screen.getByText('No model preview generated')).toBeInTheDocument()
    
    // Check for render button
    expect(screen.getByRole('button', { name: /render/i })).toBeInTheDocument()
  })

  it('auto-renders code applied from the AI assistant', async () => {
    const user = userEvent.setup()

    mockedCreateLLMService.mockReturnValue({
      sendMessage: vi.fn().mockResolvedValue({
        content: '```openscad\ncube([20, 20, 20]);\n```',
        model: 'test-model',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      }),
      supportsStreaming: vi.fn().mockReturnValue(false),
      getProviderName: vi.fn().mockReturnValue('Mock Provider')
    } as unknown as ReturnType<typeof createLLMService>)

    await renderApp()

    fireEvent.change(screen.getByPlaceholderText('Type a message...'), {
      target: { value: 'Make me a cube' }
    })

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /send message/i }))
    })

    await waitFor(() => {
      expect(window.electronAPI.renderStl).toHaveBeenCalledWith('cube([20, 20, 20]);\n')
      expect(screen.getByText(/Code applied and rendered/i)).toBeInTheDocument()
    })
  })

  it('preserves loaded project state when restoring a project with a different backend', async () => {
    const user = userEvent.setup()
    vi.mocked(window.electronAPI.getSettings).mockResolvedValue({
      cadBackend: 'build123d',
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
    })
    vi.mocked(window.electronAPI.loadProject).mockResolvedValue({
      canceled: false,
      filePath: 'C:\\temp\\cross-backend.torrify',
      project: {
        code: 'cube([5, 5, 5]);',
        cadBackend: 'openscad',
        stlBase64: null,
        chat: [
          {
            id: 1,
            text: 'Loaded project chat',
            sender: 'bot',
            timestamp: new Date().toISOString()
          }
        ]
      }
    })

    await renderApp()

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /load project/i }))
    })

    await waitFor(() => {
      expect(screen.getByText('OpenSCAD IDE')).toBeInTheDocument()
      expect(screen.getByText('Loaded project chat')).toBeInTheDocument()
      expect(window.electronAPI.setWindowTitle).toHaveBeenCalledWith('cross-backend.torrify - Torrify')
    })
  })

  it('restores the saved backend when reopening a recent project', async () => {
    const user = userEvent.setup()
    vi.mocked(window.electronAPI.getRecentFiles).mockResolvedValue([
      { filePath: 'C:\\temp\\recent-project.torrify', lastOpened: '2026-03-06T12:00:00.000Z' }
    ])
    vi.mocked(window.electronAPI.openRecentFile).mockResolvedValue({
      canceled: false,
      filePath: 'C:\\temp\\recent-project.torrify',
      isProject: true,
      project: {
        code: 'from build123d import *',
        cadBackend: 'build123d',
        stlBase64: null,
        chat: [
          {
            id: 1,
            text: 'Recent project chat',
            sender: 'bot',
            timestamp: new Date().toISOString()
          }
        ]
      }
    })

    await renderApp()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /recent files/i })).toBeEnabled()
    })

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /recent files/i }))
    })

    await act(async () => {
      await user.click(await screen.findByRole('menuitem', { name: /recent-project\.torrify/i }))
    })

    await waitFor(() => {
      expect(screen.getByText('build123d (Python) IDE')).toBeInTheDocument()
      expect(screen.getByText('Recent project chat')).toBeInTheDocument()
      expect(window.electronAPI.setWindowTitle).toHaveBeenCalledWith('recent-project.torrify - Torrify')
    })
  })

  it('restores a legacy project backend when only the old backend field is present', async () => {
    const user = userEvent.setup()
    vi.mocked(window.electronAPI.loadProject).mockResolvedValue({
      canceled: false,
      filePath: 'C:\\temp\\legacy-build123d.torrify',
      project: {
        code: 'from build123d import *',
        backend: 'build123d',
        stlBase64: null,
        chat: [
          {
            id: 1,
            text: 'Legacy project chat',
            sender: 'bot',
            timestamp: new Date().toISOString()
          }
        ]
      }
    })

    await renderApp()

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /load project/i }))
    })

    await waitFor(() => {
      expect(screen.getByText('build123d (Python) IDE')).toBeInTheDocument()
      expect(screen.getByText('Legacy project chat')).toBeInTheDocument()
      expect(window.electronAPI.setWindowTitle).toHaveBeenCalledWith('legacy-build123d.torrify - Torrify')
    })
  })
})
