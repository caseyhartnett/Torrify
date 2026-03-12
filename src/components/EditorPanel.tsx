import { lazy, Suspense, useEffect, useState } from 'react'
import { ParameterPanel } from './ParameterPanel'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

/** Supported CAD engine backends */
type CADBackend = 'openscad' | 'build123d'

type EditorTab = 'code' | 'parameters'

/**
 * Props for the EditorPanel component.
 */
interface EditorPanelProps {
  /** The source code to display and edit */
  readonly code: string
  /** Triggered whenever the code content changes */
  readonly onChange: (code: string) => void
  /** Triggered to request a geometry render from the backend */
  readonly onRender: () => void
  /** Optional key to force re-instantiation of the Monaco editor */
  readonly editorKey?: number
  /** The currently active CAD backend influencing syntax highlighting and settings */
  readonly cadBackend?: CADBackend
  /** True when user is authenticated as PRO (gateway + license key) */
  readonly isProAuthenticated?: boolean
  /** Called when user clicks "Configure PRO" in the locked overlay */
  readonly onOpenSettings?: () => void
}

/**
 * Static configuration for backend-specific editor behavior.
 */
const BACKEND_CONFIG: Readonly<Record<CADBackend, { readonly language: string; readonly label: string }>> = {
  openscad: { language: 'c', label: 'OpenSCAD Script' }, // Using 'c' as a proxy for SCAD if no extension exists
  build123d: { language: 'python', label: 'Python (build123d)' }
} as const

/**
 * PRO locked overlay shown when the Parameters tab is selected but user is not authenticated.
 */
function ProLockedOverlay({ onOpenSettings }: { onOpenSettings?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <svg
        className="w-16 h-16 mx-auto mb-4 text-gray-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
      <h3 className="text-lg font-semibold text-gray-300 mb-2">PRO Feature</h3>
      <p className="text-sm text-gray-500 max-w-xs mb-6">
        The Parameter Panel lets you adjust model dimensions and settings with sliders and toggles
        instead of editing code. Available with a PRO subscription.
      </p>
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium transition-colors text-sm"
        >
          Configure PRO
        </button>
      )}
    </div>
  )
}

/**
 * The EditorPanel provides a high-performance code editing interface using Monaco.
 * It handles syntax highlighting, keyboard shortcuts (Ctrl+S for rendering),
 * and backend-specific configurations like tab size.
 * Includes an optional PRO-only Parameter Panel tab for mouse-driven parameter adjustment.
 */
function EditorPanel({
  code,
  onChange,
  onRender,
  editorKey,
  cadBackend = 'openscad',
  isProAuthenticated = false,
  onOpenSettings
}: EditorPanelProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>('code')
  const config = BACKEND_CONFIG[cadBackend]
  const hasCode = code.trim().length > 0

  useEffect(() => {
    /**
     * Globally intercept Ctrl+S to trigger a render instead of a browser save.
     */
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        // Render only if there is content to process
        if (code.trim().length > 0) {
          onRender()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onRender, code])

  const showParametersContent = activeTab === 'parameters'
  const showLockedOverlay = showParametersContent && !isProAuthenticated
  const showParameterPanel = showParametersContent && isProAuthenticated

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header with Tabs */}
      <div className="px-4 py-3 border-b border-[#3e3e42] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('code')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                activeTab === 'code'
                  ? 'bg-[#3e3e42] text-white'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-[#2d2d30]'
              }`}
            >
              Code
            </button>
            <button
              onClick={() => setActiveTab('parameters')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'parameters'
                  ? 'bg-[#3e3e42] text-white'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-[#2d2d30]'
              }`}
            >
              Parameters
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600/80 text-white font-normal">
                PRO
              </span>
            </button>
          </div>
          <p className="text-xs text-gray-500">
            {activeTab === 'code' ? config.label : 'Adjust parameters with sliders and toggles'}
          </p>
        </div>
        <button
          onClick={onRender}
          disabled={!hasCode}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium transition-colors text-sm"
          title={hasCode ? 'Render the code (Ctrl+S)' : 'Add code to render'}
        >
          Render (Ctrl+S)
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0">
        {activeTab === 'code' && (
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                Loading editor...
              </div>
            }
          >
            <MonacoEditor
              key={`${editorKey}-${cadBackend}`}
              height="100%"
              defaultLanguage={config.language}
              language={config.language}
              theme="vs-dark"
              value={code}
              onChange={(value) => onChange(value || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: cadBackend === 'build123d' ? 4 : 2,
                wordWrap: 'on',
              }}
            />
          </Suspense>
        )}
        {showLockedOverlay && <ProLockedOverlay onOpenSettings={onOpenSettings} />}
        {showParameterPanel && (
          <ParameterPanel
            code={code}
            cadBackend={cadBackend}
            onChange={onChange}
            onRender={onRender}
          />
        )}
      </div>
    </div>
  )
}

export default EditorPanel
