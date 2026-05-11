/**
 * LLM Service Factory (Main Process).
 * 
 * Orchestrates the creation of concrete LLM service implementations 
 * based on application configuration.
 */
import type { LLMService, LLMConfig, LLMProvider } from './types'
import { GeminiService } from './GeminiService'
import { OpenAIService } from './OpenAIService'
import { OpenRouterService } from './OpenRouterService'
import { OllamaService } from './OllamaService'
import { GatewayService } from './GatewayService'
import { CustomService } from './CustomService'

export type { 
  LLMService, 
  LLMConfig, 
  LLMProvider, 
  LLMMessage, 
  LLMResponse, 
  CADBackend, 
  StreamCallback, 
  StreamController 
} from './types'

/** 
 * Providers that handle authentication externally or through 
 * specialized headers (e.g. gateway license).
 */
const PROVIDERS_WITHOUT_API_KEY: readonly LLMProvider[] = [
  'openrouter', 
  'ollama', 
  'custom', 
  'gateway'
] as const

/**
 * Checks if the specified provider requires a manual API key configuration.
 * 
 * @param provider - The provider to check
 * @returns True if the provider requires an API key in the settings
 */
export function requiresApiKey(provider: LLMProvider): boolean {
  return !PROVIDERS_WITHOUT_API_KEY.includes(provider)
}

/**
 * Factory function to instantiate the appropriate LLM service implementation.
 * 
 * @param config - The current application LLM configuration
 * @throws {Error} If AI is disabled or configuration is incomplete
 * @returns An instance of LLMService
 */
export function createLLMService(config: LLMConfig): LLMService {
  if (!config.enabled) {
    throw new Error('LLM is not enabled')
  }

  if (!config.apiKey && requiresApiKey(config.provider)) {
    throw new Error('API key is required for this provider')
  }

  switch (config.provider) {
    case 'gemini':
      return new GeminiService(config)
    case 'openai':
      return new OpenAIService(config)
    case 'anthropic':
      throw new Error('Anthropic provider not yet implemented')
    case 'custom':
      return new CustomService(config)
    case 'openrouter':
      return new OpenRouterService(config)
    case 'gateway':
      return new GatewayService(config)
    case 'ollama':
      return new OllamaService(config)
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`)
  }
}
