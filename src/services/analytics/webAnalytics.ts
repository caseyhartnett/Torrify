import type { AnalyticsClient, AnalyticsEventRecord, AnalyticsPrimitive, AnalyticsProps } from './types'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface WebAnalyticsSettingsSnapshot {
  readonly enabled: boolean
  readonly hasLicenseKeyConfigured: boolean
  readonly gatewayBaseUrl?: string
}

export interface WebAnalyticsDependencies {
  readonly localStorage: StorageLike
  readonly sessionStorage: StorageLike
  readonly location: {
    readonly pathname: string
    readonly search: string
  }
  readonly navigator: {
    readonly sendBeacon?: (url: string, data: BodyInit) => boolean
  }
  readonly addEventListener: (type: string, listener: EventListener) => void
  readonly removeEventListener: (type: string, listener: EventListener) => void
  readonly setTimeout: typeof window.setTimeout
  readonly clearTimeout: typeof window.clearTimeout
  readonly fetch: typeof fetch
  readonly randomUUID: () => string
  readonly appVersion: string
  readonly getBaseUrls: (preferredUrl?: string) => string[]
  readonly getSettings: () => Promise<WebAnalyticsSettingsSnapshot>
  readonly logger?: {
    debug?: (...args: unknown[]) => void
    warn?: (...args: unknown[]) => void
    error?: (message: string, error?: unknown) => void
  }
}

const ANALYTICS_ANONYMOUS_ID_KEY = 'torrify.analytics.anonymous-id.v1'
const ANALYTICS_SESSION_ID_KEY = 'torrify.analytics.session-id.v1'
const ANALYTICS_SESSION_TRACKED_KEY = 'torrify.analytics.session-started.v1'
const MAX_BATCH_SIZE = 5
const FLUSH_INTERVAL_MS = 10_000
const MAX_PROP_COUNT = 20
const MAX_STRING_LENGTH = 120
const STRING_TRUNCATION_SUFFIX = '...'
// Hard cap on the in-memory queue to avoid unbounded growth when the ingestion
// endpoint is unavailable (e.g. offline, CORS block, persistent 5xx).
const MAX_QUEUE_SIZE = 100

function sanitizeString(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized.length <= MAX_STRING_LENGTH) {
    return normalized
  }
  const budget = Math.max(0, MAX_STRING_LENGTH - STRING_TRUNCATION_SUFFIX.length)
  return `${normalized.slice(0, budget)}${STRING_TRUNCATION_SUFFIX}`
}

