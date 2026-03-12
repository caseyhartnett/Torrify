# Developer Guide

Welcome to the Torrify developer documentation.

## 🚀 Quick Start

### Prerequisites
*   **Node.js 18+**
*   **OpenSCAD** (for default backend)
*   **Python 3.10+** (for build123d backend)

### Setup & Run
```bash
# Install dependencies
npm install

# Start development server (Renderer + Electron)
npm run electron:dev
```

### Testing
```bash
# Run all tests
npm test

# Watch mode (recommended)
npm run test:watch
```

## 📜 Command Reference

| Command | Description |
|---------|-------------|
| `npm run electron:dev` | Start app in development mode with hot reload. |
| `npm run dev` | Start Vite server only (headless, for browser checks). |
| `npm run dev:web` | Start Vite in managed web runtime mode. |
| `npm run build` | Build renderer and main process for production. |
| `npm run build:web` | Build static web bundle to `dist-web` (no Electron runtime plugins). |
| `npm run test:e2e` | Run Playwright smoke tests against the managed web runtime. |
| `npm run package` | Create installer for current OS. |
| `npm run package:publish` | Build installer and publish release metadata/artifacts for auto-update. |
| `npm run package:win` | Create Windows installer (requires Developer Mode). |
| `electron . --reset-settings` | Launch app and wipe settings to defaults. |

## 🏗️ Architecture
See [Architecture Guide](../architecture/ARCHITECTURE.md) for a high-level overview.
For a user-facing desktop-vs-web breakdown, see [Runtime Matrix](../reference/RUNTIME_MATRIX.md).

### Directory Structure
*   **`electron/`**: Main process (Node.js). Handles OS interaction, file I/O, and CAD spawning.
*   **`src/`**: Renderer process (React). Handles UI, Monaco Editor, and LLM logic.
*   **`resources/`**: Bundled assets (e.g., API context files).

## 📦 Building & Packaging

Torrify uses `electron-builder`.

### Windows Requirements
You **must** enable **Developer Mode** in Windows Settings > Privacy & Security > For developers. This is required because the build process handles symbolic links.

### Build Commands
```bash
# Build for current OS
npm run package

# Build and publish (required for in-app auto-updates)
# Requires GH_TOKEN with repo release permissions
npm run package:publish

# Build for specific OS (must be run on that OS)
npm run package:win
npm run package:mac
npm run package:linux
```

## 🛠️ Common Tasks

### Reset Settings
To test the "First Run" experience:
```bash
electron . --reset-settings
```

### Adding an LLM Provider
1.  Create a service in `src/services/llm/`.
2.  Implement the `LLMService` interface.
3.  Register it in `src/services/llm/index.ts`.

### Debugging
*   **Renderer**: Use Chrome DevTools (opens automatically in dev mode).
*   **Main Process**: Logs appear in the terminal.
*   **IPC**: Monitor the Network tab in DevTools or console logs.

## 🐛 Troubleshooting

*   **"OpenSCAD not found"**: Check `~/.torrify/settings.json` or use the Settings UI.
*   **Build fails on Windows**: Ensure Developer Mode is enabled.
*   **Port 5173 in use**: Change port in `vite.config.ts`.
