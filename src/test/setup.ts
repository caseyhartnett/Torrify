import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock the LLM service module (unless using real API for testing)
// Use a factory function that checks the environment variable at runtime
vi.mock('../services/llm', async () => {
  // Check at runtime if we should use real implementation
  if (process.env.LLM_TEST_API_KEY) {
    // Return the actual module (no mock)
    return await vi.importActual('../services/llm')
  }
  
  // Otherwise, return the mock
  return {
    createLLMService: vi.fn(() => ({
      sendMessage: vi.fn().mockResolvedValue({
        content: 'This is a mocked AI response for testing.',
        model: 'test-model',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      }),
      supportsStreaming: vi.fn().mockReturnValue(false),
      getProviderName: vi.fn().mockReturnValue('Mock Provider')
    })),
    requiresApiKey: (provider: string) => !['openrouter', 'ollama', 'custom', 'gateway'].includes(provider),
    PROVIDER_NAMES: {
      gemini: 'Google Gemini',
      openai: 'OpenAI (GPT)',
      anthropic: 'Anthropic (Claude)',
      custom: 'Custom / Local Model',
      openrouter: 'OpenRouter',
      ollama: 'Ollama (Local)',
      gateway: 'PRO'
    },
    DEFAULT_MODELS: {
      gemini: 'gemini-3-flash',
      openai: 'gpt-5.2',
      anthropic: 'claude-3-5-sonnet-20241022',
      custom: '',
      openrouter: 'anthropic/claude-3.7-sonnet:thinking',
      gateway: 'openai/gpt-4o-mini',
      ollama: 'gpt-oss:20b'
    }
  }
})

// Mock the CAD service module
vi.mock('../services/cad', () => ({
  BACKEND_NAMES: {
    openscad: 'OpenSCAD',
    build123d: 'build123d (Python)'
  },
  BACKEND_INFO: {
    openscad: {
      name: 'OpenSCAD',
      description: 'OpenSCAD - The Programmers Solid 3D CAD Modeller',
      fileExtension: 'scad',
      language: 'c',
      defaultCode: '// OpenSCAD code\ncube([10, 10, 10]);'
    },
    build123d: {
      name: 'build123d',
      description: 'build123d - Python CAD library based on Open CASCADE',
      fileExtension: 'py',
      language: 'python',
      defaultCode: '# build123d code\nfrom build123d import *\n\nbox = Box(10, 10, 10)'
    }
  }
}))

// Mock window.electronAPI for tests (only in jsdom environment)
if (typeof global.window !== 'undefined') {
  global.window.electronAPI = {
    renderScad: vi.fn().mockResolvedValue({
    success: true,
    image: 'data:image/png;base64,mockImageData',
    timestamp: Date.now(),
  }),
  renderStl: vi.fn().mockImplementation(async (_code: string) => {
    // In test environment, we can't easily execute real backends without Electron main process
    // The mock returns success, but the validation function will detect this is a mock
    // and mark execution as "skipped" rather than "valid"
    // 
    // Note: For true execution validation, tests should be run in Electron environment
    // where the real electronAPI is available. In that case, this mock won't be used.
    return {
      success: true,
      stlBase64: 'bW9jay1zdGw=',
      timestamp: Date.now(),
    }
  }),
  saveProject: vi.fn().mockResolvedValue({ canceled: false, filePath: 'C:\\temp\\project.torrify' }),
  loadProject: vi.fn().mockResolvedValue({ canceled: true }),
  exportScad: vi.fn().mockImplementation((_code: string, backend?: string) => 
      Promise.resolve({ canceled: false, filePath: backend === 'build123d' ? 'C:\\temp\\model.py' : 'C:\\temp\\model.scad' })
    ),
  exportStl: vi.fn().mockResolvedValue({ canceled: false, filePath: 'C:\\temp\\model.stl' }),
  getTempDir: vi.fn().mockResolvedValue('C:\\temp\\torrify'),
  getSettings: vi.fn().mockResolvedValue({
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
    analytics: {
      enabled: false,
    },
    recentFiles: [],
  }),
  saveSettings: vi.fn().mockResolvedValue({ success: true }),
  checkOpenscadPath: vi.fn().mockResolvedValue(true),
  checkPythonPath: vi.fn().mockResolvedValue({ valid: true, version: 'Python 3.12.0' }),
  validateCadBackend: vi.fn().mockResolvedValue({ valid: true, version: 'OpenSCAD 2024.01' }),
  selectOpenscadPath: vi.fn().mockResolvedValue({ canceled: true }),
  shouldShowWelcome: vi.fn().mockResolvedValue(false),
  resetSettings: vi.fn().mockResolvedValue({ success: true }),
  openScadFile: vi.fn().mockResolvedValue({ canceled: true }),
  saveScadFile: vi.fn().mockResolvedValue({ canceled: true }),
  setWindowTitle: vi.fn().mockResolvedValue(undefined),
  getOpenRouterConfigured: vi.fn().mockResolvedValue(false),
  llmSendMessage: vi.fn().mockResolvedValue({
    success: true,
    response: {
      content: 'Mocked AI response',
      model: 'test-model',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    }
  }),
  llmStreamMessage: vi.fn().mockResolvedValue({ streamId: 'mock-stream-id' }),
  llmStreamAbort: vi.fn().mockResolvedValue(undefined),
  onLlmStreamChunk: vi.fn(),
  getRecentFiles: vi.fn().mockResolvedValue([]),
  clearRecentFiles: vi.fn().mockResolvedValue({ success: true }),
  removeRecentFile: vi.fn().mockResolvedValue({ success: true }),
  openRecentFile: vi.fn().mockResolvedValue({
    canceled: false,
    filePath: 'C:\\temp\\test.scad',
    code: 'cube([10, 10, 10]);',
  }),
  loadDocumentation: vi.fn().mockResolvedValue({ success: true, docs: {} }),
  
  // Context management (Knowledge Base)
  getContext: vi.fn().mockResolvedValue({ 
    success: true, 
    content: '# Mock Context\nTest content', 
    source: 'bundled',
    filename: 'context_openscad.txt'
  }),
  getContextStatus: vi.fn().mockResolvedValue({
    success: true,
    openscad: {
      user: { exists: false, size: 0, modified: null },
      bundled: { exists: true, size: 1024, modified: '2026-01-24T00:00:00.000Z' },
      active: 'bundled'
    },
    build123d: {
      user: { exists: false, size: 0, modified: null },
      bundled: { exists: true, size: 2048, modified: '2026-01-24T00:00:00.000Z' },
      active: 'bundled'
    }
  }),
  updateContextFromCloud: vi.fn().mockResolvedValue({ 
    success: true, 
    message: 'Updated context_openscad.txt',
    size: 4096
  }),
  resetContextToFactory: vi.fn().mockResolvedValue({ 
    success: true, 
    message: 'Reset to factory defaults' 
  }),
  
  // Ollama models
  getOllamaModels: vi.fn().mockResolvedValue({
    success: true,
    models: [
      { name: 'gpt-oss:20b', size: 13793441244, modified: '2026-01-25T12:03:39.1754186-05:00' }
    ]
  }),
  
    onMenuEvent: vi.fn(),
    removeMenuListener: vi.fn(),
  }
}

// Mock scrollIntoView (not implemented in jsdom)
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = vi.fn()
}