function sanitizePrimitive(value: AnalyticsPrimitive): AnalyticsPrimitive {
  if (typeof value === 'string') {
    return sanitizeString(value)
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  return value
}

function sanitizeProps(props: AnalyticsProps | undefined, reservedSlots = 0): AnalyticsProps {
  if (!props) {
    return {}
  }

  const limit = Math.max(0, MAX_PROP_COUNT - reservedSlots)
  const next: AnalyticsProps = {}
  let count = 0
  for (const [key, value] of Object.entries(props)) {
    if (count >= limit) {
      break
    }
    if (!key.trim()) {
      continue
    }
    next[sanitizeString(key)] = sanitizePrimitive(value)
    count += 1
  }
  return next
}

function buildPagePath(location: WebAnalyticsDependencies['location']): string {
  const path = location.pathname || '/'
  return `${path}${location.search || ''}`
}

function createId(randomUUID: () => string): string {
  try {
    return randomUUID()
  } catch {
    return `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
}

function safeGetItem(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function safeSetItem(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value)
  } catch {
    // Storage may be unavailable (Safari private mode, quota exceeded, etc.).
    // Analytics must never break the host app.
  }
}

export class WebAnalyticsClient implements AnalyticsClient {
  private readonly deps: WebAnalyticsDependencies
  private readonly onPageHide: EventListener
  private queue: AnalyticsEventRecord[] = []
  private enabled = true
  private flushTimer: number | null = null
  private anonymousId = ''
  private sessionId = ''
  private idsReady = false
  private preferredGatewayBaseUrl: string | undefined
  private initPromise: Promise<void> | null = null
  private hasLicenseKeyConfigured = false
  private listenersBound = false
  private flushInFlight: Promise<void> | null = null

  constructor(deps: WebAnalyticsDependencies) {
    this.deps = deps
    this.onPageHide = () => {
      void this.flush({ useBeacon: true })
    }
  }

  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = (async () => {
      this.ensureIds()
      await this.refreshSettings()

      if (!this.listenersBound) {
        this.deps.addEventListener('pagehide', this.onPageHide)
        this.listenersBound = true
      }

      if (!this.enabled) {
        return
      }

      if (!safeGetItem(this.deps.sessionStorage, ANALYTICS_SESSION_TRACKED_KEY)) {
        safeSetItem(this.deps.sessionStorage, ANALYTICS_SESSION_TRACKED_KEY, '1')
        this.track('app_session_started', {
          source: 'bootstrap',
          hasLicenseKeyConfigured: this.hasLicenseKeyConfigured
        })
      }
    })().catch((error) => {
      this.deps.logger?.error?.('Failed to initialize analytics', error)
    })

    return this.initPromise
  }

  track(eventName: string, props: AnalyticsProps = {}): void {
    if (!this.enabled) {
      return
    }

    this.ensureIds()

    // Reserve a slot so the auto-injected `hasLicenseKeyConfigured` prop can
    // never push a caller-provided payload over MAX_PROP_COUNT.
    const sanitized = sanitizeProps(props, 1)
    this.queue.push({
      eventName: sanitizeString(eventName),
      occurredAt: new Date().toISOString(),
      page: buildPagePath(this.deps.location),
      runtime: 'web',
      appVersion: this.deps.appVersion,
      props: {
        ...sanitized,
        hasLicenseKeyConfigured: this.hasLicenseKeyConfigured
      }
    })

    if (this.queue.length > MAX_QUEUE_SIZE) {
      const overflow = this.queue.length - MAX_QUEUE_SIZE
      this.queue.splice(0, overflow)
      this.deps.logger?.warn?.(
        `Analytics queue exceeded ${MAX_QUEUE_SIZE} events, dropping ${overflow} oldest event(s)`
      )
    }

    if (this.queue.length >= MAX_BATCH_SIZE) {
      void this.flush()
      return
    }

    this.scheduleFlush()
  }

  async flush(options: { useBeacon?: boolean } = {}): Promise<void> {
    if (this.flushInFlight) {
      // Serialize flushes so we never hold multiple batches in flight; the
      // existing flush will reschedule itself if the queue still has events
      // once it completes.
      return this.flushInFlight
    }

    const run = this.runFlush(options)
    this.flushInFlight = run
    try {
      await run
    } finally {
      this.flushInFlight = null
    }
  }

  private async runFlush(options: { useBeacon?: boolean }): Promise<void> {
    if (!this.enabled || this.queue.length === 0) {
      return
    }

    const batch = this.queue.slice(0, MAX_BATCH_SIZE)
    const payload = JSON.stringify({
      anonymousId: this.anonymousId,
      sessionId: this.sessionId,
      sentAt: new Date().toISOString(),
      events: batch
    })

    this.clearFlushTimer()

    const baseUrls = this.deps.getBaseUrls(this.preferredGatewayBaseUrl)
    if (baseUrls.length === 0) {
      return
    }

    if (options.useBeacon && this.deps.navigator.sendBeacon) {
      const endpoint = `${baseUrls[0]}/api/analytics/events`
      let beaconSent = false
      try {
        beaconSent = this.deps.navigator.sendBeacon(
          endpoint,
          new Blob([payload], { type: 'application/json' })
        )
      } catch (error) {
        this.deps.logger?.warn?.('Analytics beacon flush threw', error)
      }
      if (beaconSent) {
        this.queue = this.queue.slice(batch.length)
      }
      // When the beacon fails we intentionally keep the events queued; there
      // may be no opportunity to retry (pagehide) but leaving them preserves
      // ordering for any subsequent in-session flushes.
      return
    }

    const attemptErrors: string[] = []
    for (const baseUrl of baseUrls) {
      try {
        const response = await this.deps.fetch(`${baseUrl}/api/analytics/events`, {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json'
          },
          body: payload
        })

        if (response.ok || response.status === 202) {
          this.queue = this.queue.slice(batch.length)
          if (this.enabled && this.queue.length > 0) {
            this.scheduleFlush()
          }
          return
        }

        attemptErrors.push(`${response.status} ${baseUrl}`)
      } catch (error) {
        attemptErrors.push(
          `${baseUrl}: ${error instanceof Error ? error.message : 'network error'}`
        )
        this.deps.logger?.warn?.('Analytics flush attempt failed', error)
      }
    }

    if (attemptErrors.length > 0) {
      this.deps.logger?.warn?.(
        `Analytics flush failed across all endpoints: ${attemptErrors.join(' | ')}`
      )
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled

    if (!enabled) {
      this.queue = []
      this.clearFlushTimer()
    }
  }

  async refreshSettings(): Promise<void> {
    try {
      const settings = await this.deps.getSettings()
      this.enabled = settings.enabled
      this.preferredGatewayBaseUrl = settings.gatewayBaseUrl
      this.hasLicenseKeyConfigured = settings.hasLicenseKeyConfigured
    } catch (error) {
      this.deps.logger?.warn?.('Falling back to default analytics settings', error)
      this.enabled = true
      this.preferredGatewayBaseUrl = undefined
      this.hasLicenseKeyConfigured = false
    }
  }

  async dispose(): Promise<void> {
    if (this.listenersBound) {
      this.deps.removeEventListener('pagehide', this.onPageHide)
      this.listenersBound = false
    }
    this.clearFlushTimer()
    if (this.enabled && this.queue.length > 0) {
      await this.flush({ useBeacon: true })
    }
  }

  private ensureIds(): void {
    if (this.idsReady) {
      return
    }

    if (!this.anonymousId) {
      const stored = safeGetItem(this.deps.localStorage, ANALYTICS_ANONYMOUS_ID_KEY)
      this.anonymousId = stored ?? createId(this.deps.randomUUID)
      if (!stored) {
        safeSetItem(this.deps.localStorage, ANALYTICS_ANONYMOUS_ID_KEY, this.anonymousId)
      }
    }

    if (!this.sessionId) {
      const stored = safeGetItem(this.deps.sessionStorage, ANALYTICS_SESSION_ID_KEY)
      this.sessionId = stored ?? createId(this.deps.randomUUID)
      if (!stored) {
        safeSetItem(this.deps.sessionStorage, ANALYTICS_SESSION_ID_KEY, this.sessionId)
      }
    }

    this.idsReady = true
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) {
      return
    }

    this.flushTimer = this.deps.setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, FLUSH_INTERVAL_MS)
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== null) {
      this.deps.clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }
}
