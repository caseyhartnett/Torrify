# Runtime Matrix

Torrify now ships in two runtime shapes: a fully local desktop app and a managed web app.

## At a Glance

| Capability | Web App | Desktop App |
| --- | --- | --- |
| OpenSCAD editing | Yes | Yes |
| OpenSCAD rendering | Yes, browser WASM or managed render API | Yes, local OpenSCAD |
| build123d backend | No | Yes |
| Local file open/save | Browser download/upload flow | Native file dialogs |
| Re-open recent files directly | No | Yes |
| Managed PRO gateway | Yes | Yes |
| BYOK providers | No | Yes |
| Ollama | No | Yes |
| Knowledge-base cloud updates | No | Yes |
| Works fully offline | No | Yes, with local tools configured |

## Web App

The web app is the fastest way to try Torrify:

- Managed gateway access is built in.
- OpenSCAD is the active CAD path.
- Browser-side rendering uses OpenSCAD WASM by default.
- A hosted render API can be used as a fallback for compatibility.
- Settings and optional license key are stored in browser storage on the current device.

Current limitations:

- No `build123d`
- No Ollama or other local-provider flows
- No direct native file reopen from the Recent list
- No custom knowledge-base update/reset workflow beyond bundled docs

## Desktop App

The desktop app is the full-power runtime:

- OpenSCAD and build123d are both supported.
- Native file open/save and recent-file reopen are available.
- BYOK providers, OpenRouter, Ollama, and managed PRO are supported.
- Local rendering and offline workflows are available once dependencies are installed.

## Which One Should I Use?

- Use the **web app** if you want the quickest entry point and managed AI access.
- Use the **desktop app** if you need local tooling, Python/build123d, Ollama, or richer file workflows.
