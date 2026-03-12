# Quickstart

This guide gets you to a first model quickly. If you are unsure which runtime to use, start with the web app.

## Sample Model

Use this simple OpenSCAD example in either runtime:

```
cube([20, 20, 20]);
```

## Web App Quickstart

1. Open the hosted Torrify web app in your browser.
2. Paste the sample model into the editor.
3. Render the model and confirm the preview updates.
4. Ask the chat assistant for a small change such as `Add a centered cylinder cutout through the cube.`
5. Optional: add a license key in Settings if you want higher managed usage limits.

## Desktop App Quickstart

1. Install the desktop app from [GitHub Releases](https://github.com/caseyhartnett/torrify/releases).
2. Install [OpenSCAD](https://openscad.org/downloads.html).
3. Open `Settings` and set `OpenSCAD Path`.
4. Paste the sample model into the editor and render it.
5. Optional: configure Gemini, OpenRouter, or Ollama for AI chat.

## Optional Desktop Upgrade: build123d

If you want Python-based CAD on desktop:

```bash
pip install build123d
```

Then set `Python Path` in `Settings` and switch backend.

## Next

- Compare capabilities in the [Runtime Matrix](../reference/RUNTIME_MATRIX.md)
- See [Feature Overview](../features/overview.md)
- If something fails, check [Troubleshooting](./TROUBLESHOOTING.md)
