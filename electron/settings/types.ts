/**
 * Application Settings Types (Main Process).
 * 
 * Defines the structure for persistent user preferences and application state.
 */
import type { CADBackend } from '../cad'

/** Makes all properties of T writable (removes readonly). */
export type Writable<T> = { -readonly [K in keyof T]: T[K] }

/**
 * Configuration for an LLM provider connection.
 */
export interface LLMConfig {
  /** The AI vendor to use */
  readonly provider: 'gemini' | 'openai' | 'anthropic' | 'custom' | 'openrouter' | 'ollama' | 'gateway'
  /** Specific model name (e.g., 'gpt-4o') */
  readonly model: string
  /** Private API key for direct vendor access */
  readonly apiKey: string
  /** Toggle for enabling/disabling all AI functionality */
  readonly enabled: boolean
  /** Alternative base URL for the API (local or proxy) */
  readonly customEndpoint?: string
  /** Creativity control (0.0 to 1.0) */
  readonly temperature?: number
  /** Limit on generated token length */
  readonly maxTokens?: number
  /** Custom base URL for the Torrify PRO gateway */
  readonly gatewayBaseUrl?: string
  /** License key for managed PRO tier access */
  readonly gatewayLicenseKey?: string
}

/**
 * Metadata for a recently accessed project or source file.
 */
export interface RecentFile {
  /** Absolute system path to the file */
  readonly filePath: string
  /** ISO timestamp of the last access */
  readonly lastOpened: string
}

export interface AnalyticsSettings {
  /** Allows users to opt out of anonymous product analytics */
  readonly enabled: boolean
}

/**
 * Global application settings state.
 */
export interface Settings {
  /** The currently selected CAD engine */
  readonly cadBackend: CADBackend
  /** Path to the OpenSCAD command-line executable */
  readonly openscadPath: string
  /** Path to the Python interpreter for build123d */
  readonly build123dPythonPath: string
  /** AI Assistant configuration */
  readonly llm: LLMConfig
  /** Web analytics preferences (desktop currently uses a no-op implementation) */
  readonly analytics?: AnalyticsSettings
  /** History of recently opened files */
  readonly recentFiles: readonly RecentFile[]
  /** Track if the user has completed the onboarding demo */
  readonly hasSeenDemo?: boolean
}
