# Torrify - Development Handoff Document

Website: https://torrify.org

## Project Overview

### What is Torrify?

Torrify is an **AI-assisted desktop IDE for OpenSCAD** - a modern, Electron-based application that combines code editing, live 3D rendering, and AI chat assistance in a single unified interface.

### Project Motivation

**The Problem:**
- OpenSCAD is powerful but has a learning curve
- Existing tools lack modern IDE features
- No integrated AI assistance for learning/debugging
- Workflow is fragmented (code → render → iterate)

**The Solution:**
Torrify provides:
1. **Modern Code Editor** - Monaco (VS Code's editor) with syntax highlighting
2. **Live Rendering** - See your 3D models instantly as you code
3. **AI Chat** - Get help, explanations, and code suggestions (future LLM integration)
4. **Unified Workflow** - Everything in one window, no context switching

### Target Users

- Beginners learning OpenSCAD
- Experienced users wanting productivity boost
- Educators teaching 3D modeling
- Makers and designers who need quick iteration

### Tech Stack Rationale

- **Electron** - Cross-platform desktop with full system access
- **React + TypeScript** - Modern, type-safe UI development
- **Monaco Editor** - Industry-standard code editor (used in VS Code)
- **TailwindCSS** - Rapid UI development with consistent design
- **Vitest** - Fast, modern testing framework
- **Vite** - Lightning-fast build tool and dev server

---

## Current Status: Pre-release (0.9.3) ✅

**Version:** 0.9.3 (Pre-release; one more release before v1.0)
**Date:** February 2, 2026
**Status:** Security hardening complete, licensing finalized (GPLv3). Pre-release checklist completed and retired; code is release-ready (code signing deferred).
**Test Coverage:** Run `npm test` for the current count.
**Build Status:** ✅ All systems operational.
**Security:** Content Security Policy (CSP) implemented, IPC validation added, logging sanitized.

### Recent Updates (February 2, 2026)
- **Security Hardening**: Implemented Content Security Policy (CSP) to restrict renderer resources. Added comprehensive IPC input validation and file path sanitization.
- **Licensing**: Officially adopted **GPLv3** license. Added `LICENSE` file and updated package metadata.
- **Code Quality**: Added ESLint with React Hooks support and fixed all outstanding lint errors. Cleaned up production logging to prevent sensitive data leaks.
- **Documentation**: Updated support contact to `hello@torrify.org`. Pre-release checklist completed and retired (security and production readiness items done).
- **Cleanup**: Removed obsolete migration plans and redundant summaries. Created simplified `ARCHITECTURE.md` for users.

---

## Architecture Snapshot

### Repository Map

- `electron/` - Electron main process and preload bridge
- `src/` - Renderer app (React + TypeScript)
- `docs/` - Product, architecture, and developer documentation
- `resources/` - Bundled CAD API context files
- `scripts/` - Context generation helpers

### Core Runtime Layout

1. **Main Process** (`electron/main.ts`)
   - App lifecycle, windows, menus
   - IPC handlers for file ops, rendering, settings, context updates
   - Executes CAD backends (OpenSCAD, build123d)

2. **Preload Bridge** (`electron/preload.ts`)
   - Context bridge surface for renderer
   - Typed API exposed in `src/vite-env.d.ts`

3. **Renderer** (`src/`)
   - React UI and app state
   - LLM services for chat and code generation
   - Component layout: chat, editor, preview

### Key Directories (Renderer)

- `src/App.tsx` - App shell, state orchestration, IPC calls
- `src/components/` - UI panels, dialogs, modals
  - `ChatPanel.tsx` - Messages, input, streaming UI
  - `EditorPanel.tsx` - Monaco editor and render controls
  - `PreviewPanel.tsx` - Render preview and STL viewer
  - `SettingsModal.tsx` - Settings, backend selection, API keys
  - `HelpBot.tsx` - Documentation-driven help
  - `DemoDialog.tsx` - First-run demo flow
  - `WelcomeModal.tsx` - Intro/first-run gating
  - `StlViewer.tsx` - 3D viewer
- `src/services/llm/` - LLM provider integrations and prompts
- `src/services/cad/` - CAD backend interfaces for renderer use
- `src/test/` - Test setup and global mocks

### Key Directories (Main Process)

- `electron/cad/`
  - `OpenSCADService.ts` - CLI render pipeline, timeouts, file size checks
  - `Build123dService.ts` - Python execution wrapper for build123d
  - `types.ts` - Backend interfaces
- `electron/main.ts` - IPC handlers and file ops
- `electron/preload.ts` - Exposed APIs

---

## Runtime Data Flows

### Render Pipeline (OpenSCAD)

1. Renderer requests render via IPC
2. Main process writes code to temp file
3. OpenSCAD CLI executes with timeout
4. Output files validated by size
5. Results returned to renderer for preview

### Render Pipeline (build123d)

1. Renderer requests render via IPC
2. Main process writes Python file and wrapper
3. Python executes with timeout
4. Output STL validated by size
5. Results returned for preview

### Chat / LLM Flow

1. User input captured in `ChatPanel`
2. LLM provider selected in settings
3. System prompt assembled with:
   - Backend-specific guidance
   - Optional API context (from Knowledge Base)
4. Response streamed or returned
5. Code extracted and placed in editor

### Project Save/Load Flow

1. `.torrify` JSON saved by main process
2. Project includes code, chat, and assets
3. On load, state restored to renderer
4. Project validation checks structure + size

### Context Update Flow

1. User triggers cloud update in settings
2. Main process fetches context from HTTPS source
3. Size limits applied before saving
4. New context used in LLM prompts

---

## CAD Backends

### OpenSCAD

- CLI integration with headless render
- Execution timeout enforced
- Output files size-limited
- Executable path validated

### build123d

- Python execution with wrapper script
- Execution timeout enforced
- Output STL size-limited
- Backend-specific prompts and editor settings

### Shared Backend Interface

- `src/services/cad/types.ts` defines backend contract
- Backend selection stored in settings
- UI adapts to backend (file filters, language)

---

## LLM Providers

### Gemini

- BYOK model, API key stored in settings
- Supports streaming responses

### OpenRouter (PRO)

- BYOK in current client flow
- Streaming via SSE
- Prompt caching for supported models

### Ollama (Local)

- Local model endpoint configurable
- Default localhost endpoint

### Prompt Strategy

- System prompts include:
  - Code-CAD standards
  - Backend-specific rules
  - Optional API reference context
- Code extraction handles XML tags, fenced blocks, plain text

---

## UI Components (Key Notes)

### App Shell (`src/App.tsx`)

- Central state for code, render, chat, settings
- IPC orchestration for file ops and rendering
- Menu event handlers (native menu integration)

### Editor Panel

- Monaco editor
- Backend-aware language and tab size
- Render actions wired to backend

### Preview Panel

- Preview image + STL viewer
- Render refresh controls
- Error diagnosis integration

### Chat Panel

- Streaming UI with abort support
- Image attachments
- Help/diagnosis flows

---

## Settings and Persistence

### Settings

- Stored at `~/.torrify/settings.json`
- Migrates from legacy `~/.opencursor`
- Includes:
  - LLM provider and API keys
  - CAD backend selection
  - Recent files

### Recent Files

- Stored in settings with timestamps
- Includes `.torrify` projects and source files
- Deduped and capped list

---

## Tests

### Component Tests

- UI components in `src/components/__tests__/`
- Menu and dialog flows

### Service Tests

- LLM providers in `src/services/llm/__tests__/`
- CAD services in `src/services/cad/__tests__/`

### LLM Code Generation Suite

- 25 prompts x 2 backends
- Validates extraction and execution
- Supports mocked and real provider tests

---

## Documentation Pointers

- `docs/getting-started/START_HERE.md` - Entry point
- `docs/developer/DEV_README.md` - Dev workflows
- `docs/features/` - Feature deep dives
- `docs/security/SECURITY_AUDIT.md` - Current audit status
- `docs/history/` - Detailed session logs

---

## Security Posture (Summary)

### Implemented

- Context isolation and no node integration
- IPC surface limited to preload bridge
- File size limits and timeouts for CAD execution
- Project file validation
- BYOK model for API keys

### Outstanding Gaps (High/Medium Priority)

- IPC input validation and payload limits
- Path sanitization for user-provided file paths
- Logging hardening for production
- Endpoint validation (Ollama + context downloads)
- Content-Security-Policy for renderer

See `docs/security/SECURITY_AUDIT.md` for full details.

---

## Operational Notes

### Running and Testing

- Dev and test workflows are documented in `docs/developer/DEV_README.md`
- Use `npm test` for current counts and suites

### Release Considerations

- Ensure security gaps are resolved before public release
- Review git history hygiene guidance in `docs/security/SECURITY_AUDIT.md`

---

## Component Inventory (Expanded)

This section captures the primary modules and their responsibilities without the long session logs.

### App Shell and Panels

- `src/App.tsx`
  - Global app state and IPC orchestration
  - Routing of menu events to UI handlers
  - Manages current code, render state, and chat history
- `src/components/ChatPanel.tsx`
  - User input, messages, and streaming output
  - Image attachments in chat
  - LLM request initiation and response handling
- `src/components/EditorPanel.tsx`
  - Monaco editor integration
  - Backend-aware language selection
  - Render buttons and editor-level actions
- `src/components/PreviewPanel.tsx`
  - Render preview and refresh controls
  - Error display and AI diagnosis hook
- `src/components/StlViewer.tsx`
  - 3D viewport for STL rendering

### Settings and Help

- `src/components/SettingsModal.tsx`
  - Backend selection and provider configuration
  - API key inputs and validation rules
  - Knowledge Base tab for context updates
- `src/components/HelpBot.tsx`
  - LLM-driven help using documentation context
- `src/components/DemoDialog.tsx`
  - First-run demo flow
- `src/components/WelcomeModal.tsx`
  - Introductory first-run dialog gating

### LLM Services

- `src/services/llm/index.ts`
  - Provider factory selection
- `src/services/llm/types.ts`
  - Shared interfaces and streaming types
- `src/services/llm/prompts.ts`
  - System prompt construction
- `src/services/llm/GeminiService.ts`
  - Gemini API integration and streaming
- `src/services/llm/OpenRouterService.ts`
  - OpenRouter API integration and streaming
  - Prompt caching support
- `src/services/llm/OllamaService.ts`
  - Local LLM endpoint integration

### CAD Services (Main Process)

- `electron/cad/OpenSCADService.ts`
  - OpenSCAD CLI integration
  - Timeout and output size validation
- `electron/cad/Build123dService.ts`
  - Python execution wrapper for build123d
  - Timeout and output size validation
- `electron/cad/types.ts`
  - Backend interfaces

### CAD Services (Renderer)

- `src/services/cad/index.ts`
  - Renderer-side wrapper for backend selection
- `src/services/cad/types.ts`
  - CAD contract definitions

### Electron Core

- `electron/main.ts`
  - Window creation, app lifecycle
  - IPC handlers for render, file ops, settings, context updates
  - Menu configuration and event dispatch
- `electron/preload.ts`
  - Context bridge and exposed APIs

---

## Feature Map (Where Things Live)

### File Operations

- Dialogs and file IO in `electron/main.ts`
- Renderer handlers in `src/App.tsx`
- File types and filters are backend-aware

### Projects

- `.torrify` save/load logic in `electron/main.ts`
- Project validation in main process
- Renderer state restoration in `src/App.tsx`

### Streaming AI

- LLM streaming in `GeminiService` and `OpenRouterService`
- Streaming UI in `ChatPanel`
- Abort control via stream controller

### Knowledge Base / Context

- Bundled resources in `resources/`
- Generation scripts in `scripts/`
- Settings UI in `SettingsModal`
- IPC in `electron/main.ts`

### Menu Bar

- Native menu definitions in `electron/main.ts`
- Renderer listeners in `src/App.tsx`

---

## File Formats (Summary)

### Project Files (`.torrify`)

- JSON format
- Includes:
  - `version`
  - `code`
  - `stlBase64`
  - `chat` history

### Code Files

- OpenSCAD: `.scad`
- build123d: `.py`

### Context Resources

- Text files in `resources/`
- User overrides stored in app data directory

---

## IPC Surface (High Level)

The IPC surface is intentionally limited via the preload bridge. The key categories are:

- Rendering requests (STL and preview)
- File open/save and export flows
- Settings load/save
- Project save/load
- Documentation loading for Help Bot
- Knowledge Base context status and update
- Menu event dispatch

All new IPC additions should:
- Validate payload shape and size
- Guard file paths
- Provide safe error messages

---

## Testing Inventory (High Level)

### Component Tests

- `src/components/__tests__/ChatPanel.test.tsx`
- `src/components/__tests__/EditorPanel.test.tsx`
- `src/components/__tests__/PreviewPanel.test.tsx`
- `src/components/__tests__/SettingsModal.test.tsx`
- `src/components/__tests__/HelpBot.test.tsx`
- `src/components/__tests__/WelcomeModal.test.tsx`
- `src/components/__tests__/DemoDialog.test.tsx`

### Service Tests

- `src/services/llm/__tests__/GeminiService.test.ts`
- `src/services/llm/__tests__/OpenRouterService.test.ts`
- `src/services/llm/__tests__/prompts.test.ts`
- `src/services/llm/__tests__/index.test.ts`
- `src/services/cad/__tests__/cad.test.ts`
- `src/services/cad/__tests__/backend-connectivity.test.ts`

### LLM Code Generation Suite

- `src/services/llm/__tests__/code-generation.test.ts`
- `src/services/llm/__tests__/code-validation.ts`
- `src/services/llm/__tests__/test-prompts.ts`

---

## Data Model (Summary)

### Settings (High Level)

Settings are stored per-user and include:
- LLM provider selection and API keys
- CAD backend selection and tool paths
- Recent files and timestamps
- First-run and demo flags
- Knowledge Base metadata (context status)

### Project Files

Project save/load uses a JSON format that includes:
- `version`
- `code`
- `stlBase64`
- `chat` history
- Optional image attachments inside messages

### Chat Messages

Messages include:
- Role (user or assistant)
- Text content
- Optional image data URLs
- Optional metadata (e.g., timestamps)

---

## Component Notes (Detailed)

### ChatPanel

- Manages chat history and staged input
- Supports image attachments
- Initiates LLM calls through selected provider
- Handles streaming updates and aborts
- Extracts code blocks and forwards to editor
- Displays errors in a user-friendly way

### EditorPanel

- Hosts Monaco editor and editor settings
- Adjusts language and tab size for backend
- Connects render actions to IPC
- Shows render disabled state when no code

### PreviewPanel

- Shows preview images and STL viewer
- Provides render refresh controls
- Exposes AI diagnosis on render errors

### SettingsModal

- LLM provider selection and API key input
- CAD backend configuration and paths
- Knowledge Base update and status
- Persists settings via IPC

### HelpBot

- Loads documentation context from main process
- Runs LLM queries with docs context
- Presents answers in a modal dialog

### DemoDialog

- First-run demo flow
- Displays a guided example workflow

### WelcomeModal

- First-run gate for onboarding
- Controls initial entry to demo flow

---

## Service Notes (Detailed)

### GeminiService

- Handles BYOK Gemini requests
- Supports streaming output
- Applies system prompt and context

### OpenRouterService

- Handles BYOK OpenRouter requests
- Supports streaming output via SSE
- Prompt caching for supported models
- Provider selection by model ID

### OllamaService

- Targets local models
- Endpoint is user-configurable
- Used for offline and local workflows

### Prompt Construction

- Base system prompts encode Code-CAD rules
- Backend-specific prompt templates
- API context injected when available
- Current editor code injected when present

---

## IPC and Boundaries (Detailed)

### General Principles

- Renderer calls main process through preload APIs
- Inputs should be validated and size-limited
- File paths should be normalized and guarded
- Output should be sanitized for UI display

### Common IPC Categories

- Render commands for CAD backends
- File open/save/export dialogs
- Settings load/save
- Project save/load
- Context status and updates
- Documentation loading for help bot
- Menu events and app-level actions

---

## UX Behaviors (Notes)

### Backend Switching

- Backend changes reset chat and editor state
- ChatPanel remounts to refresh context
- Preview is cleared to avoid stale output

### Demo Flow

- One-time demo can be triggered via menu
- Demonstrates chat, editor, and preview together

### Error Diagnosis

- Render errors surface a "Diagnose" action
- Error content is sent to LLM for guidance

---

## Performance and Limits

### Execution Timeouts

- CAD backends enforce timeouts to avoid hangs
- Processes are cleaned up on timeout

### File Size Limits

- Output files capped for memory safety
- Project files size-limited before parsing

---

## Deployment Notes

### Local Storage

- Settings and user context stored in user data path
- Bundled context used when user overrides are missing

### Distribution

- Electron packaging tracked in docs
- Ensure consistent backend paths for users

---

## Known Gaps and Follow-ups

### High Priority

- Pro model proxy service
- IPC input validation and payload limits
- File path sanitization

### Medium Priority

- Logging hardening in production
- Endpoint validation for Ollama and context downloads
- Content-Security-Policy for renderer

---

## Feature Inventory (Expanded)

### Live Rendering

- UI: `EditorPanel` and `PreviewPanel`
- Main: render handlers in `electron/main.ts`
- Backends: OpenSCAD and build123d services

### AI Chat (BYOK)

- UI: `ChatPanel`
- Providers: Gemini and OpenRouter
- Prompts: backend-aware system rules

### PRO Models (OpenRouter)

- Provider: `OpenRouterService`
- Streaming supported
- Prompt caching for supported models

### Local LLM (Ollama)

- Provider: `OllamaService`
- Endpoint configurable in settings
- Local-first usage

### Project Save/Load

- Main: project load/save handlers
- Validation for structure and size
- Restores editor, chat, and preview

### File Operations

- Open/save dialogs in main process
- Backend-aware file filters
- Renderer state updates on open

### Recent Files

- Stored in settings
- Deduped with timestamps
- Includes project and code files

### Demo Flow

- First-run demo dialog
- Uses fixed content for reliability
- Menu action to re-run demo

### Help Bot

- Loads docs via IPC
- Uses LLM with documentation context
- Modal-based UI

### Knowledge Base

- Bundled context in `resources/`
- Update-from-cloud flow
- Settings UI for status

### Multi-Backend CAD

- OpenSCAD and build123d
- Backend-aware prompts and editor settings
- Path configuration per backend

### Streaming AI

- Gemini and OpenRouter streaming
- UI shows live token updates
- Abort controller supported

### Image Import

- Image attachments in chat
- Persisted in project files
- Preview thumbnails in UI

### Error Diagnosis

- Error button in PreviewPanel
- Sends error + code to LLM
- Results returned as guidance

### Native Menu Bar

- App menu wired in main process
- Renderer handles events
- Shortcuts for common actions

### Export Source and STL

- Export options in menu
- Backend-aware source file extension
- STL export from render results

### Backend-Switch Reset

- Clears chat/editor/preview on switch
- Remounts ChatPanel for clean state
- Prevents stale backend context

### LLM Code Generation Tests

- 25 prompts x 2 backends
- Extraction and execution validation
- Real API runs supported

---

## Key Files by Area

### Electron Main Process

- `electron/main.ts`
- `electron/preload.ts`
- `electron/cad/OpenSCADService.ts`
- `electron/cad/Build123dService.ts`
- `electron/cad/types.ts`
- `electron/cad/index.ts`

### Renderer Core

- `src/App.tsx`
- `src/main.tsx`
- `src/index.css`
- `src/vite-env.d.ts`

### Renderer Components

- `src/components/ChatPanel.tsx`
- `src/components/EditorPanel.tsx`
- `src/components/PreviewPanel.tsx`
- `src/components/StlViewer.tsx`
- `src/components/SettingsModal.tsx`
- `src/components/HelpBot.tsx`
- `src/components/DemoDialog.tsx`
- `src/components/WelcomeModal.tsx`

### LLM Services

- `src/services/llm/index.ts`
- `src/services/llm/types.ts`
- `src/services/llm/prompts.ts`
- `src/services/llm/GeminiService.ts`
- `src/services/llm/OpenRouterService.ts`
- `src/services/llm/OllamaService.ts`

### CAD Services (Renderer)

- `src/services/cad/index.ts`
- `src/services/cad/types.ts`

### Tests

- `src/components/__tests__/`
- `src/services/llm/__tests__/`
- `src/services/cad/__tests__/`
- `src/test/setup.ts`

### Scripts and Resources

- `scripts/generate-context.cjs`
- `scripts/generate-build123d-context.py`
- `resources/context_openscad.txt`
- `resources/context_build123d.txt`

---

## Detailed Timeline (Thematic)

### Bootstrapping and Structure

- Initial project scaffold for Electron + Vite
- TypeScript configs separated for renderer and main
- TailwindCSS and PostCSS setup
- Basic test harness with Vitest
- Git repo initialized with standard ignores

### Core Rendering

- OpenSCAD CLI integration in main process
- Temporary file strategy for render inputs/outputs
- Timeout enforcement for render processes
- Output size validation before loading
- Preview panel wired to render responses

### Editor and UI

- Monaco editor embedded in center panel
- Syntax highlighting and editor settings
- Three-column layout with shared header
- Toolbar actions for render and settings
- Preview panel with image and STL viewer

### CAD Backend Expansion

- build123d backend added
- Python execution wrapper and output handling
- Backend selection stored in settings
- Backend-aware editor language and tab size
- Backend-aware file dialogs and exports

### LLM and Chat

- Gemini provider added for BYOK
- OpenRouter provider added for PRO
- Ollama provider added for local models
- System prompts aligned to backend
- Code extraction supports multiple formats

### Streaming and UX

- Streaming responses in Gemini and OpenRouter
- Abort support for in-flight streams
- Visual streaming indicators in chat
- Render disabled when editor is empty
- Preview error diagnosis workflow

### Context and Knowledge Base

- Bundled API references added
- Context generator scripts for refresh
- Knowledge Base tab in settings
- Cloud update with size limits

### Files, Projects, and Persistence

- Open/save file operations
- Recent files with timestamped list
- Project save/load with validation
- Demo and Help Bot for onboarding
- Settings migration from legacy location

### Documentation

- Feature docs under `docs/features/`
- Getting started guides
- Developer notes and architecture summaries
- Security audit and roadmap updates

---

## Glossary

- **BYOK**: Bring Your Own Key for external LLM providers
- **PRO**: OpenRouter-backed paid model access
- **IPC**: Inter-process communication between renderer and main
- **Context**: API reference and prompt guidance injected into LLM
- **Backend**: CAD engine (OpenSCAD or build123d)
- **Renderer**: Electron UI process running React
- **Main**: Electron main process controlling OS access
- **Knowledge Base**: Local and remote context files
- **Project File**: `.torrify` JSON bundle of app state
- **Streaming**: Incremental LLM response delivery

---

## Work Log (Condensed)

The detailed session logs were moved to `docs/history/` to keep this handoff concise:
- `docs/history/SESSION_SUMMARY.md`
- `docs/history/EXPLORATION_SUMMARY.md`
- `docs/history/FILES_CREATED.txt`

### January 24, 2026
- Project bootstrap (Electron, Vite, React, TypeScript, Tailwind, Vitest)
- Core Electron pipeline: window management, IPC, OpenSCAD rendering, temp file handling
- 3-panel UI with Monaco editor, preview panel, and chat panel
- Settings modal, BYOK Gemini integration, initial security fixes, baseline tests
- File operations (open/save) and recent files list
- First-run demo and Help Bot with documentation context
- Multi-backend CAD support (OpenSCAD + build123d) with backend-aware prompts/editor
- Native menu bar and AI error diagnosis flow

#### Key files touched (high level)
- `electron/main.ts` - IPC handlers, dialogs, render pipeline, menus
- `electron/preload.ts` - Context bridge API
- `electron/cad/OpenSCADService.ts` - OpenSCAD render flow
- `electron/cad/Build123dService.ts` - build123d wrapper execution
- `src/App.tsx` - App state and wiring
- `src/components/ChatPanel.tsx` - Chat UI and message handling
- `src/components/EditorPanel.tsx` - Monaco editor, render actions
- `src/components/PreviewPanel.tsx` - Preview and STL rendering
- `src/components/StlViewer.tsx` - 3D viewer
- `src/components/SettingsModal.tsx` - Settings UI
- `src/components/DemoDialog.tsx` - Demo flow
- `src/components/HelpBot.tsx` - Help bot
- `src/components/WelcomeModal.tsx` - First run
- `src/services/llm/GeminiService.ts` - LLM integration
- `src/services/llm/prompts.ts` - System prompts
- `src/services/cad/index.ts` - Renderer CAD service interface
- `src/vite-env.d.ts` - Electron API typing
- `src/test/setup.ts` - Test mocks
- `src/components/__tests__/` - Component tests

#### Notable decisions
- Monaco as the core editor with backend-aware settings
- IPC boundaries via preload with typed APIs
- CLI-based render for OpenSCAD; Python execution for build123d
- BYOK model for AI usage
- Project files stored as `.torrify` JSON

### February 2, 2026
- **Security & Hardening**:
  - Implemented Content Security Policy (CSP) in `index.html` and `main.ts` to restrict script/style injection and external resource loading.
  - Added rigorous IPC input validation (Zod schemas) for all renderer-to-main communications.
  - Implemented file path sanitization to prevent directory traversal attacks.
  - sanitized production logging to avoid leaking sensitive data (API keys, file paths) in non-dev environments.
- **Licensing & Compliance**:
  - Switched project license to **GPLv3**.
  - Added `LICENSE` file.
  - Updated `package.json` license field and author contact.
- **Quality Assurance**:
  - Configured ESLint with React Hooks plugin.
  - Fixed all outstanding linting errors in `src/` and `electron/`.
  - Expanded test coverage for security functions.
- **Documentation**:
  - Updated support email to `hello@torrify.org`.
  - Created `docs/architecture/ARCHITECTURE.md` for high-level user overview.
  - Cleaned up obsolete migration docs.
  - Pre-release checklist completed and retired (security verification items done).

#### Key files touched
- `electron/main.ts` - CSP, IPC validation, logging
- `src/App.tsx` - Lint fixes
- `package.json` - License update, eslint deps
- `LICENSE` - New file
- `docs/architecture/ARCHITECTURE.md` - New file

#### Notable decisions
- Adopted strict CSP to prevent XSS, allowing only necessary sources (self, data:, blob:).
- Enforced GPLv3 to ensure the project remains open source and derivative works share improvements.

### January 25, 2026
- Context/Knowledge Base system with bundled resources + cloud updates
- UX improvements (disable render when empty, backend-aware dialogs, project recents)
- Image import in chat with project persistence
- Docs updates and bug fixes (demo, backend-aware export)
- Streaming AI for Gemini/OpenRouter + UI controls
- LLM code generation test suite (25 prompts × 2 backends) with execution validation
- OpenRouter prompt caching for PRO models (static block caching)
- Backend-switch clear state fix
- Security audit refreshed with outstanding gaps (proxy, IPC validation, path sanitization, logging, endpoint validation, CSP)

#### Key files touched (high level)
- `resources/context_openscad.txt` - Bundled OpenSCAD API reference
- `resources/context_build123d.txt` - Bundled build123d API reference
- `scripts/generate-context.cjs` - Context generator
- `scripts/generate-build123d-context.py` - build123d introspection
- `src/services/llm/OpenRouterService.ts` - Streaming and caching
- `src/services/llm/types.ts` - Streaming types
- `src/services/llm/__tests__/` - Provider tests
- `src/components/ChatPanel.tsx` - Streaming UI, images
- `src/components/PreviewPanel.tsx` - Diagnose button
- `src/components/SettingsModal.tsx` - Knowledge Base tab
- `src/services/llm/__tests__/code-generation.test.ts` - Test suite
- `src/services/llm/__tests__/code-validation.ts` - Execution validation
- `src/services/llm/__tests__/test-prompts.ts` - Prompt set
- `docs/security/SECURITY_AUDIT.md` - Audit refresh
- `docs/NEXT_STEPS.md` - Roadmap and priorities

#### Notable decisions
- Context loading from bundled resources with optional cloud update
- Streaming in both Gemini and OpenRouter
- Prompt caching for OpenRouter PRO where supported
- Reset UI state on backend change to avoid stale context

*End of Handoff Document*
