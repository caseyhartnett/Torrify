import { lazy, Suspense, useRef } from 'react'
import type { StlViewerHandle } from './StlViewer'
import type { CADBackend } from '../services/cad'
import { BACKEND_NAMES } from '../services/cad'

const StlViewer = lazy(() => import('./StlViewer'))

/**
 * Props for the PreviewPanel component.
 */
interface PreviewPanelProps {
  /** Optional 2D rasterized preview image (e.g. from OpenSCAD) */
  readonly image: string | null
  /** Base64-encoded STL geometry data for the 3D viewer */
  readonly stlBase64: string | null
  /** Indicates if a background render operation is in progress */
  readonly isRendering: boolean
  /** Human-readable error message from the CAD backend */
  readonly error: string | null
  /** Triggered to request a fresh render of the current code */
  readonly onRender: () => void
  /** Callback to send a captured screenshot of the 3D model to the AI assistant */
  readonly onSendSnapshot: (dataUrl: string) => void
  /** Optional callback to trigger an AI diagnostic of a render error */
  readonly onDiagnoseError?: (error: string) => void
  /** The currently active CAD backend */
  readonly cadBackend?: CADBackend
  /** Indicates if there is any code content to render */
  readonly hasCode?: boolean
}

/**
 * The PreviewPanel orchestrates the 3D visualization and error feedback for CAD output.
 * It provides the interface for:
 * - Viewing 3D STL geometry via Three.js (StlViewer)
 * - Displaying error states and providing AI diagnosis triggers
 * - Capturing snapshots of the current view to share with the AI
 */
function PreviewPanel({ 
  image, 
  stlBase64, 
  isRendering, 
  error, 
  onRender, 
  onSendSnapshot, 
  onDiagnoseError, 
  cadBackend = 'openscad', 
  hasCode = true 
}: PreviewPanelProps) {
  const viewerRef = useRef<StlViewerHandle | null>(null)

  const getErrorFooter = (message: string): string => {
    const normalized = message.toLowerCase()
    if (normalized.includes('syntax') || normalized.includes('parser')) {
      return 'OpenSCAD reported a syntax issue. Ask AI to diagnose the code structure and parser error.'
    }
    if (normalized.includes('thread')) {
      return 'Threaded geometry is expensive in browser rendering. Try a simplified preview or switch to server render.'
    }
    if (normalized.includes('knurl')) {
      return 'Knurled geometry often overwhelms browser rendering. A coarse preview or server render is usually more reliable.'
    }
    if (normalized.includes('minkowski')) {
      return 'minkowski() can multiply facet count quickly. Consider a simpler preview shape or server render.'
    }
    if (normalized.includes('hull()') || normalized.includes('hull')) {
      return 'Repeated hull() geometry can become too expensive for browser rendering. Reduce loop steps or render on the server.'
    }
    if (normalized.includes('assembly')) {
      return 'Large assemblies render more reliably when you hide repeated fasteners or isolate a smaller subassembly first.'
    }
    if (normalized.includes('timed out')) {
      return 'The browser render budget was exceeded. Reduce geometry detail or use the fallback render path.'
    }
    return 'This render failed because the model or render path needs attention. Ask AI to diagnose the geometry and rendering strategy.'
  }

  /**
   * Captures a high-resolution screenshot from the active 3D viewport
   * and sends it to the chat system.
   */
  const handleSendSnapshot = () => {
    const dataUrl = viewerRef.current?.captureImage()
    if (dataUrl) {
      onSendSnapshot(dataUrl)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-[#3e3e42] flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Render Preview</h2>
          <p className="text-xs text-gray-400">{BACKEND_NAMES[cadBackend]} Output</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRender}
            disabled={isRendering || !hasCode}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium transition-colors text-sm"
            title={hasCode ? 'Re-render the code' : 'Add code to render'}
          >
            {isRendering ? 'Rendering...' : 'Refresh'}
          </button>
          <button
            onClick={handleSendSnapshot}
            disabled={!stlBase64 || isRendering}
            className="px-3 py-2 bg-[#3e3e42] hover:bg-[#4e4e52] disabled:bg-[#2d2d30] disabled:cursor-not-allowed rounded text-sm"
            title="Send screenshot of the current 3D model to AI"
          >
            Send to AI
          </button>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 overflow-auto bg-[#252526] flex items-center justify-center p-4">
        {/* Loading Overlay */}
        {isRendering && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Rendering geometry...</p>
          </div>
        )}

        {/* Error Feedback State */}
        {!isRendering && error && (
          <div className="text-center max-w-md">
            <div className="text-red-500 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2 text-red-400">Render Error</h3>
            <p className="text-sm text-gray-400 break-words max-h-48 overflow-y-auto font-mono">{error}</p>
            
            {onDiagnoseError && (
              <button
                onClick={() => onDiagnoseError(error)}
                className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded font-medium transition-colors text-sm inline-flex items-center gap-2 shadow-lg"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Ask AI to Diagnose
              </button>
            )}
            
            <p className="text-xs text-gray-500 mt-4">
              {getErrorFooter(error)}
            </p>
          </div>
        )}

        {/* Empty State */}
        {!isRendering && !error && !image && !stlBase64 && (
          <div className="text-center text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p>No model preview generated</p>
            <p className="text-sm mt-2">Click "Render" or press Ctrl+S to generate the 3D view</p>
          </div>
        )}

        {/* 3D STL Viewer (Preferred) */}
        {!isRendering && !error && stlBase64 && (
          <div className="w-full h-full shadow-inner">
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                  Loading 3D viewer...
                </div>
              }
            >
              <StlViewer ref={viewerRef} stlBase64={stlBase64} />
            </Suspense>
          </div>
        )}

        {/* 2D Image Fallback (e.g. for legacy OpenSCAD modes) */}
        {!isRendering && !error && !stlBase64 && image && (
          <img
            src={image}
            alt={`${BACKEND_NAMES[cadBackend]} Rendered Output`}
            className="max-w-full max-h-full object-contain rounded shadow-lg"
          />
        )}
      </div>
    </div>
  )
}

export default PreviewPanel
