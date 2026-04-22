import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AISettings } from '../AISettings'
import type { Settings } from '../types'
import type { OllamaModel } from '../hooks/useOllamaModels'

const defaultSettings: Settings = {
  cadBackend: 'openscad',
  openscadPath: '',
  build123dPythonPath: '',
  llm: {
    provider: 'gemini',
    model: 'gemini-3-flash',
    apiKey: 'test-key',
    enabled: true,
    temperature: 0.7,
    maxTokens: 2048
  }
}

const defaultProps = {
  settings: defaultSettings,
  openRouterKeySet: null,
  ollamaModels: [] as OllamaModel[],
  isLoadingOllamaModels: false,
  ollamaModelsError: null,
  onLLMChange: vi.fn(),
  onAnalyticsEnabledChange: vi.fn(),
  onProviderChange: vi.fn(),
  onAccessModeChange: vi.fn(),
  onLoadOllamaModels: vi.fn().mockResolvedValue([])
}

describe('AISettings', () => {
  it('renders Access Mode section with BYOK and PRO buttons', () => {
    render(<AISettings {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'BYOK' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PRO' })).toBeInTheDocument()
  })

  it('shows BYOK as selected when provider is not gateway', () => {
    render(<AISettings {...defaultProps} />)
    expect(screen.getByText(/BYOK uses your provider API key/)).toBeInTheDocument()
  })

  it('shows PRO as selected when provider is gateway', () => {
    const settings: Settings = {
      ...defaultSettings,
      llm: { ...defaultSettings.llm, provider: 'gateway', gatewayLicenseKey: '' }
    }
    render(<AISettings {...defaultProps} settings={settings} />)
    expect(screen.getByText(/PRO uses the managed LLM/)).toBeInTheDocument()
  })

  it('calls onAccessModeChange when BYOK is clicked and current is PRO', async () => {
    const user = userEvent.setup()
    const onAccessModeChange = vi.fn()
    const settings: Settings = {
      ...defaultSettings,
      llm: { ...defaultSettings.llm, provider: 'gateway' }
    }
    render(<AISettings {...defaultProps} settings={settings} onAccessModeChange={onAccessModeChange} />)

    await user.click(screen.getByRole('button', { name: 'BYOK' }))
    expect(onAccessModeChange).toHaveBeenCalledWith('byok')
  })

  it('calls onAccessModeChange when PRO is clicked and current is BYOK', async () => {
    const user = userEvent.setup()
    const onAccessModeChange = vi.fn()
    render(<AISettings {...defaultProps} onAccessModeChange={onAccessModeChange} />)

    await user.click(screen.getByRole('button', { name: 'PRO' }))
    expect(onAccessModeChange).toHaveBeenCalledWith('pro')
  })

  it('renders Enable AI Assistant toggle', () => {
    render(<AISettings {...defaultProps} />)
    expect(screen.getByText(/Enable AI Assistant/)).toBeInTheDocument()
  })

  it('calls onLLMChange when enable toggle is clicked', async () => {
    const user = userEvent.setup()
    const onLLMChange = vi.fn()
    render(<AISettings {...defaultProps} onLLMChange={onLLMChange} />)

    const buttons = screen.getAllByRole('button')
    const toggle = buttons.find((b) => b.textContent !== 'BYOK' && b.textContent !== 'PRO')
    expect(toggle).toBeDefined()
    await user.click(toggle!)
    expect(onLLMChange).toHaveBeenCalledWith('enabled', false)
  })

  it('renders LLM Provider select when BYOK', () => {
    render(<AISettings {...defaultProps} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('renders PRO License Key input when provider is gateway', () => {
    const settings: Settings = {
      ...defaultSettings,
      llm: { ...defaultSettings.llm, provider: 'gateway', gatewayLicenseKey: '' }
    }
    render(<AISettings {...defaultProps} settings={settings} />)
    expect(screen.getByPlaceholderText(/Enter your PRO license key/)).toBeInTheDocument()
  })

  it('hides BYOK controls in managed web mode', () => {
    const settings: Settings = {
      ...defaultSettings,
      llm: { ...defaultSettings.llm, provider: 'gateway', gatewayLicenseKey: '' }
    }
    render(<AISettings {...defaultProps} settings={settings} managedGatewayMode />)
    expect(screen.queryByRole('button', { name: 'BYOK' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'PRO' })).not.toBeInTheDocument()
    expect(screen.getByText(/Managed Online Mode/)).toBeInTheDocument()
  })

  it('uses password-manager-friendly attributes for license key in managed web mode', () => {
    const settings: Settings = {
      ...defaultSettings,
      llm: { ...defaultSettings.llm, provider: 'gateway', gatewayLicenseKey: '' }
    }
    render(<AISettings {...defaultProps} settings={settings} managedGatewayMode />)
    const input = screen.getByPlaceholderText(/Enter license key to unlock more usage/) as HTMLInputElement
    expect(input.type).toBe('password')
    expect(input.name).toBe('gatewayLicenseKey')
    expect(input.autocomplete).toBe('current-password')
  })

  it('renders analytics opt-out in managed web mode and toggles it', async () => {
    const user = userEvent.setup()
    const onAnalyticsEnabledChange = vi.fn()
    const settings: Settings = {
      ...defaultSettings,
      analytics: { enabled: true },
      llm: { ...defaultSettings.llm, provider: 'gateway', gatewayLicenseKey: '' }
    }

    render(
      <AISettings
        {...defaultProps}
        settings={settings}
        managedGatewayMode
        onAnalyticsEnabledChange={onAnalyticsEnabledChange}
      />
    )

    expect(screen.getByText(/Anonymous Product Analytics/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /toggle anonymous product analytics/i }))
    expect(onAnalyticsEnabledChange).toHaveBeenCalledWith(false)
  })
})
