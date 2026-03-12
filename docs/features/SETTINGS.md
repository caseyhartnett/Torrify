# Settings System

Torrify settings control CAD backends, AI access, and editor behavior. Some settings are shared in concept across runtimes, but the available options differ between the web app and the desktop app.

## Accessing Settings

Click the **Gear Icon** in the top-right corner of the app.

## General Settings

- **CAD Backend**
  - Desktop: switch between OpenSCAD and build123d
  - Web: managed OpenSCAD workflow only
- **OpenSCAD Path**
  - Desktop only
- **Python Path**
  - Desktop only, for build123d

## AI Settings

- **Web app**
  - Uses the managed gateway flow
  - Optional license key for higher managed usage limits
  - No BYOK or Ollama flow in the browser runtime
- **Desktop app**
  - Managed PRO, Gemini, OpenRouter, and Ollama are supported
  - API keys are stored locally in desktop settings

## Knowledge Base Settings

- **Desktop**: can update or reset bundled context files
- **Web**: uses the bundled browser/runtime content path and does not expose the same local update flow

## Storage

### Desktop

Settings are stored in a JSON file:

- **Windows**: `C:\Users\<User>\.torrify\settings.json`
- **macOS/Linux**: `~/.torrify/settings.json`

> Desktop API keys are stored in plain text in this file. Do not share your settings file.

### Web

Settings and the optional license key are stored in browser storage on the current device/profile.
