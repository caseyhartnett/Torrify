import type { RenderFailureClass, RenderPreflightSummary } from '../../types/electron-api'

const THREAD_PATTERN = /\b(?:thread[a-z_]*|pitch[a-z_]*|lead[a-z_]*|helix[a-z_]*|helical[a-z_]*|bolt[a-z_]*|screw[a-z_]*|nut[a-z_]*)\b/gi
const KNURL_PATTERN = /\b(?:knurl[a-z_]*|diamond[a-z_]*|grip[a-z_]*|tooth[a-z_]*|teeth[a-z_]*)\b/gi
const LOOP_PATTERN = /\bfor\s*\(/g
const MODULE_PATTERN = /\bmodule\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(/g
const BOOLEAN_PATTERN = /\b(union|difference|intersection)\s*\(/g
const TRANSFORM_PATTERN = /\b(translate|rotate|scale|mirror|multmatrix|resize)\s*\(/g
const LITERAL_FN_PATTERN = /\$fn\s*=\s*(\d+(?:\.\d+)?)/g
const FA_PATTERN = /\$fa\s*=\s*(\d+(?:\.\d+)?)/i
const FS_PATTERN = /\$fs\s*=\s*(\d+(?:\.\d+)?)/i
const RANGE_LOOP_PATTERN = /\bfor\s*\(\s*[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*\[\s*(-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)\s*(?::\s*(-?\d+(?:\.\d+)?)\s*)?\]\s*\)/g

function countMatches(pattern: RegExp, input: string): number {
  const matches = input.match(pattern)
  return matches ? matches.length : 0
}

function countContainsNearby(code: string, anchorPattern: RegExp, targetPattern: RegExp, windowSize = 240): number {
  let count = 0
  const anchors = code.matchAll(anchorPattern)
  for (const anchor of anchors) {
    if (anchor.index == null) {
      continue
    }
    const segment = code.slice(anchor.index, anchor.index + windowSize)
    if (targetPattern.test(segment)) {
      count += 1
    }
    targetPattern.lastIndex = 0
  }
  return count
}

function parseMaxLiteralFn(code: string): { highFnCount: number; maxFnLiteral: number | null } {
  let highFnCount = 0
  let maxFnLiteral: number | null = null
  const matches = code.matchAll(LITERAL_FN_PATTERN)
  for (const match of matches) {
    const value = Number(match[1])
    if (!Number.isFinite(value)) {
      continue
    }
    if (value >= 64) {
      highFnCount += 1
    }
    if (maxFnLiteral == null || value > maxFnLiteral) {
      maxFnLiteral = value
    }
  }
  return { highFnCount, maxFnLiteral }
}

function parseRangeLoopMetrics(code: string): { literalLoopProduct: number; maxLiteralLoopSpan: number } {
  let literalLoopProduct = 1
  let maxLiteralLoopSpan = 0
  let sawLoop = false

  const matches = code.matchAll(RANGE_LOOP_PATTERN)
  for (const match of matches) {
    const start = Number(match[1])
    const second = Number(match[2])
    const maybeEnd = match[3] != null ? Number(match[3]) : null
    if (![start, second, maybeEnd ?? 0].every((value) => Number.isFinite(value))) {
      continue
    }

    let loopSpan = 0
    if (maybeEnd == null) {
      const step = second >= start ? 1 : -1
      loopSpan = Math.floor(Math.abs((second - start) / step)) + 1
    } else {
      const step = second
      if (step === 0) {
        continue
      }
      loopSpan = Math.floor(Math.abs((maybeEnd - start) / step)) + 1
    }

    if (!Number.isFinite(loopSpan) || loopSpan <= 0) {
      continue
    }

    sawLoop = true
    literalLoopProduct *= loopSpan
    maxLiteralLoopSpan = Math.max(maxLiteralLoopSpan, loopSpan)
  }

  return {
    literalLoopProduct: sawLoop ? literalLoopProduct : 0,
    maxLiteralLoopSpan
  }
}

function estimateBooleanDepth(code: string): number {
  let depth = 0
  let maxDepth = 0
  const tokenPattern = /\b(?:union|difference|intersection)\s*\(|}/g

  for (const match of code.matchAll(tokenPattern)) {
    const token = match[0]
    if (token.endsWith('(')) {
      depth += 1
      maxDepth = Math.max(maxDepth, depth)
      continue
    }
    depth = Math.max(0, depth - 1)
  }

  return maxDepth
}

function buildReasonCodes(summary: Omit<RenderPreflightSummary, 'riskScore' | 'riskLevel' | 'recommendedRoute' | 'reasonCodes'>): string[] {
  const reasons: string[] = []

  if (summary.threadSignalCount > 0) reasons.push('thread_signals')
  if (summary.knurlSignalCount > 0) reasons.push('knurl_signals')
  if (summary.minkowskiCount > 0) reasons.push('minkowski_usage')
  if (summary.hullInLoopCount > 0) reasons.push('hull_in_loop')
  if (summary.booleanCount >= 40) reasons.push('many_booleans')
  if (summary.booleanDepthEstimate >= 6) reasons.push('deep_boolean_tree')
  if (summary.literalLoopProduct >= 120) reasons.push('large_literal_loops')
  if (summary.highFnCount > 0 || (summary.maxFnLiteral ?? 0) >= 96) reasons.push('high_facet_settings')
  if (summary.estimatedAssemblyInstances >= 20) reasons.push('large_assembly')
  if (summary.codeLength >= 12_000 || summary.lineCount >= 400) reasons.push('large_source')

  return reasons
}

export function analyzeOpenScadRenderRisk(code: string): RenderPreflightSummary {
  const normalized = code.replace(/\r\n/g, '\n')
  const lineCount = normalized.trim() ? normalized.split('\n').length : 0
  const moduleCount = countMatches(MODULE_PATTERN, normalized)
  const loopCount = countMatches(LOOP_PATTERN, normalized)
  const booleanCount = countMatches(BOOLEAN_PATTERN, normalized)
  const booleanDepthEstimate = estimateBooleanDepth(normalized)
  const minkowskiCount = countMatches(/\bminkowski\s*\(/g, normalized)
  const hullCount = countMatches(/\bhull\s*\(/g, normalized)
  const hullInLoopCount = countContainsNearby(normalized, LOOP_PATTERN, /\bhull\s*\(/g)
  const threadSignalCount = countMatches(THREAD_PATTERN, normalized)
  const knurlSignalCount = countMatches(KNURL_PATTERN, normalized)
  const { highFnCount, maxFnLiteral } = parseMaxLiteralFn(normalized)
  const { literalLoopProduct, maxLiteralLoopSpan } = parseRangeLoopMetrics(normalized)
  const transformCount = countMatches(TRANSFORM_PATTERN, normalized)
  const cylinderCount = countMatches(/\bcylinder\s*\(/g, normalized)
  const polyhedronCount = countMatches(/\b(polyhedron|surface|import)\s*\(/g, normalized)
  const estimatedAssemblyInstances = Math.max(
    countMatches(/\btranslate\s*\(/g, normalized),
    countMatches(/\brotate\s*\(/g, normalized),
    cylinderCount
  )
  const faLiteral = Number(FA_PATTERN.exec(normalized)?.[1] ?? NaN)
  FA_PATTERN.lastIndex = 0
  const fsLiteral = Number(FS_PATTERN.exec(normalized)?.[1] ?? NaN)
  FS_PATTERN.lastIndex = 0

  const partialSummary = {
    codeLength: normalized.length,
    lineCount,
    moduleCount,
    loopCount,
    booleanCount,
    booleanDepthEstimate,
    minkowskiCount,
    hullCount,
    hullInLoopCount,
    threadSignalCount,
    knurlSignalCount,
    highFnCount,
    maxFnLiteral,
    maxLiteralLoopSpan,
    literalLoopProduct,
    transformCount,
    cylinderCount,
    polyhedronCount,
    estimatedAssemblyInstances
  }

  let riskScore = 0
  riskScore += Math.min(36, threadSignalCount * 14)
  riskScore += Math.min(24, knurlSignalCount * 12)
  riskScore += Math.min(24, minkowskiCount * 16)
  riskScore += Math.min(32, hullInLoopCount * 20)
  riskScore += Math.min(16, Math.floor(booleanCount / 8) * 4)
  riskScore += Math.min(12, Math.max(0, booleanDepthEstimate - 2) * 2)
  riskScore += Math.min(16, Math.floor(literalLoopProduct / 40) * 4)
  riskScore += Math.min(12, highFnCount * 4)
  riskScore += maxFnLiteral != null && maxFnLiteral >= 128 ? 8 : 0
  riskScore += Number.isFinite(faLiteral) && faLiteral > 0 && faLiteral < 4 ? 6 : 0
  riskScore += Number.isFinite(fsLiteral) && fsLiteral > 0 && fsLiteral < 0.5 ? 6 : 0
  riskScore += Math.min(12, Math.floor(estimatedAssemblyInstances / 10) * 3)
  riskScore += normalized.length >= 20_000 ? 10 : normalized.length >= 12_000 ? 6 : 0
  riskScore += lineCount >= 700 ? 10 : lineCount >= 400 ? 6 : 0

  const reasonCodes = buildReasonCodes(partialSummary)
  const riskLevel = riskScore >= 55 ? 'high' : riskScore >= 25 ? 'medium' : 'low'
  const recommendedRoute = riskLevel === 'high' ? 'api' : 'wasm'

  return {
    ...partialSummary,
    riskScore,
    riskLevel,
    recommendedRoute,
    reasonCodes
  }
}

export function classifyRenderFailure(errorMessage: string, preflight?: RenderPreflightSummary): RenderFailureClass {
  const normalized = errorMessage.trim().toLowerCase()
  if (!normalized) {
    return 'unknown'
  }
  if (normalized.includes('no openscad code provided')) {
    return 'empty_input'
  }
  if (normalized.includes('timed out')) {
    return 'timeout'
  }
  if (
    normalized.includes('parser error') ||
    normalized.includes('syntax error') ||
    normalized.includes('parse error')
  ) {
    return 'syntax'
  }
  if (
    normalized.includes('memory') ||
    normalized.includes('out of memory') ||
    normalized.includes('cannot enlarge memory')
  ) {
    return 'memory'
  }
  if (
    normalized.includes('worker crashed') ||
    normalized.includes('message channel failed') ||
    /^\d+$/.test(normalized)
  ) {
    return 'worker_runtime'
  }
  if (
    normalized.includes('network') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('aborterror')
  ) {
    return 'network'
  }
  if (
    normalized.includes('not configured') ||
    normalized.includes('not found') ||
    normalized.includes('missing')
  ) {
    return 'configuration'
  }
  if (preflight && preflight.riskLevel === 'high') {
    return 'complexity'
  }
  if (
    normalized.includes('minkowski') ||
    normalized.includes('hull') ||
    normalized.includes('thread') ||
    normalized.includes('render failed')
  ) {
    return 'complexity'
  }
  return 'unknown'
}

export function buildUserFacingRenderMessage(
  failureClass: RenderFailureClass,
  preflight?: RenderPreflightSummary
): string {
  const reasons = new Set(preflight?.reasonCodes ?? [])

  if (failureClass === 'empty_input') {
    return 'No OpenSCAD code was provided for rendering.'
  }
  if (failureClass === 'syntax') {
    return 'OpenSCAD reported a syntax or parser error. Check for missing semicolons, braces, or invalid module calls.'
  }
  if (failureClass === 'timeout') {
    return 'This model exceeded the browser render budget. Dense threads, knurling, Minkowski rounding, or large assemblies are common causes.'
  }
  if (failureClass === 'memory') {
    return 'This render likely exceeded browser memory limits. Try simplifying detailed features or switching to server render.'
  }
  if (reasons.has('thread_signals')) {
    return 'Threaded geometry was detected. Browser preview works best with simplified threads or a server render for full detail.'
  }
  if (reasons.has('knurl_signals')) {
    return 'Knurled geometry was detected. Repeated grip features can overwhelm browser rendering; try a coarse preview or server render.'
  }
  if (reasons.has('minkowski_usage')) {
    return 'minkowski() on detailed geometry is expensive because it multiplies facet count. Use a simpler preview shape or server render.'
  }
  if (reasons.has('hull_in_loop')) {
    return 'hull() inside repeated loops was detected. That pattern often becomes too expensive for browser rendering.'
  }
  if (reasons.has('large_assembly')) {
    return 'This assembly contains many repeated detailed parts. Hide nonessential components or render a smaller subassembly first.'
  }
  if (failureClass === 'worker_runtime') {
    return 'The browser OpenSCAD worker failed before producing STL output. Retrying with a fresh worker or server render is recommended.'
  }
  if (failureClass === 'network') {
    return 'The server render fallback could not be reached. Check network connectivity or try browser rendering with a simpler model.'
  }
  if (failureClass === 'configuration') {
    return 'Rendering could not start because the configured render path is unavailable.'
  }
  return 'OpenSCAD could not render this model in the current browser path. Simplifying the geometry or switching render routes should help.'
}
