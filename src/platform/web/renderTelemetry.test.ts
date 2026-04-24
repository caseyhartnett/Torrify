import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRenderFeatureSignature, computeRenderCodeHash, recordRenderIncident } from './renderTelemetry'
import type { RenderDiagnostics, RenderPreflightSummary } from '../../types/electron-api'

const STORAGE_KEY = 'torrify.web.render-debug.v1'

function createPreflight(): RenderPreflightSummary {
  return {
    riskScore: 61,
    riskLevel: 'high',
    recommendedRoute: 'api',
    reasonCodes: ['thread_signals', 'hull_in_loop'],
    codeLength: 1234,
    lineCount: 56,
    moduleCount: 2,
    loopCount: 4,
    booleanCount: 12,
    booleanDepthEstimate: 3,
    minkowskiCount: 0,
    hullCount: 2,
    hullInLoopCount: 1,
    threadSignalCount: 2,
    knurlSignalCount: 0,
    highFnCount: 1,
    maxFnLiteral: 96,
    maxLiteralLoopSpan: 120,
    literalLoopProduct: 120,
    transformCount: 8,
    cylinderCount: 4,
    polyhedronCount: 0,
    estimatedAssemblyInstances: 16
  }
}

describe('renderTelemetry', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('hashes code deterministically without storing raw content', () => {
    const hashA = computeRenderCodeHash('cube([10,10,10]);')
    const hashB = computeRenderCodeHash('cube([10,10,10]);')
    const hashC = computeRenderCodeHash('sphere(10);')

    expect(hashA).toBe(hashB)
    expect(hashA).not.toBe(hashC)
    expect(hashA.startsWith('fnv1a-')).toBe(true)
  })

  it('builds a safe feature signature from structural metrics', () => {
    const signature = buildRenderFeatureSignature(createPreflight())
    expect(signature).toContain('risk:high')
    expect(signature).toContain('reasons:thread_signals+hull_in_loop')
    expect(signature).not.toContain('cube')
  })

  it('stores recent incidents without raw code', () => {
    const preflight = createPreflight()
    const diagnostics: RenderDiagnostics = {
      renderId: 'render-1',
      route: 'api',
      codeHash: 'fnv1a-12345678',
      featureSignature: buildRenderFeatureSignature(preflight),
      failureClass: 'complexity',
      failureStage: 'api_response',
      preflight
    }

    recordRenderIncident('fnv1a-12345678', diagnostics.featureSignature!, diagnostics, false, 'render failed')

    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || '[]') as Array<Record<string, unknown>>
    expect(stored).toHaveLength(1)
    expect(stored[0]?.codeHash).toBe('fnv1a-12345678')
    expect(stored[0]?.featureSignature).toBe(diagnostics.featureSignature)
    expect(JSON.stringify(stored[0])).not.toContain('cube([10,10,10]);')
  })
})
