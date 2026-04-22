const DEFAULT_GATEWAY_BASE_URL = 'https://the-gateway-production.up.railway.app'
const LEGACY_GATEWAY_BASE_URL = 'https://the-gatekeeper-production.up.railway.app'

function normalizeGatewayBaseUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const compact = value.replace(/\s+/g, '').trim()
  if (!compact) {
    return undefined
  }

  try {
    const parsed = new URL(compact)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return undefined
    }
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '')
  } catch {
    return undefined
  }
}

function parseGatewayUrlList(value: string | undefined): string[] {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((entry) => normalizeGatewayBaseUrl(entry))
    .filter((entry): entry is string => !!entry)
}

function uniqueDefinedUrls(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeGatewayBaseUrl(value))
        .filter((value): value is string => !!value)
    )
  )
}

export function getGatewayBaseUrls(preferredUrl?: string): string[] {
  const envUrl = import.meta.env.VITE_GATEWAY_URL
  const envFallbackUrls = parseGatewayUrlList(import.meta.env.VITE_GATEWAY_FALLBACK_URLS)

  return uniqueDefinedUrls([
    preferredUrl,
    envUrl,
    ...envFallbackUrls,
    DEFAULT_GATEWAY_BASE_URL,
    LEGACY_GATEWAY_BASE_URL
  ])
}
