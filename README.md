# Torrify

<p align="center">
  <img src="docs/assets/logo.png" alt="Torrify logo" width="160" />
</p>

<p align="center"><strong>AI-assisted CAD IDE for parametric 3D modeling on web and desktop</strong></p>

<p align="center">
  Build 3D models with OpenSCAD or build123d, with an editor, AI assistant, and 3D preview in one app.
</p>

<p align="center">
  <a href="https://github.com/caseyhartnett/torrify/actions/workflows/build-installers.yml"><img src="https://github.com/caseyhartnett/torrify/actions/workflows/build-installers.yml/badge.svg" alt="Build" /></a>
  <a href="https://codecov.io/gh/caseyhartnett/torrify"><img src="https://codecov.io/gh/caseyhartnett/torrify/graph/badge.svg" alt="Coverage" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPLv3-blue.svg" alt="License: GPLv3" /></a>
</p>

<p align="center">
  <img src="docs/assets/TorrifyDemo.gif" alt="Torrify demo" width="900" />
</p>

## What Torrify Is

Torrify helps you design parametric 3D models from code, with AI assistance when you want it.

- Works with `OpenSCAD` (recommended default) and `build123d` (Python backend)
- Includes code editor, chat assistant, and 3D preview
- Lets you save and reload project state with `.torrify` files
- Runs as a desktop app (Windows, macOS, Linux) and as a managed web app

## Who This Is For

- Makers and hobbyists learning CAD scripting
- Developers who want faster model iteration
- Teams prototyping scripted geometry workflows

No advanced setup is required for basic usage.

## Choose Your Runtime

- **Web app**: managed gateway access, OpenSCAD-focused, browser rendering
- **Desktop app**: full local setup, OpenSCAD + build123d, local file workflows, Ollama/BYOK
- Full capability breakdown: [`docs/reference/RUNTIME_MATRIX.md`](docs/reference/RUNTIME_MATRIX.md)

## What You Need Before You Start

### Web App

- A modern desktop browser
- Access to the deployed Torrify web app
- Optional: a PRO license key for higher managed usage limits

### Desktop App

- A desktop computer (Windows, macOS, or Linux)
- Torrify app installer from GitHub Releases
- OpenSCAD installed on your system
- Optional: an AI provider account/key (Gemini or OpenRouter), or local Ollama

## Quick Start (Non-Technical)

### 1. Open Torrify

Choose one:

- **Web**: open the hosted web app in your browser
- **Desktop**: install the latest release from [GitHub Releases](https://github.com/caseyhartnett/torrify/releases)

Desktop install options:

- Windows: install the `.exe`
- macOS: open the `.dmg` and drag to Applications
- Linux: mark the `.AppImage` as executable, then run it

### 2. Install OpenSCAD (required)

Desktop users should download OpenSCAD from <https://openscad.org/downloads.html>.

Web users do not need a local OpenSCAD install.

### 3. Open Torrify and configure Settings

In `Settings`:

- Desktop: set `OpenSCAD Path` to your OpenSCAD executable
- Desktop: optionally set an AI provider (`Gemini`, `OpenRouter`, or `Ollama`)
- Web: managed gateway mode is used automatically
- Add API key or PRO license key if your chosen path requires one
- Your settings are saved locally on your machine or browser

### 4. Test with your first model

Paste this into the editor and render:

```scad
cube([20, 20, 20]);
```

If the 3D preview updates, your setup is working.

## Optional Setup

### Use build123d (Python backend)

If you prefer Python-based CAD:

```bash
pip install build123d
```

Then set `Python Path` in `Settings` and switch backend.

### Use AI fully local with Ollama

If you do not want cloud AI providers, use Ollama locally. See:

- [`docs/features/LLM_INTEGRATION.md`](docs/features/LLM_INTEGRATION.md)

## If You Get Stuck

- Installation help: [`docs/getting-started/installation.md`](docs/getting-started/installation.md)
- Step-by-step first run: [`docs/getting-started/QUICKSTART.md`](docs/getting-started/QUICKSTART.md)
- Common errors: [`docs/getting-started/TROUBLESHOOTING.md`](docs/getting-started/TROUBLESHOOTING.md)

## Build From Source (Developers)

```bash
git clone https://github.com/caseyhartnett/torrify.git
cd torrify
npm install
npm run electron:dev
```

Useful commands:

- `npm run lint` run ESLint
- `npm test` run test suite
- `npm run test:coverage` generate coverage report
- `npm run dev:web` run the managed web runtime locally
- `npm run build:web` build the static web app bundle
- `npm run package` build installer for current OS
- `npm run package:publish` publish a release for in-app auto-update (requires `GH_TOKEN`)
- `npm run docs:dev` run docs locally

## Documentation Map

### Start Here

- Docs home: [`docs/index.md`](docs/index.md)
- Getting started overview: [`docs/getting-started/index.md`](docs/getting-started/index.md)

### Product Docs

- Features overview: [`docs/features/overview.md`](docs/features/overview.md)
- CAD backends: [`docs/features/CAD_BACKENDS.md`](docs/features/CAD_BACKENDS.md)
- AI integration: [`docs/features/LLM_INTEGRATION.md`](docs/features/LLM_INTEGRATION.md)
- Settings: [`docs/features/SETTINGS.md`](docs/features/SETTINGS.md)
- FAQ: [`docs/reference/faq.md`](docs/reference/faq.md)
- Runtime matrix: [`docs/reference/RUNTIME_MATRIX.md`](docs/reference/RUNTIME_MATRIX.md)

### Technical Docs

- Developer docs: [`docs/developer/index.md`](docs/developer/index.md)
- Web deployment: [`docs/developer/WEB_DEPLOYMENT.md`](docs/developer/WEB_DEPLOYMENT.md)
- Architecture: [`docs/architecture/index.md`](docs/architecture/index.md)
- Security docs: [`docs/security/index.md`](docs/security/index.md)

## Community and Support

- Contributing guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Code of conduct: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- Security policy: [`SECURITY.md`](SECURITY.md)
- Issues: <https://github.com/caseyhartnett/torrify/issues>
- Contact: <hello@torrify.org>

## License

Torrify is licensed under the [GNU General Public License v3.0](LICENSE).
