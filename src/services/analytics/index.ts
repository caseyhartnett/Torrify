import { IS_WEB_RUNTIME } from '../../platform/runtime'
import { getGatewayBaseUrls } from '../../platform/web/gatewayConfig'
import { logger } from '../../utils/logger'
import type { AnalyticsClient, AnalyticsProps } from './types'
import { WebAnalyticsClient } from './webAnalytics'

class NoopAnalyticsClient implements AnalyticsClient {
  async init(): Promise<void> {}
  track(): void {}
  async flush(): Promise<void> {}
  setEnabled(): void {}
}

function createAnalyticsClient(): AnalyticsClient {
  if (!IS_WEB_RUNTIME || typeof window === 'undefined') {
    return new NoopAnalyticsClient()
  }

  return new WebAnalyticsClient({
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    location: window.location,
    navigator: window.navigator,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    fetch: window.fetch.bind(window),
    randomUUID: () => window.crypto.randomUUID(),
    appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0',
    getBaseUrls: getGatewayBaseUrls,
    getSettings: async () => {
      const settings = await window.electronAPI.getSettings()
      return {
        enabled: settings.analytics?.enabled !== false,
        hasLicenseKeyConfigured: !!settings.llm.gatewayLicenseKey?.trim(),
        gatewayBaseUrl: settings.llm.gatewayBaseUrl?.trim() || undefined
      }
    },
    logger
  })
}

const analyticsClient = createAnalyticsClient()

export async function initializeAnalytics(): Promise<void> {
  await analyticsClient.init()
}

export function trackAnalyticsEvent(eventName: string, props?: AnalyticsProps): void {
  analyticsClient.track(eventName, props)
}

export async function flushAnalytics(options?: { useBeacon?: boolean }): Promise<void> {
  await analyticsClient.flush(options)
}

export function setAnalyticsEnabled(enabled: boolean): void {
  analyticsClient.setEnabled(enabled)
}

export async function refreshAnalyticsSettings(): Promise<void> {
  if (analyticsClient.refreshSettings) {
    await analyticsClient.refreshSettings()
  }
}

export type { AnalyticsProps, AnalyticsPrimitive, AnalyticsEventRecord } from './types'
export { WebAnalyticsClient } from './webAnalytics'
