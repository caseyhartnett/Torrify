# Security

Torrify has two runtime shapes with different trust boundaries: a local desktop app and a managed web app.

## Report a Vulnerability

For sensitive disclosures, email: <hello@torrify.org>

Do not open a public issue for active security vulnerabilities.

## Desktop App Security Notes

- API keys are stored locally in user settings.
- CAD rendering is executed on the local machine.
- Ollama can be used for fully local AI workflows.
- Electron runs with context isolation enabled and Node integration disabled in the renderer.

## Web App Security Notes

- The browser runtime does not expose direct OS access.
- Managed AI requests go through the configured Torrify gateway.
- Rendering runs in-browser via WASM by default, with optional managed render API fallback when configured.
- Settings and the optional license key are stored in browser local storage on the current device/profile.

For repository policy details, see [the root `SECURITY.md`](../../SECURITY.md).
