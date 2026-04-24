import { performance } from 'node:perf_hooks'
import { createOpenSCAD } from 'openscad-wasm'

function buildRecorder() {
  const logs = []
  return {
    print(text) {
      if (typeof text === 'string' && text.trim()) logs.push(text.trim())
    },
    printErr(text) {
      if (typeof text === 'string' && text.trim()) logs.push(text.trim())
    },
    tail(count = 8) {
      return logs.slice(-count)
    }
  }
}

async function runCase(name, code) {
  const recorder = buildRecorder()
  const runtime = await createOpenSCAD({
    print: recorder.print,
    printErr: recorder.printErr
  })
  const startedAt = performance.now()
  try {
    const stl = await runtime.renderToStl(code)
    return {
      name,
      success: true,
      durationMs: Math.round(performance.now() - startedAt),
      stlBytes: Buffer.byteLength(stl, 'utf8'),
      logTail: recorder.tail()
    }
  } catch (error) {
    return {
      name,
      success: false,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
      logTail: recorder.tail()
    }
  }
}

async function runWarmReuseCase() {
  const recorder = buildRecorder()
  const runtime = await createOpenSCAD({
    print: recorder.print,
    printErr: recorder.printErr
  })

  const results = []
  for (const [name, code] of [
    ['cube_first', 'cube([10,10,10]);'],
    ['sphere_second', 'sphere(8);'],
    ['cylinder_third', 'cylinder(h=12, r=3, $fn=20);']
  ]) {
    const startedAt = performance.now()
    try {
      const stl = await runtime.renderToStl(code)
      results.push({
        name,
        success: true,
        durationMs: Math.round(performance.now() - startedAt),
        stlBytes: Buffer.byteLength(stl, 'utf8'),
        logTail: recorder.tail(4)
      })
    } catch (error) {
      results.push({
        name,
        success: false,
        durationMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
        logTail: recorder.tail(8)
      })
    }
  }

  return {
    name: 'warm_instance_reuse',
    success: results.every((result) => result.success),
    steps: results
  }
}

const reproCases = [
  {
    name: 'baseline_cube',
    code: 'cube([10,10,10]);'
  },
  {
    name: 'minkowski_heavy',
    code: `
$fn = 28;
minkowski() {
  cube([24,24,10], center=true);
  sphere(r=1.4);
}
`
  },
  {
    name: 'hull_loop_medium',
    code: `
$fn = 18;
for (i=[0:18]) {
  hull() {
    rotate([0,0,i*20]) translate([14,0,i*0.8]) sphere(r=1.2);
    rotate([0,0,(i+1)*20]) translate([14,0,(i+1)*0.8]) sphere(r=1.2);
  }
}
`
  },
  {
    name: 'thread_preview_medium',
    code: `
$fn = 28;
linear_extrude(height=36, twist=1440, slices=180)
  translate([8,0,0]) square([2.2,1.1], center=true);
`
  },
  {
    name: 'knurled_knob_medium',
    code: `
$fn = 42;
module tooth(angle_deg, z_mm) {
  rotate([0,0,angle_deg])
    translate([10,0,z_mm])
      cube([1.6,1.2,1.6], center=true);
}

difference() {
  cylinder(h=24, r=10, center=true);
  for (a=[0:20:340], z=[-10:4:10]) tooth(a, z);
}
`
  },
  {
    name: 'assembly_fasteners_25',
    code: `
$fn = 24;
module bolt_like() {
  union() {
    cylinder(h=18, r=2);
    translate([0,0,18]) cylinder(h=4, r=4.2, $fn=24);
  }
}

union() {
  cube([110,60,8], center=true);
  for (x=[-40,-20,0,20,40], y=[-20,-10,0,10,20]) {
    translate([x,y,4]) bolt_like();
  }
}
`
  }
]

const results = []
results.push(await runWarmReuseCase())
for (const reproCase of reproCases) {
  results.push(await runCase(reproCase.name, reproCase.code))
}

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2))
