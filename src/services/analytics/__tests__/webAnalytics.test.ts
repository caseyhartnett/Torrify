import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { WebAnalyticsClient, type StorageLike, type WebAnalyticsDependencies } from '../webAnalytics'

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

function createDependencies(overrides: Partial<WebAnalyticsDependencies> = {}): WebAnalyticsDependencies {
  return {
    localStorage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
    location: {
      pathname: '/',
      search: ''
    },
    navigator: {},
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setTimeout: vi.fn(() => 1) as unknown as typeof window.setTimeout,
    clearTimeout: vi.fn(),
    fetch: vi.fn().mockResolvedValue({ ok: true, status: 202 }) as unknown as typeof fetch,
    randomUUID: vi.fn()
      .mockReturnValueOnce('anon-1')
      .mockReturnValueOnce('session-1')
      .mockReturnValue('uuid-next'),
    appVersion: '0.9.3',
    getBaseUrls: vi.fn().mockReturnValue(['https://gateway.test']),
    getSettings: vi.fn().mockResolvedValue({
      enabled: true,
      hasLicenseKeyConfigured: false,
      gatewayBaseUrl: undefined
    }),
    logger: {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    },
    ...overrides
  }
}

describe('WebAnalyticsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes and flushes the session start event', async () => {
    const deps = createDependencies()
    const client = new WebAnalyticsClient(deps)

    await client.init()
    await client.flush()

    expect(deps.fetch).toHaveBeenCalledTimes(1)
    const request = vi.mocked(deps.fetch).mock.calls[0]
    expect(request[0]).toBe('https://gateway.test/api/analytics/events')

    const payload = JSON.parse(String(request[1]?.body)) as {
      anonymousId: string
      sessionId: string
      events: Array<{ eventName: string; props: Record<string, unknown> }>
    }

    expect(payload.anonymousId).toBe('anon-1')
    expect(payload.sessionId).toBe('session-1')
    expect(payload.events[0]?.eventName).toBe('app_session_started')
    expect(payload.events[0]?.props.hasLicenseKeyConfigured).toBe(false)
  })

  it('does not send events when analytics is disabled by settings', async () => {
    const deps = createDependencies({
      getSettings: vi.fn().mockResolvedValue({
        enabled: false,
        hasLicenseKeyConfigured: false,
        gatewayBaseUrl: undefined
      })
    })
    const client = new WebAnalyticsClient(deps)

    await client.init()
    client.track('render_requested', { source: 'editor' })
    await client.flush()

    expect(deps.fetch).not.toHaveBeenCalled()
  })

  it('uses sendBeacon for pagehide-style flushes', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    const deps = createDependencies({
      navigator: { sendBeacon }
    })
    const client = new WebAnalyticsClient(deps)

    await client.init()
    client.track('project_download_initiated', {
      source: 'save_project',
      fileType: 'torrify'
    })
    await client.flush({ useBeacon: true })

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(deps.fetch).not.toHaveBeenCalled()
    expect(sendBeacon.mock.calls[0]?.[0]).toBe('https://gateway.test/api/analytics/events')
  })

  it('caps the in-memory queue so repeated failures cannot leak memory', async () => {
    const deps = createDependencies({
      // Fail every network flush so the queue only drains by eviction.
      fetch: vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    })
    const client = new WebAnalyticsClient(deps)
    await client.init()

    for (let i = 0; i < 500; i += 1) {
      client.track('render_requested', { iteration: i })
    }

    const warnCalls = vi.mocked(deps.logger!.warn!).mock.calls
    expect(warnCalls.some((args) => String(args[0]).includes('Analytics queue exceeded'))).toBe(true)
  })

  it('reschedules a follow-up flush when events remain after a batch send', async () => {
    const setTimeoutMock = vi.fn(() => 1) as unknown as typeof window.setTimeout
    const deps = createDependencies({
      setTimeout: setTimeoutMock,
      fetch: vi.fn().mockResolvedValue({ ok: true, status: 202 }) as unknown as typeof fetch
    })
    const client = new WebAnalyticsClient(deps)

    await client.init()
    for (let i = 0; i < 8; i += 1) {
      client.track('chat_message_sent', { iteration: i })
    }

    await client.flush()

    expect(deps.fetch).toHaveBeenCalledTimes(1)
    expect(setTimeoutMock).toHaveBeenCalled()
  })

  it('survives storage throwing when persisting ids', async () => {
    const throwingStorage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => {}
    }
    const deps = createDependencies({
      localStorage: throwingStorage,
      sessionStorage: throwingStorage
    })
    const client = new WebAnalyticsClient(deps)

    await expect(client.init()).resolves.toBeUndefined()
    expect(() => client.track('render_requested', { source: 'editor' })).not.toThrow()
  })

  it('flushes remaining events during dispose via beacon', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    const deps = createDependencies({
      navigator: { sendBeacon }
    })
    const client = new WebAnalyticsClient(deps)

    await client.init()
    client.track('render_completed', { success: true })

    await client.dispose()

    expect(sendBeacon).toHaveBeenCalled()
    expect(deps.removeEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function))
  })

  it('refreshSettings picks up updated license state mid-session', async () => {
    const getSettings = vi
      .fn()
      .mockResolvedValueOnce({ enabled: true, hasLicenseKeyConfigured: false })
      .mockResolvedValueOnce({ enabled: true, hasLicenseKeyConfigured: true })
    const deps = createDependencies({ getSettings })
    const client = new WebAnalyticsClient(deps)

    await client.init()
    await client.refreshSettings()
    client.track('settings_opened', { source: 'toolbar' })
    await client.flush()

    const lastCall = vi.mocked(deps.fetch).mock.calls.at(-1)!
    const body = JSON.parse(String(lastCall[1]?.body)) as {
      events: Array<{ props: Record<string, unknown> }>
    }
    const lastEvent = body.events.at(-1)!
    expect(lastEvent.props.hasLicenseKeyConfigured).toBe(true)
  })
})
