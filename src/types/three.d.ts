declare module 'three' {
  export class Object3D {
    add(...objects: Object3D[]): this
  }
  export class Camera extends Object3D {}
  export class Scene extends Object3D {
    background: Color | null
  }
  export class WebGLRenderer {
    constructor(params?: { antialias?: boolean; preserveDrawingBuffer?: boolean })
    domElement: HTMLCanvasElement
    setPixelRatio(ratio: number): void
    setSize(width: number, height: number): void
    render(scene: Scene, camera: Camera): void
    dispose(): void
  }
  export class PerspectiveCamera extends Camera {
    constructor(fov: number, aspect: number, near: number, far: number)
    position: Vector3
    aspect: number
    near: number
    far: number
    updateProjectionMatrix(): void
  }
  export class Color {
    constructor(color?: number | string)
  }
  export class AmbientLight extends Object3D {
    constructor(color?: number | string, intensity?: number)
  }
  export interface DirectionalLightShadowCamera {
    near: number
    far: number
    left: number
    right: number
    top: number
    bottom: number
  }
  export interface DirectionalLightShadow {
    mapSize: { width: number; height: number }
    camera: DirectionalLightShadowCamera
  }
  export class DirectionalLight extends Object3D {
    constructor(color?: number | string, intensity?: number)
    position: Vector3
    castShadow: boolean
    shadow: DirectionalLightShadow
  }
  export class MeshStandardMaterial {
    constructor(params?: { color?: number | string; metalness?: number; roughness?: number; opacity?: number; transparent?: boolean; vertexColors?: boolean })
    dispose(): void
  }
  export class Mesh extends Object3D {
    constructor(geometry?: BufferGeometry, material?: MeshStandardMaterial)
    position: Vector3
  }
  export class Box3 {
    setFromObject(object: Object3D): Box3
    getCenter(target: Vector3): Vector3
    getSize(target: Vector3): Vector3
  }
  export class Vector3 {
    x: number
    y: number
    z: number
    constructor(x?: number, y?: number, z?: number)
    set(x: number, y: number, z: number): this
    sub(v: Vector3): this
  }
  export class BufferGeometry {
    computeVertexNormals(): void
    dispose(): void
    hasColors?: boolean
    alpha?: number
  }
  export class Float32BufferAttribute {}
  export class BufferAttribute {}
  export class NormalBufferAttribute {}
  export const DoubleSide: number
  export const SRGBColorSpace: number
  export const ACESFilmicToneMapping: number
  export const ColorManagement: { enabled: boolean }
}
declare module 'three/examples/jsm/controls/OrbitControls' {
  export class OrbitControls {
    constructor(camera: import('three').Camera, domElement: HTMLElement)
    enableDamping: boolean
    dampingFactor: number
    target: { set: (x: number, y: number, z: number) => void }
    update: () => void
    dispose: () => void
  }
}
declare module 'three/examples/jsm/loaders/STLLoader' {
  export class STLLoader {
    parse: (data: ArrayBuffer) => import('three').BufferGeometry
  }
}
