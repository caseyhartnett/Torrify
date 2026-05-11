import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import { registerSettingsHandlers } from '../ipc/settings-handlers'
import type { Settings } from '../settings/types'

const { handlers, mockGetCurrentSettings, mockSetCurrentSettings, mockSaveSettings, mockLoadSettings, mockFetch } =
  vi.hoisted(() => ({
    handlers: {} as Record<string, (...args: unknown[]) => unknown>,
    mockGetCurrentSettings: vi.fn(),
    mockSetCurrentSettings: vi.fn(),
    mockSaveSettings: vi.fn(),
    mockLoadSettings: vi.fn(),
    mockFetch: vi.fn()
  }))

const defaultSettings: Settings = {
  cadBackend: 'openscad',
  openscadPath: 'C:\\Program Files\\OpenSCAD\\openscad.exe',
  build123dPythonPath: 'python',
  llm: {
    provider: 'gemini',
    model: 'gemini-3-flash',
    apiKey: '',
    enabled: false,
    temperature: 0.7,
    maxTokens: 2048
  },
  recentFiles: []
}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers[channel] = fn
    })
  },
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] })
  },
  app: {
    getPath: vi.fn((name: string) => (name === 'home' ? '/home/user' : '/tmp'))
  }
}))

vi.mock('fs')
vi.mock('../settings', () => ({
  getCurrentSettings: () => mockGetCurrentSettings(),
  setCurrentSettings: (s: Settings) => mockSetCurrentSettings(s),
  saveSettings: (s: Settings) => mockSaveSettings(s),
  loadSettings: () => mockLoadSettings()
}))
vi.mock('../cad', () => ({
  createCADService: vi.fn().mockReturnValue({
    validateSetup: vi.fn().mockResolvedValue({ valid: true, version: 'OpenSCAD 2024' })
  })
}))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), debug: vi.fn() } }))

beforeEach(() => {
  mockGetCurrentSettings.mockReturnValue(defaultSettings)
  mockLoadSettings.mockReturnValue(defaultSettings)
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ models: [] })
  })
  vi.stubGlobal('fetch', mockFetch)
  delete process.env.TORRIFY_ALLOW_REMOTE_OLLAMA
  vi.mocked(fs.existsSync).mockReturnValue(true)
  vi.mocked(fs.unlinkSync).mockImplementation(() => {})
  registerSettingsHandlers()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('settings-handlers', () => {
  describe('get-settings', () => {
    it('returns current settings', () => {
      const result = (handlers['get-settings'] as (...a: unknown[]) => unknown)(null)
      expect(result).toEqual(defaultSettings)
      expect(mockGetCurrentSettings).toHaveBeenCalled()
    })
  })

  describe('save-settings', () => {
    it('returns success when settings are valid', () => {
      const result = (handlers['save-settings'] as (...a: unknown[]) => unknown)(
        null,
        defaultSettings
      )
      expect(result).toEqual({ success: true })
      expect(mockSetCurrentSettings).toHaveBeenCalledWith(defaultSettings)
      expect(mockSaveSettings).toHaveBeenCalledWith(defaultSettings)
    })

    it('returns error for invalid settings format', () => {
      const result = (handlers['save-settings'] as (...a: unknown[]) => unknown)(null, { bad: true })
      expect(result).toEqual({ success: false, error: 'Invalid settings format' })
    })
  })

  describe('check-openscad-path', () => {
    it('returns true when path exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      registerSettingsHandlers()
      const result = (handlers['check-openscad-path'] as (...a: unknown[]) => unknown)(
        null,
        'C:\\OpenSCAD\\openscad.exe'
      )
      expect(result).toBe(true)
    })

    it('returns false when path does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      registerSettingsHandlers()
      const result = (handlers['check-openscad-path'] as (...a: unknown[]) => unknown)(
        null,
        'C:\\Missing\\openscad.exe'
      )
      expect(result).toBe(false)
    })

    it('returns false for invalid path input', () => {
      const result = (handlers['check-openscad-path'] as (...a: unknown[]) => unknown)(
        null,
        123
      )
      expect(result).toBe(false)
    })
  })

  describe('reset-settings', () => {
    it('removes settings file and reloads', () => {
      mockLoadSettings.mockReturnValue(defaultSettings)
      const result = (handlers['reset-settings'] as (...a: unknown[]) => unknown)(null)
      expect(result).toEqual({ success: true })
      expect(mockLoadSettings).toHaveBeenCalled()
    })
  })

  describe('should-show-welcome', () => {
    it('returns boolean', () => {
      mockGetCurrentSettings.mockReturnValue(defaultSettings)
      vi.mocked(fs.existsSync).mockReturnValue(false)
      registerSettingsHandlers()
      const result = (handlers['should-show-welcome'] as (...a: unknown[]) => unknown)(null)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('get-ollama-models', () => {
    it('rejects remote endpoints by default', async () => {
      const result = await (handlers['get-ollama-models'] as (...a: unknown[]) => Promise<unknown>)(
        null,
        'https://example.com:11434'
      )
      expect(result).toEqual({
        success: false,
        models: [],
        error: 'Remote Ollama endpoints are blocked by default. Set TORRIFY_ALLOW_REMOTE_OLLAMA=1 to allow.'
      })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('allows remote endpoints when explicitly enabled', async () => {
      process.env.TORRIFY_ALLOW_REMOTE_OLLAMA = '1'
      registerSettingsHandlers()

      await (handlers['get-ollama-models'] as (...a: unknown[]) => Promise<unknown>)(
        null,
        'https://example.com:11434'
      )

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com:11434/api/tags',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    })
  })

  describe('get-custom-models', () => {
    it('fetches model list from custom endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'model-a' }, { id: 'model-b' }]
        })
      })

      const result = await (handlers['get-custom-models'] as (...a: unknown[]) => Promise<unknown>)(
        null,
        'http://127.0.0.1:1234/v1'
      )

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:1234/v1/models',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
      expect(result).toEqual({
        success: true,
        models: [
          { id: 'model-a', name: 'model-a' },
          { id: 'model-b', name: 'model-b' }
        ]
      })
    })
  })

  describe('check-custom-connection', () => {
    it('returns success when /models is reachable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      })

      const result = await (handlers['check-custom-connection'] as (...a: unknown[]) => Promise<unknown>)(
        null,
        'http://127.0.0.1:1234/v1'
      )

      expect(result).toEqual({
        success: true,
        message: 'Connected successfully',
        endpoint: 'http://127.0.0.1:1234/v1',
        supportsResponses: false
      })
    })
  })
})
