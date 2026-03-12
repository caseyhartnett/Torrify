# Frequently Asked Questions

## General

### What is Torrify?

Torrify is an AI-assisted IDE for 3D CAD modeling. It combines a code editor, live 3D preview, and chat assistant to help you generate and refine OpenSCAD and build123d code.

### Is Torrify free?

Torrify is open-source software (GPLv3), but AI usage depends on the path you choose.

- **Web app**: managed usage path, with an optional license key for higher limits
- **Desktop BYOK**: use your own provider keys for services like Gemini or OpenRouter
- **Desktop local AI**: use Ollama for local workflows

### What platforms are supported?

Torrify supports:

- **Web**: managed browser app for the easiest starting experience
- **Desktop**: Windows, macOS, and Linux for the fullest feature set

## Technical

### Which CAD engines are supported?

- **OpenSCAD**
  - Web: supported without a local OpenSCAD install
  - Desktop: supported through a local OpenSCAD installation
- **build123d**
  - Desktop only
  - Requires Python 3.10+ and the `build123d` library

### Is every feature available on the web app?

No. The web app is intentionally narrower than the desktop app today. It focuses on managed OpenSCAD workflows and does not currently support build123d, Ollama, or native recent-file reopen. See the [Runtime Matrix](./RUNTIME_MATRIX.md).

### Where are my settings stored?

- **Desktop**: a JSON file in your home directory
  - Windows: `C:\Users\<Username>\.torrify\settings.json`
  - macOS/Linux: `~/.torrify/settings.json`
- **Web**: browser local storage on the current device/browser profile

### Can I use Torrify offline?

- **Desktop**: yes, once your local tools are configured. Local rendering and Ollama-based chat can work without internet access.
- **Web**: no, the hosted runtime depends on browser access to the deployed app and its managed services.

## Troubleshooting

### Why isn't my code rendering?

1. Check the preview and chat panels for error details.
2. Ensure you have the correct backend selected in **Settings > General**.
3. On desktop, verify that your CAD engine path (OpenSCAD or Python) is correct in **Settings**.

### The AI says "API key not configured"

On desktop, go to **Settings > AI Configuration** and ensure you selected a valid provider flow and entered the required key, or enabled Ollama.
