# Architecture

## Overview

Torrify ships as both a managed web app and a desktop app. The product shares one React application shell and most UI logic, while runtime adapters handle the differences between browser capabilities and Electron/local-system capabilities.

## Runtime Shapes

### Web App

- Static Vite frontend
- Browser-side runtime adapter in place of the Electron preload bridge
- Managed AI gateway access
- OpenSCAD rendering through a browser worker, with optional managed render API fallback

### Desktop App

- Electron main process, preload bridge, and renderer
- Local filesystem access, native dialogs, and recent-file workflows
- OpenSCAD and build123d execution through local tooling
- Managed PRO, BYOK providers, and Ollama support

## Tech Stack

- **React + TypeScript**: Shared UI and application logic
- **Vite**: Build tool and runtime target selection
- **Electron**: Desktop shell and local-system integration
- **Monaco Editor**: Code editing
- **Three.js**: STL preview
- **OpenSCAD / build123d**: CAD backends

## Project Structure

```text
torrify/
├── electron/                # Desktop main process, preload bridge, IPC handlers
├── src/                     # Shared renderer app, components, hooks, services
├── public/                  # Browser-served assets and bundled context for web builds
├── resources/               # Bundled assets used by desktop packaging
├── docs/                    # Product, developer, and reference documentation
└── scripts/                 # Build and generation scripts
```

## Core Architecture Layers

### 1. Shared UI Layer

- React app shell
- editor, chat, settings, and preview panes
- shared state management for code, messages, projects, and rendering

### 2. Runtime Adapter Layer

- **Desktop**: typed `window.electronAPI` bridge provided by Electron preload
- **Web**: browser implementation of the same surface for files, chat, settings, and rendering
- keeps most product logic runtime-agnostic

### 3. Execution Layer

- **Desktop**: local CAD engines, local files, local settings, optional local AI
- **Web**: browser storage, managed gateway calls, WASM rendering, optional managed render fallback

## Key Workflows

### Rendering

- **Web**: renderer -> web runtime adapter -> OpenSCAD worker or render API -> STL preview
- **Desktop**: renderer -> IPC -> Electron main process -> OpenSCAD/build123d execution -> STL preview

### AI Chat

- **Web**: renderer -> managed gateway
- **Desktop**: renderer -> managed gateway, BYOK provider, or Ollama depending on settings

### Project Files

- `.torrify` files capture workspace state, including code, chat history, and backend selection
- web uses browser upload/download flows
- desktop uses native file dialogs and recent-file integration

## Data Storage

- **Desktop settings**: `~/.torrify/settings.json` or the Windows equivalent
- **Desktop logs**: `~/.torrify/logs/` or platform-specific app data
- **Web settings**: browser local storage on the current device/profile
- **Project files**: `.torrify` JSON files across both runtimes

## Security Model

### Desktop

- context isolation enabled
- Node integration disabled in the renderer
- strict IPC validation between renderer and main process
- local credentials remain on the user's machine unless explicitly sent to a configured provider

### Web

- no direct OS access from the browser runtime
- strict CSP for the hosted frontend
- managed gateway boundaries for chat requests
- browser-local settings and optional license-key storage
