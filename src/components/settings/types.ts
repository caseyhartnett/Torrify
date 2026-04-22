/**
 * Application Settings Types (Renderer Process).
 */
import type { CADBackend } from '../../services/cad'

/**
 * Configuration for an LLM provider.
 */
export interface LLMConfig {
  readonly provider: 'gemini' | 'openai' | 'anthropic' | 'custom' | 'openrouter' | 'ollama' | 'gateway'
  readonly model: string
  readonly apiKey: string
  readonly enabled: boolean
  readonly customEndpoint?: string
  readonly temperature?: number
  readonly maxTokens?: number
  readonly gatewayBaseUrl?: string
  readonly gatewayLicenseKey?: string
}

/**
 * Entry in the file history.
 */
export interface RecentFile {
  readonly filePath: string
  readonly lastOpened: string
}

export interface AnalyticsSettings {
  readonly enabled: boolean
}

/**
 * Global application configuration.
 * Note: recentFiles is mutable in the type so it is assignable to window.electronAPI.saveSettings (vite-env.d.ts).
 */
export interface Settings {
  readonly cadBackend: CADBackend
  readonly openscadPath: string
  readonly build123dPythonPath: string
  readonly llm: LLMConfig
  readonly analytics?: AnalyticsSettings
  readonly recentFiles?: RecentFile[]
  readonly hasSeenDemo?: boolean
}

/**
 * Navigation tabs in the Settings Modal.
 */
export type SettingsTab = 'general' | 'ai' | 'knowledge'

/**
 * Detailed file-level status for knowledge base components.
 */
export interface ContextStatusInfo {
  /** User-provided overrides */
  readonly user: { 
    readonly exists: boolean
    readonly size: number
    readonly modified: string | null 
  }
  /** Bundled reference documentation */
  readonly bundled: { 
    readonly exists: boolean
    readonly size: number
    readonly modified: string | null 
  }
  /** Indicates which version is currently being served to the LLM */
  readonly active: 'user' | 'bundled'
}

/**
 * Synchronization status for the entire Knowledge Base.
 */
export interface ContextStatus {
  readonly openscad?: ContextStatusInfo
  readonly build123d?: ContextStatusInfo
}
