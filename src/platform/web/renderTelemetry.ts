import type { RenderDiagnostics, RenderPreflightSummary } from '../../types/electron-api'

const DEBUG_SESSION_STORAGE_KEY = 'torrify.web.render-debug.v1'
const MAX_STORED_INCIDENTS = 25

export function computeRenderCodeHash(code: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < code.length; index += 1) {
    hash ^= code.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function buildRenderFeatureSignature(preflight: RenderPreflightSummary): string {
  const reasons = preflight.reasonCodes.length > 0 ? preflight.reasonCodes.join('+') : 'none'
  return [
    `risk:${preflight.riskLevel}`,
    `reasons:${reasons}`,
    `loops:${preflight.literalLoopProduct}`,
    `booleans:${preflight.booleanCount}`,
    `threads:${preflight.threadSignalCount}`,
    `knurls:${preflight.knurlSignalCount}`,
    `minkowski:${preflight.minkowskiCount}`,
    `hullLoop:${preflight.hullInLoopCount}`,
    `assembly:${preflight.estimatedAssemblyInstances}`,
    `fn:${preflight.maxFnLiteral ?? 0}`
  ].join('|')
}

export function recordRenderIncident(
  codeHash: string,
  featureSignature: string,
  diagnostics: RenderDiagnostics,
  success: boolean,
  error?: string
): void {
  if (typeof window === 'undefined') {
    return
  }

  const incident = {
    recordedAt: new Date().toISOString(),
    codeHash,
    featureSignature,
    success,
    route: diagnostics.route,
    renderId: diagnostics.renderId,
    durationMs: diagnostics.durationMs ?? null,
    timeoutMs: diagnostics.timeoutMs ?? null,
    failureClass: diagnostics.failureClass ?? null,
    failureStage: diagnostics.failureStage ?? null,
    fallbackAttempted: diagnostics.fallbackAttempted ?? false,
    fallbackUsed: diagnostics.fallbackUsed ?? false,
    fallbackReason: diagnostics.fallbackReason ?? null,
    stlBytes: diagnostics.stlBytes ?? null,
    workerLogTail: diagnostics.workerLogTail ?? null,
    preflightRiskScore: diagnostics.preflight?.riskScore ?? null,
    preflightReasons: diagnostics.preflight?.reasonCodes.join(',') ?? '',
    error: error ?? null
  }

  try {
    const raw = window.sessionStorage.getItem(DEBUG_SESSION_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    const incidents = Array.isArray(parsed) ? parsed : []
    incidents.push(incident)
    const trimmed = incidents.slice(-MAX_STORED_INCIDENTS)
    window.sessionStorage.setItem(DEBUG_SESSION_STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Ignore debug storage failures.
  }
}
