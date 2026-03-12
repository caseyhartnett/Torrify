import { PROVIDER_NAMES, requiresApiKey } from '../../services/llm'
import type { Settings } from './types'
import type { OllamaModel } from './hooks/useOllamaModels'

const PRO_MODEL_GROUPS = [
  {
    label: 'The Big Players (Premium Performance)',
    options: [
      { value: 'anthropic/claude-3.7-sonnet:thinking', label: 'Claude 3.7 Sonnet (thinking) (default)' },
      { value: 'openai/gpt-5.3-codex', label: 'GPT-5.3 Codex' },
      { value: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
      { value: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' }
    ]
  },
  {
    label: 'High-Efficiency & Specialized Coding',
    options: [
      { value: 'openai/gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
      { value: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2' },
      { value: 'qwen/qwen3-coder', label: 'Qwen3 Coder 480B A35B' },
      { value: 'x-ai/grok-code-fast-1', label: 'Grok Code Fast 1' }
    ]
  },
  {
    label: 'Cost-Effective Prototyping',
    options: [
      { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
      { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' }
    ]
  }
]

// OpenAI BYOK: direct API model IDs (platform.openai.com)
const OPENAI_MODEL_GROUPS = [
  {
    label: 'Recommended (GPT-5)',
    options: [
      { value: 'gpt-5.2', label: 'GPT-5.2 (default, best for coding)' },
      { value: 'gpt-5.2-pro', label: 'GPT-5.2 Pro' },
      { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
      { value: 'gpt-5-nano', label: 'GPT-5 Nano' }
    ]
  },
  {
    label: 'GPT-5.1 & GPT-5',
    options: [
      { value: 'gpt-5.1', label: 'GPT-5.1' },
      { value: 'gpt-5', label: 'GPT-5' }
    ]
  },
  {
    label: 'GPT-4o & GPT-4',
    options: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { value: 'gpt-4.1', label: 'GPT-4.1' },
      { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' }
    ]
  },
  {
    label: 'Legacy',
    options: [
      { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo Preview (deprecated)' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
    ]
  }
]

interface AISettingsProps {
  settings: Settings
  managedGatewayMode?: boolean
  openRouterKeySet: boolean | null
  ollamaModels: OllamaModel[]
  isLoadingOllamaModels: boolean
  ollamaModelsError: string | null
  onLLMChange: (field: keyof Settings['llm'], value: string | number | boolean) => void
  onProviderChange: (provider: Settings['llm']['provider']) => void
  onAccessModeChange: (mode: 'byok' | 'pro') => void
  onLoadOllamaModels: (endpoint?: string) => Promise<OllamaModel[]>
}

export function AISettings({
  settings,
  managedGatewayMode = false,
  openRouterKeySet,
  ollamaModels,
  isLoadingOllamaModels,
  ollamaModelsError,
  onLLMChange,
  onProviderChange,
  onAccessModeChange,
  onLoadOllamaModels
}: AISettingsProps) {
  return (
    <div
      className="space-y-4"
      role="tabpanel"
      id="settings-panel-ai"
      aria-labelledby="settings-tab-ai"
    >
      {/* Access Mode */}
      {!managedGatewayMode ? (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Access Mode</label>
          <div className="flex gap-2">
            <button
              onClick={() => onAccessModeChange('byok')}
              className={`px-3 py-2 rounded text-sm border ${
                settings.llm.provider === 'gateway'
                  ? 'border-[#3e3e42] text-gray-400'
                  : 'border-blue-500 text-blue-300 bg-blue-500/10'
              }`}
            >
              BYOK
            </button>
            <button
              onClick={() => onAccessModeChange('pro')}
              className={`px-3 py-2 rounded text-sm border ${
                settings.llm.provider === 'gateway'
                  ? 'border-blue-500 text-blue-300 bg-blue-500/10'
                  : 'border-[#3e3e42] text-gray-400'
              }`}
            >
              PRO
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {settings.llm.provider === 'gateway'
              ? 'PRO uses the managed LLM (gateway) with your license key.'
              : 'BYOK uses your provider API key from this settings screen.'}
          </p>
        </div>
      ) : (
        <div className="p-3 rounded border border-blue-700/50 bg-blue-900/20">
          <p className="text-sm text-blue-200 font-medium">Managed Online Mode</p>
          <p className="text-xs text-blue-100/90 mt-1">
            The web app always uses the managed OpenRouter PRO gateway. Free usage is available with automatic limits.
          </p>
        </div>
      )}

      {/* Enable/Disable AI */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-300">Enable AI Assistant</label>
          <p className="text-xs text-gray-500 mt-1">Turn AI chat functionality on/off</p>
          {settings.llm.enabled && requiresApiKey(settings.llm.provider) && !settings.llm.apiKey?.trim() && (
            <p className="text-xs text-yellow-400 mt-1">⚠️ API key required to use AI features</p>
          )}
          {settings.llm.enabled && settings.llm.provider === 'gateway' && !settings.llm.gatewayLicenseKey?.trim() && (
            <p className="text-xs text-yellow-400 mt-1">
              {managedGatewayMode ? '⚠️ Using free tier limits (add license key for more usage)' : '⚠️ PRO license key is not set'}
            </p>
          )}
          {settings.llm.enabled && settings.llm.provider === 'openrouter' && openRouterKeySet === false && (
            <p className="text-xs text-yellow-400 mt-1">⚠️ OPENROUTER_API_KEY is not set</p>
          )}
        </div>
        <button
          onClick={() => onLLMChange('enabled', !settings.llm.enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.llm.enabled ? 'bg-blue-600' : 'bg-gray-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.llm.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Provider Selection - BYOK only */}
      {!managedGatewayMode && settings.llm.provider !== 'gateway' && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">LLM Provider</label>
          <select
            value={settings.llm.provider}
            onChange={(e) => onProviderChange(e.target.value as Settings['llm']['provider'])}
            disabled={!settings.llm.enabled}
            className="w-full bg-[#1e1e1e] text-white px-3 py-2 rounded border border-[#3e3e42] focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {Object.entries(PROVIDER_NAMES)
              .filter(([key]) => key !== 'gateway' && key !== 'anthropic')
              .map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
          </select>
        </div>
      )}

      {/* PRO: License key only */}
      {settings.llm.provider === 'gateway' && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            {managedGatewayMode ? 'License Key (Optional)' : 'PRO License Key'}
          </label>
          <input
            type="password"
            name="gatewayLicenseKey"
            autoComplete="current-password"
            value={settings.llm.gatewayLicenseKey ?? ''}
            onChange={(e) => onLLMChange('gatewayLicenseKey', e.target.value)}
            disabled={!settings.llm.enabled}
            className="w-full bg-[#1e1e1e] text-white px-3 py-2 rounded border border-[#3e3e42] focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm"
            placeholder={managedGatewayMode ? 'Enter license key to unlock more usage' : 'Enter your PRO license key'}
          />
          <p className="text-xs text-gray-500 mt-1">
            {managedGatewayMode
              ? 'Leave blank to use free tier limits. Add your Lemon Squeezy license key to continue with higher usage. This value is stored locally in this browser.'
              : 'Enter the license key for your PRO subscription.'}
          </p>
        </div>
      )}

      {/* Model Name */}
      {!managedGatewayMode ? (
        <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Model</label>
        {settings.llm.provider === 'openrouter' || settings.llm.provider === 'gateway' ? (
          <select
            value={settings.llm.model}
            onChange={(e) => onLLMChange('model', e.target.value)}
            disabled={!settings.llm.enabled}
            className="w-full bg-[#1e1e1e] text-white px-3 py-2 rounded border border-[#3e3e42] focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {PRO_MODEL_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : settings.llm.provider === 'openai' ? (
          <>
            <select
              value={settings.llm.model}
              onChange={(e) => onLLMChange('model', e.target.value)}
              disabled={!settings.llm.enabled}
              className="w-full bg-[#1e1e1e] text-white px-3 py-2 rounded border border-[#3e3e42] focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {OPENAI_MODEL_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Direct OpenAI API models. GPT-5.2 recommended for coding.</p>
          </>
        ) : settings.llm.provider === 'ollama' && ollamaModels.length > 0 ? (
          <>
            <select
              value={settings.llm.model}
              onChange={(e) => onLLMChange('model', e.target.value)}
              disabled={!settings.llm.enabled || isLoadingOllamaModels}
              className="w-full bg-[#1e1e1e] text-white px-3 py-2 rounded border border-[#3e3e42] focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {ollamaModels.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name} {model.size > 0 ? `(${(model.size / 1024 / 1024 / 1024).toFixed(1)} GB)` : ''}
                </option>
              ))}
            </select>
            {isLoadingOllamaModels && <p className="text-xs text-gray-500 mt-1">Loading models...</p>}
            {ollamaModelsError && (
              <p className="text-xs text-yellow-400 mt-1">⚠️ {ollamaModelsError}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {ollamaModels.length} model{ollamaModels.length !== 1 ? 's' : ''} available
            </p>
          </>
        ) : (
          <>
            <input
              type="text"
              value={settings.llm.model}
              onChange={(e) => onLLMChange('model', e.target.value)}
              disabled={!settings.llm.enabled}
              className="w-full bg-[#1e1e1e] text-white px-3 py-2 rounded border border-[#3e3e42] focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={settings.llm.provider === 'ollama' ? 'gpt-oss:20b' : settings.llm.provider === 'gemini' ? 'gemini-3-flash' : 'e.g. claude-3-5-sonnet-20241022'}
            />
            {settings.llm.provider === 'ollama' && (
              <div className="mt-1">
                {isLoadingOllamaModels && (
                  <p className="text-xs text-gray-500">Loading models from Ollama...</p>
                )}
                {ollamaModelsError && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-yellow-400 flex-1">⚠️ {ollamaModelsError}</p>
                    <button
                      type="button"
                      onClick={() => onLoadOllamaModels(settings.llm.customEndpoint)}
                      disabled={isLoadingOllamaModels}
                      className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded"
                    >
                      Retry
                    </button>
                  </div>
                )}
                {!isLoadingOllamaModels && !ollamaModelsError && ollamaModels.length === 0 && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-500 flex-1">
                      Enter model name manually or check Ollama connection
                    </p>
                    <button
                      type="button"
                      onClick={() => onLoadOllamaModels(settings.llm.customEndpoint)}
                      disabled={isLoadingOllamaModels}
                      className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded"
                    >
                      Load Models
                    </button>
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {settings.llm.provider === 'gemini' && 'Examples: gemini-3-flash, gemini-3-pro'}
              {settings.llm.provider === 'anthropic' && 'Examples: claude-3-5-sonnet-20241022'}
              {settings.llm.provider === 'custom' && 'Enter your custom model identifier'}
              {settings.llm.provider === 'ollama' && ollamaModels.length === 0 && 'Examples: gpt-oss:20b, llama2, mistral'}
            </p>
          </>
        )}
      </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Model</label>
          <div className="w-full bg-[#1e1e1e] text-gray-300 px-3 py-2 rounded border border-[#3e3e42]">
            Managed by Torrify service policy
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Model selection is controlled server-side for abuse prevention and cost control.
          </p>
        </div>
      )}

      {/* API Key - BYOK providers */}
      {!managedGatewayMode &&
        settings.llm.provider !== 'openrouter' &&
        settings.llm.provider !== 'ollama' &&
        settings.llm.provider !== 'gateway' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {settings.llm.provider === 'custom' ? 'API Key (optional)' : 'API Key'}
            </label>
            <input
              type="password"
              value={settings.llm.apiKey}
              onChange={(e) => onLLMChange('apiKey', e.target.value)}
              disabled={!settings.llm.enabled}
              className="w-full bg-[#1e1e1e] text-white px-3 py-2 rounded border border-[#3e3e42] focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm"
              placeholder="Enter your API key"
            />
            <p className="text-xs text-gray-500 mt-1">
              {settings.llm.provider === 'gemini' && 'Get your key at: https://makersuite.google.com/app/apikey'}
              {settings.llm.provider === 'openai' && 'Get your key at: https://platform.openai.com/api-keys'}
              {settings.llm.provider === 'anthropic' && 'Get your key at: https://console.anthropic.com/'}
              {settings.llm.provider === 'custom' && 'Optional: enter a key only if your endpoint requires one'}
            </p>
          </div>
        )}

      {/* Custom Endpoint (for custom and ollama providers) */}
      {!managedGatewayMode && (settings.llm.provider === 'custom' || settings.llm.provider === 'ollama') && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">API Endpoint</label>
          <input
            type="text"
            value={settings.llm.customEndpoint || ''}
            onChange={(e) => onLLMChange('customEndpoint', e.target.value)}
            disabled={!settings.llm.enabled}
            className="w-full bg-[#1e1e1e] text-white px-3 py-2 rounded border border-[#3e3e42] focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder={settings.llm.provider === 'ollama' ? 'http://127.0.0.1:11434' : 'http://localhost:11434/v1'}
          />
          <p className="text-xs text-gray-500 mt-1">
            {settings.llm.provider === 'ollama' &&
              'Ollama API endpoint (default: http://127.0.0.1:11434). Leave empty to use default. Make sure Ollama is running before using it.'}
            {settings.llm.provider === 'custom' && 'For Ollama, LM Studio, or other local/custom models'}
          </p>
        </div>
      )}

      {/* Advanced Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Temperature</label>
          <input
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={settings.llm.temperature || 0.7}
            onChange={(e) => onLLMChange('temperature', parseFloat(e.target.value))}
            disabled={!settings.llm.enabled}
            className="w-full bg-[#1e1e1e] text-white px-3 py-2 rounded border border-[#3e3e42] focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-500 mt-1">0 = focused, 1 = creative</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Max Tokens</label>
          <input
            type="number"
            min="256"
            max="1000000"
            step="256"
            value={settings.llm.maxTokens ?? 128000}
            onChange={(e) => onLLMChange('maxTokens', parseInt(e.target.value))}
            disabled={!settings.llm.enabled}
            className="w-full bg-[#1e1e1e] text-white px-3 py-2 rounded border border-[#3e3e42] focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-500 mt-1">Response length limit</p>
        </div>
      </div>
    </div>
  )
}
