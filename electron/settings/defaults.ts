/**
 * Default Settings and Platform Discovery.
 * 
 * Provides sensible initial configurations and performs automatic discovery
 * of local development environments (e.g., Python installations).
 */
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import type { Settings } from './types'

/**
 * Searches the local system for a valid Python executable suitable for build123d.
 * Priorities: 
 * 1. Active pyenv-win shims
 * 2. Specific known versioned installs (3.10 through 3.13)
 * 3. Default system 'python' command
 * 
 * @returns The absolute path to python.exe, or 'python' as a fallback
 */
export function getDefaultPythonPath(): string {
  const pythonPaths: readonly string[] = [
    path.join(os.homedir(), '.pyenv', 'pyenv-win', 'shims', 'python.exe'),
    path.join(os.homedir(), '.pyenv', 'pyenv-win', 'versions', '3.13.11', 'python.exe'),
    path.join(os.homedir(), '.pyenv', 'pyenv-win', 'versions', '3.12.0', 'python.exe'),
    path.join(os.homedir(), '.pyenv', 'pyenv-win', 'versions', '3.11.0', 'python.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'python.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'python.exe'),
    'C:\\Python313\\python.exe',
    'C:\\Python312\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Python310\\python.exe'
  ] as const

  for (const p of pythonPaths) {
    try {
      if (fs.existsSync(p)) {
        return p
      }
    } catch {
      // Quietly ignore inaccessible paths
    }
  }

  return 'python'
}

/**
 * Returns the factory-default settings for a new installation.
 */
export function getDefaultSettings(): Settings {
  return {
    cadBackend: 'openscad',
    openscadPath: 'C:\\Program Files\\OpenSCAD (Nightly)\\openscad.exe',
    build123dPythonPath: getDefaultPythonPath(),
    llm: {
      provider: 'gemini',
      model: 'gemini-3-flash',
      apiKey: '',
      enabled: false,
      temperature: 0.7,
      maxTokens: 128000
    },
    analytics: {
      enabled: false
    },
    recentFiles: []
  }
}
