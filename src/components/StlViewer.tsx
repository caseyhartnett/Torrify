import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
/// <reference path="../types/three.d.ts" />
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'

interface StlViewerProps {
  stlBase64: string
}

export interface StlViewerHandle {
  captureImage: () => string | null
}

const StlViewer = forwardRef<StlViewerHandle, StlViewerProps>(({ stlBase64 }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<InstanceType<typeof THREE.WebGLRenderer> | null>(null)
  const cleanupRef = useRef<() => void>(() => {})

  useImperativeHandle(ref, () => ({
    captureImage: () => {
      const renderer = rendererRef.current
      if (!renderer) {
        return null
      }
      return renderer.domElement.toDataURL('image/png')
    }
  }), [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x252526)

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000)
    camera.position.set(120, 120, 120)

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(200, 200, 200)
    scene.add(directionalLight)

    const loader = new STLLoader()
    const arrayBuffer = base64ToArrayBuffer(stlBase64)
    const geometry = loader.parse(arrayBuffer)
    geometry.computeVertexNormals()

    const material = new THREE.MeshStandardMaterial({
      color: 0x9aa4b2,
      metalness: 0.1,
      roughness: 0.7,
    })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    // Center and frame the model
    const box = new THREE.Box3().setFromObject(mesh)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    mesh.position.sub(center)
    controls.target.set(0, 0, 0)

    const maxDim = Math.max(size.x, size.y, size.z)
    const distance = maxDim * 1.6
    camera.position.set(distance, distance, distance)
    camera.near = Math.max(0.1, distance / 100)
    camera.far = distance * 20
    camera.updateProjectionMatrix()
    controls.update()

    const resize = () => {
      const { clientWidth, clientHeight } = container
      if (clientWidth === 0 || clientHeight === 0) {
        return
      }
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(clientWidth, clientHeight)
    }

    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)

    let frameId: number
    const animate = () => {
      frameId = window.requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    cleanupRef.current = () => {
      window.cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      controls.dispose()
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement)
      }
    }

    return () => {
      cleanupRef.current()
    }
  }, [stlBase64])

  return <div ref={containerRef} data-testid="stl-viewer" className="w-full h-full" />
})

/**
 * Converts a base64-encoded string to an ArrayBuffer.
 * @param base64 - The base64 string to convert
 * @returns The decoded ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

export default StlViewer
