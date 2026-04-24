import { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react'
import ChatPanel, { type Message } from './components/ChatPanel'
import EditorPanel from './components/EditorPanel'
import PreviewPanel from './components/PreviewPanel'
import { FileToolbar } from './components/FileToolbar'
import { ProjectToolbar } from './components/ProjectToolbar'
import { BACKEND_NAMES } from './services/cad'
import type { CADBackend } from './services/cad'
import { trackAnalyticsEvent } from './services/analytics'
import { logger } from './utils/logger'
import {
  getDefaultRuntimeBackend,
  getRuntimeCapabilities,
  supportsBackend
} from './platform/capabilities'
import {
  useFileOperations,
  useRecentFiles,
  useMenuHandlers,
  useDemo,
  useProStatus,
  getDefaultMessages
} from './hooks'
import type { Settings, SettingsTab } from './components/settings'

const SettingsModal = lazy(() => import('./components/SettingsModal'))
const WelcomeModal = lazy(() => import('./components/WelcomeModal'))
const DemoDialog = lazy(() => import('./components/DemoDialog'))
const HelpBot = lazy(() => import('./components/HelpBot'))
const ConfirmDialog = lazy(() => import('./components/ConfirmDialog'))

/**
 * State configuration for the application-wide confirmation/alert dialog.
 */
interface DialogState {
  readonly title: string
  readonly message: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly showCancel: boolean
  readonly onConfirm: () => void
  readonly onCancel?: () => void
}

/**
 * Utility to extract a human-readable error message from varied error types.
 * 
 * @param error - The error object or string
 * @returns A formatted string description of the error
 */
function getErrorMsg(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Unknown error'
}

function getRecentFileType(filePath: string): 'torrify' | 'source' {
  const extension = filePath.toLowerCase().split('.').pop()
  return extension === 'torrify' || extension === 'opencursor' || extension === 'json' ? 'torrify' : 'source'
}

/**
 * The root Application component.
 * 
 * Orchestrates the primary layout and state for the CAD IDE, including:
 * - Code editor state and persistence
 * - AI chat history and multi-modal interactions
 * - 3D STL rendering and preview
 * - Project/File lifecycle management
 * - Application-wide settings and modals
 */
function App() {
  const runtimeCapabilities = getRuntimeCapabilities()
  // --- State Definitions ---
  
  /** Current source code in the active editor */
  const [code, setCode] = useState('')
  
  /** Chat message history for the AI assistant */
  const [messages, setMessages] = useState<Message[]>(() => getDefaultMessages('openscad'))
  
  /** Reference for tracking unsaved changes across renders without re-triggering effects */
  const hasUnsavedChangesRef = useRef(false)
  const isMountedRef = useRef(true)
  const welcomeCheckDelayRef = useRef<number | null>(null)
  const suppressBackendResetRef = useRef(false)
  
  /** Base64 preview image (if the backend supports 2D rasterization) */
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  
  /** Base64-encoded STL geometry data for the 3D viewer */
  const [stlBase64, setStlBase64] = useState<string | null>(null)
  
  /** Indicates if a CAD render operation is currently in progress */
  const [isRendering, setIsRendering] = useState(false)
  
  /** Error message from the last failed render attempt */
  const [renderError, setRenderError] = useState<string | null>(null)
  
  /** Visibility of the configuration settings modal */
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  
  /** Visibility of the first-launch onboarding modal */
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false)
  
  /** Used to trigger re-renders when LLM config changes (e.g. from settings modal) */
  const [, setLlmSettings] = useState<Settings['llm'] | null>(null)
  
  /** Active CAD engine context ('openscad' or 'build123d') */
  const [cadBackend, setCadBackend] = useState<CADBackend>(getDefaultRuntimeBackend(runtimeCapabilities))
  
  /** Tracks gateway/openrouter key state for menu/UI; null when not applicable */
  const [, setOpenRouterKeySet] = useState<boolean | null>(null)
  
  /** Key used to force-reset the Monaco editor instance (e.g. on backend switch) */
  const [editorKey, setEditorKey] = useState(0)
  
  /** Monotonic counter used to trigger re-renders in components that depend on settings */
  const [settingsVersion, setSettingsVersion] = useState(0)

  /** When set, Settings modal opens with this tab active (e.g. 'ai' for Configure PRO) */
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | null>(null)

  const { isProAuthenticated } = useProStatus(settingsVersion)
  
  /** Active state for the global confirmation dialog */
  const [dialogState, setDialogState] = useState<DialogState | null>(null)
  
  /** Queue of image data URLs waiting to be sent to the AI */
  const [pendingSnapshots, setPendingSnapshots] = useState<string[]>([])
  
  /** Context for an automatic AI diagnosis of a render error */
  const [pendingDiagnosis, setPendingDiagnosis] = useState<{ readonly error: string; readonly code: string } | null>(null)

  // --- Dialog Helpers ---

  /**
   * Displays a modal confirmation dialog and returns a promise resolving to the user's choice.
   */
  const showConfirm = useCallback(
    (title: string, message: string, options?: { confirmLabel?: string; cancelLabel?: string }) => {
      return new Promise<boolean>((resolve) => {
        setDialogState({
          title,
          message,
          confirmLabel: options?.confirmLabel ?? 'Continue',
          cancelLabel: options?.cancelLabel ?? 'Cancel',
          showCancel: true,
          onConfirm: () => {
            setDialogState(null)
            resolve(true)
          },
          onCancel: () => {
            setDialogState(null)
            resolve(false)
          }
        })
      })
    },
    []
  )

  /**
   * Displays a modal alert dialog.
   */
  const showAlert = useCallback((title: string, message: string, confirmLabel = 'OK') => {
    return new Promise<void>((resolve) => {
      setDialogState({
        title,
        message,
        confirmLabel,
        showCancel: false,
        onConfirm: () => {
          setDialogState(null)
          resolve()
        }
      })
    })
  }, [])

  const recentFilesState = useRecentFiles()
  const {
    recentFiles,
    isRecentMenuOpen,
    setIsRecentMenuOpen,
    recentMenuRef,
    recentMenuButtonRef,
    recentMenuItemsRef,
    loadRecentFiles,
    handleRecentMenuKeyDown,
    handleRecentMenuButtonKeyDown
  } = recentFilesState

  const fileOpsSetters = {
    setCode,
    setMessages,
    setStlBase64,
    setPreviewImage,
    setRenderError,
    setEditorKey
  }
  const confirmUnsavedChanges = useCallback(async () => {
    if (!hasUnsavedChangesRef.current) return true
    return showConfirm(
      'Unsaved changes',
      'You have unsaved changes. Do you want to continue without saving?',
      { confirmLabel: 'Continue', cancelLabel: 'Cancel' }
    )
  }, [showConfirm])

  const fileOpsCallbacks = {
    confirmUnsavedChanges,
    showAlert,
    loadRecentFiles
  }

  const fileOps = useFileOperations(code, cadBackend, fileOpsSetters, fileOpsCallbacks)

  useEffect(() => {
    hasUnsavedChangesRef.current = fileOps.hasUnsavedChanges
  }, [fileOps.hasUnsavedChanges])

  const demoSetters = {
    setMessages,
    setCode,
    setOriginalCode: fileOps.setOriginalCode,
    setHasUnsavedChanges: fileOps.setHasUnsavedChanges,
    setCurrentFilePath: fileOps.setCurrentFilePath,
    setEditorKey,
    setStlBase64,
    setPreviewImage,
    setRenderError,
    setIsRendering
  }
  const demoState = useDemo(demoSetters)
  const { isDemoDialogOpen, setIsDemoDialogOpen, runDemo } = demoState

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (welcomeCheckDelayRef.current !== null) {
        window.clearTimeout(welcomeCheckDelayRef.current)
      }
    }
  }, [])

  const syncWelcomeAndDemoState = useCallback(async () => {
    try {
      const shouldShow = await window.electronAPI.shouldShowWelcome()
      if (!isMountedRef.current) return
      setIsWelcomeOpen(shouldShow)
      if (!shouldShow) {
        await new Promise<void>((resolve) => {
          welcomeCheckDelayRef.current = window.setTimeout(() => {
            welcomeCheckDelayRef.current = null
            resolve()
          }, 500)
        })
        if (!isMountedRef.current) return
        const settings = await window.electronAPI.getSettings()
        if (!isMountedRef.current) return
        if (!settings.hasSeenDemo) setIsDemoDialogOpen(true)
      }
    } catch (error) {
      logger.error('Failed to check welcome status', error)
      if (!isMountedRef.current) return
      setIsWelcomeOpen(true)
    }
  }, [setIsDemoDialogOpen])

  useEffect(() => {
    void syncWelcomeAndDemoState()
  }, [syncWelcomeAndDemoState])

  const refreshSettings = useCallback(async () => {
    try {
      const settings = await window.electronAPI.getSettings()
      setLlmSettings(settings.llm)
      const nextBackend =
        settings.cadBackend && supportsBackend(settings.cadBackend, runtimeCapabilities)
          ? settings.cadBackend
          : getDefaultRuntimeBackend(runtimeCapabilities)
      setCadBackend(nextBackend)
      if (settings.llm.provider === 'gateway') {
        setOpenRouterKeySet(!!settings.llm.gatewayLicenseKey?.trim())
      } else if (settings.llm.provider === 'openrouter') {
        const configured = await window.electronAPI.getOpenRouterConfigured()
        setOpenRouterKeySet(configured)
      } else {
        setOpenRouterKeySet(null)
      }
      setSettingsVersion((v) => v + 1)
    } catch (error) {
      logger.error('Failed to load settings', error)
    }
  }, [runtimeCapabilities])

  useEffect(() => {
    refreshSettings()
  }, [refreshSettings])

  const prevCadBackendRef = useRef<CADBackend>(cadBackend)
  useEffect(() => {
    if (prevCadBackendRef.current !== cadBackend) {
      if (suppressBackendResetRef.current) {
        suppressBackendResetRef.current = false
        prevCadBackendRef.current = cadBackend
        return
      }
      setMessages(fileOps.getDefaultMessages(cadBackend))
      setCode(fileOps.DEFAULT_CODE)
      fileOps.setOriginalCode(fileOps.DEFAULT_CODE)
      fileOps.setCurrentFilePath(null)
      fileOps.setHasUnsavedChanges(false)
      setStlBase64(null)
      setPreviewImage(null)
      setRenderError(null)
      setEditorKey((k) => k + 1)
      setPendingSnapshots([])
      setPendingDiagnosis(null)
      prevCadBackendRef.current = cadBackend
    }
  }, [cadBackend, fileOps])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (recentMenuRef.current && !recentMenuRef.current.contains(event.target as Node)) {
        setIsRecentMenuOpen(false)
      }
    }
    if (isRecentMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isRecentMenuOpen, recentMenuRef, setIsRecentMenuOpen])

  /**
   * Triggers the STL generation process for the current code.
   * Communicates with the main process to execute the CAD engine.
   */
  const renderCode = useCallback(async (sourceCode: string, source: 'editor' | 'chat_apply' = 'editor') => {
    setIsRendering(true)
    setRenderError(null)
    trackAnalyticsEvent('render_requested', {
      source,
      backend: cadBackend,
      codeLength: sourceCode.length
    })
    try {
      const result = await window.electronAPI.renderStl(sourceCode)
      if (result.success && result.stlBase64) {
        setStlBase64(result.stlBase64)
        setPreviewImage(null)
        trackAnalyticsEvent('render_completed', {
          source,
          backend: cadBackend,
          success: true,
          route: result.diagnostics?.route ?? 'unknown',
          durationMs: result.diagnostics?.durationMs ?? null,
          fallbackUsed: result.diagnostics?.fallbackUsed ?? false
        })
        return true
      } else if (!result.success && 'error' in result && result.error) {
        logger.error('Render returned a failure result', {
          backend: cadBackend,
          error: result.error,
          codeLength: sourceCode.length,
          diagnostics: result.diagnostics
        })
        setRenderError(result.diagnostics?.userMessage || result.error)
        trackAnalyticsEvent('render_failed', {
          source,
          backend: cadBackend,
          success: false,
          errorType: result.diagnostics?.failureClass || 'render_result_error',
          route: result.diagnostics?.route ?? 'unknown',
          failureStage: result.diagnostics?.failureStage ?? 'unknown',
          durationMs: result.diagnostics?.durationMs ?? null,
          fallbackAttempted: result.diagnostics?.fallbackAttempted ?? false,
          fallbackUsed: result.diagnostics?.fallbackUsed ?? false
        })
      }
    } catch (error: unknown) {
      logger.error('Render operation failed', error)
      setRenderError(getErrorMsg(error) || 'Failed to render geometry')
      trackAnalyticsEvent('render_failed', {
        source,
        backend: cadBackend,
        success: false,
        errorType: error instanceof Error ? error.name : 'UnknownError'
      })
    } finally {
      setIsRendering(false)
    }
    return false
  }, [cadBackend])

  const handleRender = useCallback(async () => {
    await renderCode(code)
  }, [code, renderCode])

  const handleApplyCodeFromChat = useCallback(
    async (nextCode: string) => {
      fileOps.handleCodeChange(nextCode)
      return renderCode(nextCode, 'chat_apply')
    },
    [fileOps, renderCode]
  )

  const openSettings = useCallback((source: 'toolbar' | 'editor_panel' | 'welcome' | 'menu', tab?: SettingsTab) => {
    if (tab) {
      setSettingsInitialTab(tab)
    }
    trackAnalyticsEvent('settings_opened', {
      source,
      tab: tab ?? 'current'
    })
    setIsSettingsOpen(true)
  }, [])

  const persistBackendSelection = useCallback(async (nextBackend: CADBackend) => {
    try {
      const currentSettings = await window.electronAPI.getSettings()
      await window.electronAPI.saveSettings({
        ...currentSettings,
        cadBackend: nextBackend
      })
    } catch (error) {
      logger.warn('Failed to persist restored project backend', error)
    }
  }, [])

  const applyLoadedProject = useCallback(
    async (project: NonNullable<Awaited<ReturnType<typeof window.electronAPI.loadProject>>['project']>, filePath: string) => {
      const persistedProjectBackend = project.cadBackend ?? project.backend
      const restoredBackend =
        persistedProjectBackend && supportsBackend(persistedProjectBackend, runtimeCapabilities)
          ? persistedProjectBackend
          : getDefaultRuntimeBackend(runtimeCapabilities)

      if (restoredBackend !== cadBackend) {
        suppressBackendResetRef.current = true
        setCadBackend(restoredBackend)
      }

      await persistBackendSelection(restoredBackend)

      setCode(project.code ?? fileOps.DEFAULT_CODE)
      setStlBase64(project.stlBase64 ?? null)
      setPreviewImage(null)
      setRenderError(null)
      setPendingSnapshots([])
      setPendingDiagnosis(null)
      fileOps.setCurrentFilePath(filePath)
      fileOps.setOriginalCode(project.code ?? fileOps.DEFAULT_CODE)
      fileOps.setHasUnsavedChanges(false)
      setEditorKey((prev) => prev + 1)

      if (Array.isArray(project.chat)) {
        setMessages(
          project.chat.map((m) => ({
            ...m,
            timestamp: typeof m.timestamp === 'string' ? new Date(m.timestamp) : m.timestamp
          }))
        )
      } else {
        setMessages(fileOps.getDefaultMessages(restoredBackend))
      }

      return restoredBackend
    },
    [cadBackend, fileOps, persistBackendSelection, runtimeCapabilities]
  )

  /**
   * Updates the native window title bar based on current file and modification status.
   */
  useEffect(() => {
    const updateTitle = async () => {
      let title = 'Torrify'
      if (fileOps.currentFilePath) {
        const fileName = fileOps.currentFilePath.split(/[/\\]/).pop() || 'Untitled'
        title = `${fileOps.hasUnsavedChanges ? '* ' : ''}${fileName} - Torrify`
      } else {
        title = `${fileOps.hasUnsavedChanges ? '* ' : ''}Untitled - Torrify`
      }
      await window.electronAPI.setWindowTitle(title)
    }
    void updateTitle().catch((error) => {
      logger.error('Failed to update window title', error)
    })
  }, [fileOps.currentFilePath, fileOps.hasUnsavedChanges])

  /**
   * Specialized handler for loading a specific file from the history.
   * Supports both raw CAD files and .torrify project bundles.
   */
  const handleOpenRecentFile = useCallback(
    async (filePath: string) => {
      const confirmed = await confirmUnsavedChanges()
      if (!confirmed) return
      try {
        const result = await window.electronAPI.openRecentFile(filePath)
        if (!result.canceled && result.filePath) {
          if (result.isProject && result.project) {
            const project = result.project
            await applyLoadedProject(project, result.filePath)
          } else if (result.code !== undefined) {
            setCode(result.code)
            fileOps.setCurrentFilePath(result.filePath)
            fileOps.setOriginalCode(result.code)
            fileOps.setHasUnsavedChanges(false)
            setMessages(fileOps.getDefaultMessages(cadBackend))
            setStlBase64(null)
            setPreviewImage(null)
            setRenderError(null)
            setEditorKey((prev) => prev + 1)
          }
          setIsRecentMenuOpen(false)
          await loadRecentFiles()
          trackAnalyticsEvent('recent_file_opened', {
            source: 'recent_menu',
            fileType: getRecentFileType(result.filePath)
          })
        } else if (result.error) {
          // Handle cases where a recent file was moved or deleted
          if (result.error.includes('no longer exists')) {
            const remove = await showConfirm(
              'Remove recent file?',
              `File no longer exists:\n${filePath}\n\nRemove from recent files?`,
              { confirmLabel: 'Remove', cancelLabel: 'Keep' }
            )
            if (remove) {
              await window.electronAPI.removeRecentFile(filePath)
              await loadRecentFiles()
            }
          } else {
            await showAlert('Open File Failed', `Failed to open file: ${result.error}`)
          }
        }
      } catch (error: unknown) {
        await showAlert('Open File Failed', `Failed to open file: ${getErrorMsg(error)}`)
      }
    },
    [
      confirmUnsavedChanges,
      loadRecentFiles,
      applyLoadedProject,
      cadBackend,
      showAlert,
      showConfirm,
      fileOps,
      setIsRecentMenuOpen
    ]
  )

  const handleClearRecentFiles = useCallback(async () => {
    const confirmed = await showConfirm('Clear recent files?', 'Clear all recent files?', {
      confirmLabel: 'Clear',
      cancelLabel: 'Cancel'
    })
    if (confirmed) {
      try {
        await window.electronAPI.clearRecentFiles()
        await loadRecentFiles()
        trackAnalyticsEvent('recent_files_cleared', {
          source: 'recent_menu'
        })
      } catch (error) {
        logger.error('Failed to clear recent files', error)
      }
    }
  }, [loadRecentFiles, showConfirm])

  const {
    handleOpenFile,
    handleNewFile,
    handleSaveAs,
    handleSaveFile,
    currentFilePath
  } = fileOps

  const handleNewFileClick = useCallback(async () => {
    trackAnalyticsEvent('new_file_clicked', {
      source: 'file_action'
    })
    await handleNewFile()
  }, [handleNewFile])

  const handleOpenFileClick = useCallback(async () => {
    trackAnalyticsEvent('open_file_clicked', {
      source: 'file_action',
      backend: cadBackend
    })
    await handleOpenFile()
  }, [cadBackend, handleOpenFile])

  const handleSaveFileClick = useCallback(async () => {
    trackAnalyticsEvent('save_file_clicked', {
      source: 'file_action',
      backend: cadBackend
    })
    await handleSaveFile()
  }, [cadBackend, handleSaveFile])

  const handleSaveAsClick = useCallback(async () => {
    trackAnalyticsEvent('save_as_clicked', {
      source: 'file_action',
      backend: cadBackend
    })
    await handleSaveAs()
  }, [cadBackend, handleSaveAs])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault()
        handleOpenFileClick()
      }
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        handleNewFileClick()
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault()
        handleSaveAsClick()
      }
      if (e.ctrlKey && e.key === 's' && !e.shiftKey && currentFilePath) {
        e.preventDefault()
        handleSaveFileClick()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentFilePath, handleNewFileClick, handleOpenFileClick, handleSaveAsClick, handleSaveFileClick])

  /**
   * Persists the current IDE state (code + chat) into a .torrify project file.
   */
  const handleSaveProject = useCallback(async () => {
    trackAnalyticsEvent('save_project_clicked', {
      source: 'toolbar',
      backend: cadBackend
    })
    const project = {
      version: 1,
      savedAt: new Date().toISOString(),
      code,
      stlBase64,
      chat: messages.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() })),
      cadBackend
    }
    try {
      const result = await window.electronAPI.saveProject(project, fileOps.currentFilePath ?? undefined)
      if (!result.canceled && result.filePath) {
        fileOps.setCurrentFilePath(result.filePath)
        fileOps.setHasUnsavedChanges(false)
        fileOps.setOriginalCode(code)
        await loadRecentFiles()
      }
    } catch (error: unknown) {
      logger.error('Project save failed', error)
    }
  }, [cadBackend, code, stlBase64, messages, fileOps, loadRecentFiles])

  /**
   * Restores a .torrify project from disk.
   */
  const handleLoadProject = useCallback(async () => {
    trackAnalyticsEvent('load_project_clicked', {
      source: 'toolbar'
    })
    try {
      const result = await window.electronAPI.loadProject()
      if (!result || result.canceled) {
        if (result?.error) await showAlert('Load Project Failed', `Failed to load project: ${result.error}`)
        return
      }
      if (!result.project) {
        await showAlert('Load Project Failed', 'Invalid project file')
        return
      }
      if (!result.filePath) {
        await showAlert('Load Project Failed', 'Project path missing in load response')
        return
      }
      const project = result.project
      await applyLoadedProject(project, result.filePath)
      await loadRecentFiles()
    } catch (error: unknown) {
      await showAlert('Load Project Failed', `Failed to load project: ${getErrorMsg(error)}`)
    }
  }, [showAlert, applyLoadedProject, loadRecentFiles])

  /**
   * Exports raw source code to a backend-specific file (e.g., .scad or .py).
   */
  const handleExportScad = useCallback(async () => {
    trackAnalyticsEvent('export_source_clicked', {
      source: 'toolbar',
      backend: cadBackend
    })
    try {
      await window.electronAPI.exportScad(code, cadBackend, fileOps.currentFilePath ?? undefined)
    } catch (error: unknown) {
      logger.error('Export source failed', error)
    }
  }, [code, cadBackend, fileOps.currentFilePath])

  /**
   * Exports rendered geometry to a standard STL file.
   */
  const handleExportStl = useCallback(async () => {
    trackAnalyticsEvent('export_stl_clicked', {
      source: 'toolbar'
    })
    try {
      await window.electronAPI.exportStl(stlBase64, fileOps.currentFilePath ?? undefined)
    } catch (error: unknown) {
      logger.error('Export STL failed', error)
    }
  }, [stlBase64, fileOps.currentFilePath])

  const updateLlmSettings = useCallback(async (updater: (llm: Settings['llm']) => Settings['llm']) => {
    const settings = await window.electronAPI.getSettings()
    const updated = { ...settings, llm: updater(settings.llm) }
    await window.electronAPI.saveSettings(updated)
    setLlmSettings(updated.llm)
    if (updated.llm.provider === 'gateway') {
      setOpenRouterKeySet(!!updated.llm.gatewayLicenseKey?.trim())
    } else if (updated.llm.provider === 'openrouter') {
      const configured = await window.electronAPI.getOpenRouterConfigured()
      setOpenRouterKeySet(configured)
    } else {
      setOpenRouterKeySet(null)
    }
  }, [])

  const [isHelpBotOpen, setIsHelpBotOpen] = useState(false)

  useMenuHandlers({
    handleNewFile: handleNewFileClick,
    handleOpenFile: handleOpenFileClick,
    handleSaveFile: handleSaveFileClick,
    handleSaveAs: handleSaveAsClick,
    handleExportScad,
    handleExportStl,
    handleRender,
    updateLlmSettings,
    onOpenSettings: () => openSettings('menu'),
    onOpenHelpBot: () => setIsHelpBotOpen(true),
    onShowDemo: () => setIsDemoDialogOpen(true)
  })

  const handleSendSnapshot = useCallback((dataUrl: string) => {
    setPendingSnapshots((prev) => [...prev, dataUrl])
  }, [])

  const handleDiagnoseError = useCallback(
    (errorMessage: string) => {
      setPendingDiagnosis({ error: errorMessage, code })
    },
    [code]
  )

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-white overflow-hidden">
      <div className="h-12 bg-[#2d2d30] border-b border-[#3e3e42] flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Torrify</h1>
          <span className="text-xs text-gray-400">{BACKEND_NAMES[cadBackend]} IDE</span>
        </div>
        <div className="flex items-center gap-2">
          <FileToolbar
            currentFilePath={fileOps.currentFilePath}
            canOpenRecentFiles={runtimeCapabilities.supportsRecentFileReopen}
            recentFiles={recentFiles}
            isRecentMenuOpen={isRecentMenuOpen}
            setIsRecentMenuOpen={setIsRecentMenuOpen}
            recentMenuRef={recentMenuRef}
            recentMenuButtonRef={recentMenuButtonRef}
            recentMenuItemsRef={recentMenuItemsRef}
            onNewFile={handleNewFileClick}
            onOpenFile={handleOpenFileClick}
            onSaveFile={handleSaveFileClick}
            onSaveAs={handleSaveAsClick}
            onOpenRecentFile={handleOpenRecentFile}
            onClearRecentFiles={handleClearRecentFiles}
            onRecentMenuKeyDown={handleRecentMenuKeyDown}
            onRecentMenuButtonKeyDown={handleRecentMenuButtonKeyDown}
          />
          <ProjectToolbar
            stlBase64={stlBase64}
            onSaveProject={handleSaveProject}
            onLoadProject={handleLoadProject}
            onExportScad={handleExportScad}
            onExportStl={handleExportStl}
            onOpenSettings={() => openSettings('toolbar')}
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[30%] border-r border-[#3e3e42]">
          <ChatPanel
            key={cadBackend}
            currentCode={code}
            pendingSnapshots={pendingSnapshots}
            onSnapshotsSent={() => setPendingSnapshots([])}
            onApplyCode={handleApplyCodeFromChat}
            messages={messages}
            setMessages={setMessages}
            cadBackend={cadBackend}
            pendingDiagnosis={pendingDiagnosis}
            onDiagnosisSent={() => setPendingDiagnosis(null)}
            settingsVersion={settingsVersion}
          />
        </div>
        <div className="w-[40%] border-r border-[#3e3e42]">
          <EditorPanel
            code={code}
            onChange={fileOps.handleCodeChange}
            onRender={handleRender}
            editorKey={editorKey}
            cadBackend={cadBackend}
            isProAuthenticated={isProAuthenticated}
            onOpenSettings={() => openSettings('editor_panel', 'ai')}
          />
        </div>
        <div className="w-[30%]">
          <PreviewPanel
            image={previewImage}
            stlBase64={stlBase64}
            isRendering={isRendering}
            error={renderError}
            onRender={handleRender}
            onSendSnapshot={handleSendSnapshot}
            onDiagnoseError={handleDiagnoseError}
            cadBackend={cadBackend}
            hasCode={code.trim().length > 0}
          />
        </div>
      </div>

      <Suspense fallback={null}>
        <ConfirmDialog
          isOpen={!!dialogState}
          title={dialogState?.title ?? ''}
          message={dialogState?.message ?? ''}
          confirmLabel={dialogState?.confirmLabel}
          cancelLabel={dialogState?.cancelLabel}
          showCancel={dialogState?.showCancel}
          onConfirm={() => dialogState?.onConfirm()}
          onCancel={() => dialogState?.onCancel?.()}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          initialTab={settingsInitialTab ?? undefined}
          onClose={async () => {
            setIsSettingsOpen(false)
            setSettingsInitialTab(null)
            await refreshSettings()
            await syncWelcomeAndDemoState()
          }}
        />

        <WelcomeModal
          isOpen={isWelcomeOpen}
          onClose={() => setIsWelcomeOpen(false)}
          onOpenSettings={() => {
            setIsWelcomeOpen(false)
            openSettings('welcome')
          }}
        />

        <DemoDialog
          isOpen={isDemoDialogOpen}
          onClose={() => setIsDemoDialogOpen(false)}
          onRunDemo={runDemo}
        />

        <HelpBot isOpen={isHelpBotOpen} onClose={() => setIsHelpBotOpen(false)} />
      </Suspense>
    </div>
  )
}

export default App
