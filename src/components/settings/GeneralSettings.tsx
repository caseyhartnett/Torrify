import { BACKEND_NAMES } from '../../services/cad'
import type { CADBackend } from '../../services/cad'
import type { Settings } from './types'

interface GeneralSettingsProps {
  settings: Settings
  supportsBuild123d: boolean
  pathValid: boolean | null
  pythonPathValid: { valid: boolean; version?: string; error?: string } | null
  backendValidation: { valid: boolean; version?: string; error?: string } | null
  onPathChange: (newPath: string) => void
  onPythonPathChange: (newPath: string) => void
  onBackendChange: (backend: CADBackend) => void
  onBrowsePath: () => void
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function GeneralSettings({
  settings,
  supportsBuild123d,
  pathValid,
  pythonPathValid,
  backendValidation,
  onPathChange,
  onPythonPathChange,
  onBackendChange,
  onBrowsePath
}: GeneralSettingsProps) {
  return (
    <div
      className="space-y-6"
      role="tabpanel"
      id="settings-panel-general"
      aria-labelledby="settings-tab-general"
    >
      {/* CAD Backend Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">CAD Backend</label>
        <select
          value={settings.cadBackend}
          onChange={(e) => onBackendChange(e.target.value as CADBackend)}
          className="w-full bg-[#1e1e1e] text-white px-3 py-2 rounded border border-[#3e3e42] focus:outline-none focus:border-blue-500"
        >
          {Object.entries(BACKEND_NAMES)
            .filter(([key]) => key !== 'build123d' || supportsBuild123d)
            .map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          {settings.cadBackend === 'openscad'
            ? 'OpenSCAD uses its own declarative modeling language (.scad files)'
            : 'build123d is a Python-based CAD library (requires Python + pip install build123d)'}
        </p>
        {!supportsBuild123d && (
          <p className="text-xs text-yellow-400 mt-2">
            build123d is currently available only in the desktop app.
          </p>
        )}

        {backendValidation && (
          <div className="mt-2">
            {backendValidation.valid ? (
              <p className="text-sm text-green-400 flex items-center gap-2">
                <CheckIcon />
                {backendValidation.version || 'Backend ready'}
              </p>
            ) : (
              <p className="text-sm text-yellow-400 flex items-center gap-2">
                <WarningIcon />
                {backendValidation.error || 'Backend not configured'}
              </p>
            )}
          </div>
        )}
      </div>

      {settings.cadBackend === 'openscad' && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            OpenSCAD Executable Path
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={settings.openscadPath}
              onChange={(e) => onPathChange(e.target.value)}
              className="flex-1 bg-[#1e1e1e] text-white px-3 py-2 rounded border border-[#3e3e42] focus:outline-none focus:border-blue-500"
              placeholder="C:\Program Files\OpenSCAD\openscad.exe"
            />
            <button
              onClick={onBrowsePath}
              className="px-4 py-2 bg-[#3e3e42] hover:bg-[#4e4e52] rounded font-medium transition-colors whitespace-nowrap"
              title="Browse for OpenSCAD executable"
            >
              Browse...
            </button>
          </div>

          <div className="mt-2">
            {pathValid === true && (
              <p className="text-sm text-green-400 flex items-center gap-2">
                <CheckIcon />
                OpenSCAD executable found
              </p>
            )}
            {pathValid === false && (
              <p className="text-sm text-red-400 flex items-center gap-2">
                <ErrorIcon />
                Executable not found at this path
              </p>
            )}
          </div>

          <p className="text-xs text-gray-500 mt-2">
            Common paths:
            <br />
            • Standard: C:\Program Files\OpenSCAD\openscad.exe
            <br />
            • Nightly: C:\Program Files\OpenSCAD (Nightly)\openscad.exe
            <br />• Click &quot;Browse...&quot; to select the executable file
          </p>
        </div>
      )}

      {settings.cadBackend === 'build123d' && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Python Interpreter Path
          </label>
          <input
            type="text"
            value={settings.build123dPythonPath}
            onChange={(e) => onPythonPathChange(e.target.value)}
            className="w-full bg-[#1e1e1e] text-white px-3 py-2 rounded border border-[#3e3e42] focus:outline-none focus:border-blue-500"
            placeholder="python"
          />

          <div className="mt-2">
            {pythonPathValid?.valid === true && (
              <p className="text-sm text-green-400 flex items-center gap-2">
                <CheckIcon />
                {pythonPathValid.version || 'Python found'}
              </p>
            )}
            {pythonPathValid?.valid === false && (
              <p className="text-sm text-red-400 flex items-center gap-2">
                <ErrorIcon />
                {pythonPathValid.error || 'Python not found'}
              </p>
            )}
          </div>

          <p className="text-xs text-gray-500 mt-2">
            Common values:
            <br />
            • Default: python (uses system PATH)
            <br />
            • Windows: C:\Python312\python.exe
            <br />
            • macOS/Linux: python3 or /usr/bin/python3
          </p>

          <div className="mt-3 p-3 bg-[#1e1e1e] rounded border border-[#3e3e42]">
            <p className="text-xs text-gray-400">
              <strong>Installation:</strong> Install build123d with:
              <br />
              <code className="text-blue-400">pip install build123d</code>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
