import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig(() => {
  const isWebTarget = process.env.VITE_RUNTIME_TARGET === 'web'
  const projectRoot = path.dirname(fileURLToPath(import.meta.url))
  const webApiStubPath = path.resolve(projectRoot, 'src/platform/web/electronAPI.stub.ts')

  return {
    define: {
      __WEB_RUNTIME__: JSON.stringify(isWebTarget),
    },
    resolve: {
      alias: isWebTarget
        ? []
        : [
            {
              find: /^\.\/platform\/web\/electronAPI$/,
              replacement: webApiStubPath
            }
          ]
    },
    build: {
      outDir: isWebTarget ? 'dist-web' : 'dist',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('openscad-wasm')) {
                return 'openscad-wasm'
              }
              if (id.includes('@monaco-editor/react') || id.includes('/monaco-editor/')) {
                return 'monaco'
              }
              if (
                id.includes('three/examples/jsm/controls/OrbitControls') ||
                id.includes('three/examples/jsm/loaders/STLLoader')
              ) {
                return 'three-extras'
              }
              if (id.includes('/three/')) {
                return 'three-core'
              }
              if (id.includes('/react/') || id.includes('/react-dom/')) {
                return 'react-vendor'
              }
            }
          }
        }
      }
    },
    worker: {
      format: 'es'
    },
    plugins: [
      react(),
      ...(
        isWebTarget
          ? []
          : [
              electron([
                {
                  // Main process
                  entry: 'electron/main.ts',
                },
                {
                  // Preload scripts
                  entry: 'electron/preload.ts',
                  onstart(options) {
                    options.reload()
                  },
                },
              ]),
              renderer(),
            ]
      ),
    ],
    server: {
      port: 5173,
    },
  }
})
