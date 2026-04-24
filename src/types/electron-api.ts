export type CADBackend = 'openscad' | 'build123d'

export interface LLMConfig {
  provider: 'gemini' | 'openai' | 'anthropic' | 'custom' | 'openrouter' | 'ollama' | 'gateway'
  model: string
  apiKey: string
  enabled: boolean
  customEndpoint?: string
  temperature?: number
  maxTokens?: number
  gatewayBaseUrl?: string
  gatewayLicenseKey?: string
}

export interface RecentFile {
  filePath: string
  lastOpened: string
}

export interface AnalyticsSettings {
  enabled: boolean
}

export interface ProjectMessage {
  id: number
  text: string
  sender: 'user' | 'bot'
  timestamp: string
  error?: boolean
  imageDataUrls?: string[]
}

export interface LoadedProject {
  version?: number
  code?: string
  chat?: ProjectMessage[]
  stlBase64?: string | null
  cadBackend?: CADBackend
  backend?: CADBackend
}

export interface ProjectFile {
  version: number
  code: string
  stlBase64: string | null
  chat: ProjectMessage[]
  cadBackend?: CADBackend
}

export interface OpenRecentFileResult {
  canceled: boolean
  filePath?: string
  code?: string
  project?: LoadedProject
  isProject?: boolean
  error?: string
}

export interface Settings {
  cadBackend: CADBackend
  openscadPath: string
  build123dPythonPath: string
  llm: LLMConfig
  analytics?: AnalyticsSettings
  recentFiles?: RecentFile[]
  hasSeenDemo?: boolean
}

export interface CADValidationResult {
  valid: boolean
  error?: string
  version?: string
}

export type RenderRoute = 'wasm' | 'api'

export type RenderFailureClass =
  | 'syntax'
  | 'timeout'
  | 'complexity'
  | 'memory'
  | 'worker_runtime'
  | 'network'
  | 'configuration'
  | 'empty_input'
  | 'unknown'

export interface RenderPreflightSummary {
  riskScore: number
  riskLevel: 'low' | 'medium' | 'high'
  recommendedRoute: RenderRoute
  reasonCodes: string[]
  codeLength: number
  lineCount: number
  moduleCount: number
  loopCount: number
  booleanCount: number
  booleanDepthEstimate: number
  minkowskiCount: number
  hullCount: number
  hullInLoopCount: number
  threadSignalCount: number
  knurlSignalCount: number
  highFnCount: number
  maxFnLiteral: number | null
  maxLiteralLoopSpan: number
  literalLoopProduct: number
  transformCount: number
  cylinderCount: number
  polyhedronCount: number
  estimatedAssemblyInstances: number
}

export interface RenderDiagnostics {
  renderId: string
  route: RenderRoute
  codeHash?: string
  featureSignature?: string
  durationMs?: number
  timeoutMs?: number
  failureClass?: RenderFailureClass
  failureStage?: 'preflight' | 'wasm_init' | 'wasm_exec' | 'stl_encode' | 'api_request' | 'api_response'
  fallbackAttempted?: boolean
  fallbackUsed?: boolean
  fallbackReason?: string
  workerLogTail?: string
  stlBytes?: number
  userMessage?: string
  preflight?: RenderPreflightSummary
}

export interface RenderStlResult {
  success: boolean
  stlBase64?: string
  timestamp: number
  error?: string
  diagnostics?: RenderDiagnostics
}

export interface ContextResult {
  success: boolean
  content?: string
  source?: 'user' | 'bundled'
  filename?: string
  error?: string
}

export interface ContextFileInfo {
  exists: boolean
  size: number
  modified: string | null
}

export interface ContextStatusResult {
  success: boolean
  openscad?: {
    user: ContextFileInfo
    bundled: ContextFileInfo
    active: 'user' | 'bundled'
  }
  build123d?: {
    user: ContextFileInfo
    bundled: ContextFileInfo
    active: 'user' | 'bundled'
  }
  error?: string
}

export interface ContextUpdateResult {
  success: boolean
  message?: string
  size?: number
  error?: string
}

export interface ContextResetResult {
  success: boolean
  message?: string
  error?: string
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  imageDataUrls?: readonly string[]
}

export interface LLMRequestPayload {
  messages: LLMMessage[]
  currentCode?: string
  cadBackend?: CADBackend
  apiContext?: string
}

export interface ElectronAPI {
  renderScad: (code: string) => Promise<{
    success: boolean
    image: string
    timestamp: number
  }>
  renderStl: (code: string) => Promise<RenderStlResult>
  saveProject: (project: ProjectFile, currentFilePath?: string) => Promise<{ canceled: boolean; filePath?: string; error?: string }>
  loadProject: () => Promise<{ canceled: boolean; project?: LoadedProject; filePath?: string; error?: string }>
  exportScad: (code: string, backend?: CADBackend, currentFilePath?: string) => Promise<{ canceled: boolean; filePath?: string }>
  exportStl: (stlBase64: string | null, currentFilePath?: string) => Promise<{ canceled: boolean; filePath?: string }>
  getTempDir: () => Promise<string>
  getSettings: () => Promise<Settings>
  saveSettings: (settings: Settings) => Promise<{ success: boolean }>
  checkOpenscadPath: (path: string) => Promise<boolean>
  checkPythonPath: (path: string) => Promise<CADValidationResult>
  validateCadBackend: (backend: CADBackend) => Promise<CADValidationResult>
  selectOpenscadPath: () => Promise<{ canceled: boolean; filePath?: string }>
  shouldShowWelcome: () => Promise<boolean>
  resetSettings: () => Promise<{ success: boolean; error?: string }>
  openScadFile: (backend?: CADBackend) => Promise<{ canceled: boolean; filePath?: string; code?: string; error?: string }>
  saveScadFile: (code: string, filePath?: string, backend?: CADBackend) => Promise<{ canceled: boolean; filePath?: string; error?: string }>
  setWindowTitle: (title: string) => Promise<void>
  getOpenRouterConfigured: () => Promise<boolean>
  llmSendMessage: (payload: LLMRequestPayload) => Promise<{
    success: boolean
    response?: {
      content: string
      model: string
      usage?: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
      }
    }
    error?: string
  }>
  llmStreamMessage: (payload: LLMRequestPayload) => Promise<{ streamId: string | null; error?: string }>
  llmStreamAbort: (streamId: string) => Promise<void>
  onLlmStreamChunk: (streamId: string, callback: (delta: string, full: string, done: boolean) => void) => void
  getRecentFiles: () => Promise<RecentFile[]>
  clearRecentFiles: () => Promise<{ success: boolean }>
  removeRecentFile: (filePath: string) => Promise<{ success: boolean }>
  openRecentFile: (filePath: string) => Promise<OpenRecentFileResult>
  loadDocumentation: () => Promise<{ success: boolean; docs?: Record<string, string>; error?: string }>
  getContext: (backend: CADBackend) => Promise<ContextResult>
  getContextStatus: () => Promise<ContextStatusResult>
  updateContextFromCloud: (backend: CADBackend, url: string) => Promise<ContextUpdateResult>
  resetContextToFactory: (backend?: CADBackend) => Promise<ContextResetResult>
  getOllamaModels: (endpoint?: string) => Promise<{
    success: boolean
    models?: Array<{ name: string; size: number; modified: string }>
    error?: string
  }>
  onMenuEvent: (channel: string, callback: () => void) => void
  removeMenuListener: (channel: string) => void
}
