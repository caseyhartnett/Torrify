import type { CADBackend } from '../services/cad'
import { IS_WEB_RUNTIME } from './runtime'

export interface RuntimeCapabilities {
  readonly isWebRuntime: boolean
  readonly supportedBackends: readonly CADBackend[]
  readonly supportsKnowledgeBaseManagement: boolean
  readonly supportsRecentFileReopen: boolean
  readonly supportsByokProviders: boolean
  readonly supportsLocalProviders: boolean
  readonly usesManagedGatewayOnly: boolean
  readonly gatewayLicenseKeyOptional: boolean
  readonly storesSettingsInBrowser: boolean
}

const WEB_RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  isWebRuntime: true,
  supportedBackends: ['openscad'],
  supportsKnowledgeBaseManagement: false,
  supportsRecentFileReopen: false,
  supportsByokProviders: false,
  supportsLocalProviders: false,
  usesManagedGatewayOnly: true,
  gatewayLicenseKeyOptional: true,
  storesSettingsInBrowser: true
}

const DESKTOP_RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  isWebRuntime: false,
  supportedBackends: ['openscad', 'build123d'],
  supportsKnowledgeBaseManagement: true,
  supportsRecentFileReopen: true,
  supportsByokProviders: true,
  supportsLocalProviders: true,
  usesManagedGatewayOnly: false,
  gatewayLicenseKeyOptional: false,
  storesSettingsInBrowser: false
}

export function getRuntimeCapabilities(): RuntimeCapabilities {
  return IS_WEB_RUNTIME ? WEB_RUNTIME_CAPABILITIES : DESKTOP_RUNTIME_CAPABILITIES
}

export function supportsBackend(backend: CADBackend, capabilities = getRuntimeCapabilities()): boolean {
  return capabilities.supportedBackends.includes(backend)
}

export function getDefaultRuntimeBackend(capabilities = getRuntimeCapabilities()): CADBackend {
  return capabilities.supportedBackends[0]
}
