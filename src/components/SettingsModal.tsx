import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { requiresApiKey, DEFAULT_MODELS } from '../services/llm'
import type { CADBackend } from '../services/cad'
import {
  getDefaultRuntimeBackend,
  getRuntimeCapabilities,
  supportsBackend
} from '../platform/capabilities'
import { logger } from '../utils/logger'
import {
  GeneralSettings,
  AISettings,
  KnowledgeSettings,
  useOllamaModels,
  type Settings,
  type SettingsTab
} from './settings'
import { refreshAnalyticsSettings, setAnalyticsEnabled } from '../services/analytics'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  /** When provided, opens with this tab active (e.g. when opening from Configure PRO) */
  initialTab?: SettingsTab
}

const CONTEXT_URLS = {
  openscad: 'https://raw.githubusercontent.com/caseyhartnett/torrify/main/resources/context_openscad.txt',
  build123d: 'https://raw.githubusercontent.com/caseyhartnett/torrify/main/resources/context_build123d.txt'
}

const TAB_ORDER: SettingsTab[] = ['general', 'ai', 'knowledge']

function SettingsModal({ isOpen, onClose, initialTab }: SettingsModalProps) {
  const runtimeCapabilities = getRuntimeCapabilities()
  const managedWebMode = runtimeCapabilities.usesManagedGatewayOnly
  const availableTabs: SettingsTab[] = useMemo(
    () => (runtimeCapabilities.supportsKnowledgeBaseManagement ? TAB_ORDER : ['ai']),
    [runtimeCapabilities]
  )
  const [settings, setSettings] = useState<Settings | null>(null)
  const [pathValid, setPathValid] = useState<boolean | null>(null)
  const [pythonPathValid, setPythonPathValid] = useState<{
    valid: boolean
    version?: string
    error?: string
  } | null>(null)
  const [backendValidation, setBackendValidation] = useState<{
    valid: boolean
    version?: string
    error?: string
  } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>(managedWebMode ? 'ai' : 'general')
  const [openRouterKeySet, setOpenRouterKeySet] = useState<boolean | null>(null)
  const [contextStatus, setContextStatus] = useState<{
    openscad?: { user: { exists: boolean; size: number; modified: string | null }; bundled: { exists: boolean; size: number; modified: string | null }; active: 'user' | 'bundled' }
    build123d?: { user: { exists: boolean; size: number; modified: string | null }; bundled: { exists: boolean; size: number; modified: string | null }; active: 'user' | 'bundled' }
  } | null>(null)
  const [isUpdatingContext, setIsUpdatingContext] = useState<'openscad' | 'build123d' | null>(null)
  const [contextMessage, setContextMessage] = useState<string | null>(null)

  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const isMountedRef = useRef(true)

  const { ollamaModels, isLoadingOllamaModels, ollamaModelsError, loadOllamaModels } = useOllamaModels(
    settings,
    isOpen,
    setSettings
  )

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const resolvePathValid = useCallback(async (path: string): Promise<boolean | null> => {
    if (!path) {
      return null
    }
    try {
      return await window.electronAPI.checkOpenscadPath(path)
    } catch {
      return false
    }
  }, [])

  const resolvePythonPathValid = useCallback(
    async (path: string): Promise<{ valid: boolean; version?: string; error?: string } | null> => {
      if (!path) {
        return null
      }
      try {
        return await window.electronAPI.checkPythonPath(path)
      } catch {
        return { valid: false, error: 'Failed to check Python path' }
      }
    },
    []
  )

  const resolveBackendValidation = useCallback(
    async (backend: CADBackend): Promise<{ valid: boolean; version?: string; error?: string }> => {
      try {
        return await window.electronAPI.validateCadBackend(backend)
      } catch {
        return { valid: false, error: 'Failed to validate backend' }
      }
    },
    []
  )

  const loadSettings = useCallback(async () => {
    try {
      let loadedSettings = await window.electronAPI.getSettings()
      if (managedWebMode) {
        loadedSettings = {
          ...loadedSettings,
          cadBackend: getDefaultRuntimeBackend(runtimeCapabilities),
          analytics: {
            enabled: loadedSettings.analytics?.enabled !== false
          },
          llm: {
            ...loadedSettings.llm,
            provider: 'gateway',
            apiKey: '',
            enabled: loadedSettings.llm.enabled !== false,
            model: loadedSettings.llm.model || DEFAULT_MODELS.gateway
          }
        }
      }
      // Migrate deprecated anthropic provider to gemini (not implemented, no API key)
      if (loadedSettings.llm.provider === 'anthropic') {
        loadedSettings = {
          ...loadedSettings,
          llm: {
            ...loadedSettings.llm,
            provider: 'gemini',
            model: DEFAULT_MODELS.gemini
          }
        }
        await window.electronAPI.saveSettings(loadedSettings)
      }
      if (!supportsBackend(loadedSettings.cadBackend, runtimeCapabilities)) {
        loadedSettings = {
          ...loadedSettings,
          cadBackend: getDefaultRuntimeBackend(runtimeCapabilities)
        }
      }
      const [nextPathValid, nextPythonPathValid, nextBackendValidation] = managedWebMode
        ? [true, null, { valid: true, version: 'OpenSCAD Web Runtime' }]
        : await Promise.all([
            resolvePathValid(loadedSettings.openscadPath),
            resolvePythonPathValid(loadedSettings.build123dPythonPath),
            resolveBackendValidation(loadedSettings.cadBackend)
          ])
      if (!isMountedRef.current) {
        return
      }
      setPathValid(nextPathValid)
      setPythonPathValid(nextPythonPathValid)
      setBackendValidation(nextBackendValidation)
      setSettings(loadedSettings)
    } catch (error) {
      logger.error('Failed to load settings', error)
    }
  }, [managedWebMode, resolveBackendValidation, resolvePathValid, resolvePythonPathValid, runtimeCapabilities])

  const loadContextStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI.getContextStatus()
      if (status.success) {
        setContextStatus({ openscad: status.openscad, build123d: status.build123d })
      }
    } catch (error) {
      logger.error('Failed to load context status', error)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      void loadSettings()
      if (initialTab && availableTabs.includes(initialTab)) {
        setActiveTab(initialTab)
      } else if (!availableTabs.includes(activeTab)) {
        setActiveTab(availableTabs[0])
      }
    }
  }, [activeTab, availableTabs, initialTab, isOpen, loadSettings])

  useEffect(() => {
    if (isOpen && activeTab === 'knowledge') {
      void loadContextStatus()
    }
  }, [activeTab, isOpen, loadContextStatus])

  useEffect(() => {
    if (!isOpen) return
    previousFocusRef.current = document.activeElement as HTMLElement
    const focusTarget = dialogRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const timeoutId = window.setTimeout(() => focusTarget?.focus(), 0)
    return () => {
      window.clearTimeout(timeoutId)
      previousFocusRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !settings) return
    if (settings.llm.provider === 'gateway') {
      setOpenRouterKeySet(!!settings.llm.gatewayLicenseKey?.trim())
      return
    }
    if (settings.llm.provider !== 'openrouter') {
      setOpenRouterKeySet(null)
      return
    }
    let cancelled = false
    window.electronAPI
      .getOpenRouterConfigured()
      .then((configured) => {
        if (!cancelled) setOpenRouterKeySet(configured)
      })
      .catch(() => {
        if (!cancelled) setOpenRouterKeySet(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, settings])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  const checkPath = async (path: string) => {
    const next = await resolvePathValid(path)
    if (isMountedRef.current) {
      setPathValid(next)
    }
  }

  const checkPythonPath = async (path: string) => {
    const next = await resolvePythonPathValid(path)
    if (isMountedRef.current) {
      setPythonPathValid(next)
    }
  }

  const validateBackend = async (backend: CADBackend) => {
    const next = await resolveBackendValidation(backend)
    if (isMountedRef.current) {
      setBackendValidation(next)
    }
  }

  const handlePathChange = (newPath: string) => {
    if (settings) {
      setSettings({ ...settings, openscadPath: newPath })
      checkPath(newPath)
      setSaveMessage(null)
      if (settings.cadBackend === 'openscad') validateBackend('openscad')
    }
  }

  const handlePythonPathChange = (newPath: string) => {
    if (settings) {
      setSettings({ ...settings, build123dPythonPath: newPath })
      checkPythonPath(newPath)
      setSaveMessage(null)
      if (settings.cadBackend === 'build123d') validateBackend('build123d')
    }
  }

  const handleBackendChange = (backend: CADBackend) => {
    if (settings) {
      setSettings({ ...settings, cadBackend: backend })
      validateBackend(backend)
      setSaveMessage(null)
    }
  }

  const handleBrowsePath = async () => {
    try {
      const result = await window.electronAPI.selectOpenscadPath()
      if (!result.canceled && result.filePath) handlePathChange(result.filePath)
    } catch (error) {
      logger.error('Failed to select OpenSCAD path', error)
    }
  }

  const handleLLMChange = (field: keyof Settings['llm'], value: string | number | boolean) => {
    if (settings) {
      setSettings({ ...settings, llm: { ...settings.llm, [field]: value } })
      setSaveMessage(null)
      if (field === 'customEndpoint' && settings.llm.provider === 'ollama') {
        loadOllamaModels(value as string)
      }
    }
  }

  const handleProviderChange = (provider: Settings['llm']['provider']) => {
    if (settings) {
      setSettings({
        ...settings,
        llm: {
          ...settings.llm,
          provider,
          model: DEFAULT_MODELS[provider],
          apiKey: requiresApiKey(provider) ? settings.llm.apiKey : '',
          gatewayLicenseKey: provider === 'gateway' ? (settings.llm.gatewayLicenseKey ?? '') : settings.llm.gatewayLicenseKey
        }
      })
      setSaveMessage(null)
      if (provider === 'ollama') loadOllamaModels(settings.llm.customEndpoint)
    }
  }

  const handleAnalyticsEnabledChange = (enabled: boolean) => {
    if (settings) {
      setSettings({
        ...settings,
        analytics: {
          enabled
        }
      })
      setSaveMessage(null)
    }
  }

  const handleAccessModeChange = (mode: 'byok' | 'pro') => {
    if (!settings) return
    if (managedWebMode) {
      setSettings({
        ...settings,
        llm: {
          ...settings.llm,
          provider: 'gateway',
          model: settings.llm.model || DEFAULT_MODELS.gateway,
          apiKey: ''
        }
      })
      return
    }
    if (mode === 'pro') {
      setSettings({
        ...settings,
        llm: {
          ...settings.llm,
          provider: 'gateway',
          model: DEFAULT_MODELS.gateway,
          apiKey: '',
          gatewayLicenseKey: settings.llm.gatewayLicenseKey ?? ''
        }
      })
    } else if (settings.llm.provider === 'gateway') {
      setSettings({
        ...settings,
        llm: { ...settings.llm, provider: 'gemini', model: DEFAULT_MODELS.gemini }
      })
    }
    setSaveMessage(null)
  }

  const handleUpdateContext = async (backend: 'openscad' | 'build123d') => {
    setIsUpdatingContext(backend)
    setContextMessage(null)
    try {
      const url = CONTEXT_URLS[backend]
      const result = await window.electronAPI.updateContextFromCloud(backend, url)
      if (result.success) {
        setContextMessage(`Updated ${backend} context (${Math.round((result.size || 0) / 1024)}KB)`)
        await loadContextStatus()
      } else {
        setContextMessage(`Error: ${result.error}`)
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      setContextMessage(`Error: ${msg}`)
    } finally {
      setIsUpdatingContext(null)
    }
  }

  const handleResetContext = async (backend?: 'openscad' | 'build123d') => {
    setContextMessage(null)
    try {
      const result = await window.electronAPI.resetContextToFactory(backend)
      if (result.success) {
        setContextMessage(result.message || 'Reset to factory defaults')
        await loadContextStatus()
      } else {
        setContextMessage(`Error: ${result.error}`)
      }
    } catch (error: unknown) {
      const errorText = error instanceof Error ? error.message : 'Unknown error'
      setContextMessage(`Error: ${errorText}`)
    }
  }

  const handleSave = async () => {
    if (!settings) return
    if (settings.llm.enabled) {
      if (settings.llm.provider === 'gateway') {
        if (!runtimeCapabilities.gatewayLicenseKeyOptional && !settings.llm.gatewayLicenseKey?.trim()) {
          setSaveMessage('PRO license key is required')
          return
        }
      } else if (settings.llm.provider === 'openrouter') {
        const configured = await window.electronAPI.getOpenRouterConfigured()
        if (!configured) {
          setSaveMessage('OpenRouter API key is required (set OPENROUTER_API_KEY in environment)')
          return
        }
      } else if (requiresApiKey(settings.llm.provider) && !settings.llm.apiKey?.trim()) {
        setSaveMessage('API key is required when AI is enabled')
        return
      }
    }
    const normalizedSettings = managedWebMode
      ? {
          ...settings,
          cadBackend: getDefaultRuntimeBackend(runtimeCapabilities),
          llm: {
            ...settings.llm,
            provider: 'gateway' as const,
            apiKey: '',
            model: settings.llm.model || DEFAULT_MODELS.gateway
          }
        }
      : settings

    setIsSaving(true)
    setSaveMessage(null)
    try {
      await window.electronAPI.saveSettings(normalizedSettings)
      if (managedWebMode) {
        setAnalyticsEnabled(normalizedSettings.analytics?.enabled !== false)
        await refreshAnalyticsSettings()
      }
      setSaveMessage('Settings saved successfully!')
      closeTimerRef.current = window.setTimeout(() => {
        onClose()
        closeTimerRef.current = null
      }, 1000)
    } catch {
      setSaveMessage('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, tabKey: SettingsTab) => {
    const currentIndex = availableTabs.indexOf(tabKey)
    if (currentIndex === -1) return
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      setActiveTab(availableTabs[(currentIndex + 1) % availableTabs.length])
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setActiveTab(availableTabs[(currentIndex - 1 + availableTabs.length) % availableTabs.length])
    }
  }

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!isOpen || !settings) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={dialogRef}
        className="bg-[#2d2d30] rounded-lg shadow-xl w-[700px] max-h-[80vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="px-6 py-4 border-b border-[#3e3e42]">
          <h2 id="settings-modal-title" className="text-xl font-semibold text-white">
            Settings
          </h2>
        </div>

        <div className="flex border-b border-[#3e3e42]" role="tablist" aria-label="Settings tabs">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(e) => handleTabKeyDown(e, tab)}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === tab ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-300'
              }`}
              role="tab"
              id={`settings-tab-${tab}`}
              aria-controls={`settings-panel-${tab}`}
              aria-selected={activeTab === tab}
              tabIndex={activeTab === tab ? 0 : -1}
            >
              {tab === 'general' ? 'General' : tab === 'ai' ? 'AI Configuration' : 'Knowledge Base'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {activeTab === 'general' && (
            <GeneralSettings
              settings={settings}
              supportsBuild123d={runtimeCapabilities.supportedBackends.includes('build123d')}
              pathValid={pathValid}
              pythonPathValid={pythonPathValid}
              backendValidation={backendValidation}
              onPathChange={handlePathChange}
              onPythonPathChange={handlePythonPathChange}
              onBackendChange={handleBackendChange}
              onBrowsePath={handleBrowsePath}
            />
          )}
          {activeTab === 'ai' && (
            <AISettings
              settings={settings}
              managedGatewayMode={managedWebMode}
              openRouterKeySet={openRouterKeySet}
              ollamaModels={ollamaModels}
              isLoadingOllamaModels={isLoadingOllamaModels}
              ollamaModelsError={ollamaModelsError}
              onLLMChange={handleLLMChange}
              onAnalyticsEnabledChange={handleAnalyticsEnabledChange}
              onProviderChange={handleProviderChange}
              onAccessModeChange={handleAccessModeChange}
              onLoadOllamaModels={loadOllamaModels}
            />
          )}
          {activeTab === 'knowledge' && (
            <KnowledgeSettings
              contextStatus={contextStatus}
              isUpdatingContext={isUpdatingContext}
              contextMessage={contextMessage}
              onUpdateContext={handleUpdateContext}
              onResetContext={handleResetContext}
            />
          )}

          {saveMessage && (
            <div
              className={`p-3 rounded ${
                saveMessage.includes('success') ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
              }`}
            >
              {saveMessage}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#3e3e42] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#3e3e42] hover:bg-[#4e4e52] rounded font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || (!managedWebMode && settings.cadBackend === 'openscad' && pathValid === false)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
