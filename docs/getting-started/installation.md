# Install or Access Torrify

Torrify is available as a managed web app and as a desktop app. If you just want the quickest path to a first result, use the web app first.

## Web App

No installation is required.

- Use a modern desktop browser
- Open the hosted Torrify web app
- Managed AI access is built in
- Settings and optional license key are stored in browser storage on that device/profile

The web app is best for:

- first-time users
- low-code onboarding
- quick OpenSCAD experiments

## Desktop App

Use the desktop app when you want the fullest feature set.

1. Download the latest release from [GitHub Releases](https://github.com/caseyhartnett/torrify/releases)
2. Install the app for your platform:
   - Windows: run the `.exe`
   - macOS: open the `.dmg` and drag to Applications
   - Linux: mark the `.AppImage` executable and run it
3. Install [OpenSCAD](https://openscad.org/downloads.html) for local rendering

## Optional Desktop Add-Ons

### build123d

If you want Python-based CAD on desktop:

```bash
pip install build123d
```

### Ollama

If you want local AI workflows, install Ollama and configure it in Settings after desktop setup.

## First-Run Configuration

### Web App

- Open the hosted app
- Start with the managed chat flow
- Optionally add a license key in Settings for higher managed usage limits

### Desktop App

In `Settings` configure:

1. CAD tools
   - `OpenSCAD Path`
   - `Python Path` if you plan to use build123d
2. AI path
   - Managed PRO, Gemini, OpenRouter, or Ollama
   - API key when your selected provider requires one

Desktop settings are stored in `~/.torrify/settings.json` on macOS/Linux or `C:\Users\<User>\.torrify\settings.json` on Windows.

## Next

- Need the fastest onboarding path? Go to [Start Here](./START_HERE.md)
- Want the side-by-side differences? See the [Runtime Matrix](../reference/RUNTIME_MATRIX.md)
- Ready to make your first model? Continue to [Quickstart](./QUICKSTART.md)
