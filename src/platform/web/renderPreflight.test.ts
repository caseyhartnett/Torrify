import { describe, expect, it } from 'vitest'
import {
  analyzeOpenScadRenderRisk,
  buildUserFacingRenderMessage,
  classifyRenderFailure
} from './renderPreflight'

describe('renderPreflight', () => {
  it('keeps a simple cube in the low-risk wasm path', () => {
    const summary = analyzeOpenScadRenderRisk('cube([10, 10, 10]);')

    expect(summary.riskLevel).toBe('low')
    expect(summary.recommendedRoute).toBe('wasm')
    expect(summary.reasonCodes).toEqual([])
  })

  it('pushes thread-heavy models toward api fallback', () => {
    const summary = analyzeOpenScadRenderRisk(`
thread_pitch_mm = 1.5;
$fa = 2;
$fs = 0.25;
$fn = 128;
for (turn=[0:1:120]) {
  hull() {
    rotate([0,0,turn*12]) translate([10,0,turn]) sphere(1);
    rotate([0,0,(turn+1)*12]) translate([10,0,turn+1]) sphere(1);
  }
}
`)

    expect(summary.riskLevel).toBe('high')
    expect(summary.recommendedRoute).toBe('api')
    expect(summary.reasonCodes).toContain('thread_signals')
    expect(summary.reasonCodes).toContain('hull_in_loop')
    expect(summary.reasonCodes).toContain('high_facet_settings')
  })

  it('classifies syntax and timeout failures distinctly', () => {
    expect(classifyRenderFailure('ERROR: Parser error: syntax error in file, line 23')).toBe('syntax')
    expect(classifyRenderFailure('OpenSCAD WASM render timed out after 45s')).toBe('timeout')
  })

  it('builds user-facing advice from the risky geometry signals', () => {
    const summary = analyzeOpenScadRenderRisk(`
module knurled_knob() {}
module thread_profile() {}
minkowski() { cylinder(h=10, r=4); sphere(1); }
`)

    const message = buildUserFacingRenderMessage('complexity', summary)
    expect(message.toLowerCase()).toContain('thread')
  })
})
