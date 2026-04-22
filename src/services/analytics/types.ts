export type AnalyticsPrimitive = string | number | boolean | null

export type AnalyticsProps = Record<string, AnalyticsPrimitive>

export interface AnalyticsEventRecord {
  readonly eventName: string
  readonly occurredAt: string
  readonly page: string
  readonly runtime: 'web'
  readonly appVersion: string
  readonly props: AnalyticsProps
}

export interface AnalyticsClient {
  init(): Promise<void>
  track(eventName: string, props?: AnalyticsProps): void
  flush(options?: { useBeacon?: boolean }): Promise<void>
  setEnabled(enabled: boolean): void
  refreshSettings?(): Promise<void>
}
