# Build Resources

This directory contains resources needed for building installers.

## Icons

The application uses **icon.png** in this directory for all platform installers.

- **icon.png** – Universal app icon (512×512 or larger) used for macOS DMG, Windows NSIS, and Linux AppImage
- electron-builder accepts PNG for all platforms; no separate .ico or .icns required

### In-app logo

The canonical branding asset lives at `assets/branding/icon.png`.

The in-app logo (header, favicon, modals) is served from `public/logo.png`, which is generated from that source file.

### Updating the icon

1. Replace `assets/branding/icon.png` with your new icon (512x512 or larger recommended).
2. Run `npm run sync:branding`.
3. The sync script updates:
   - `public/logo.png` (for app UI and favicon)
   - `docs/assets/logo.png` (for README and docs)
   - `build/icon.png` (for installers)

### Optional: Platform-specific icons

For Windows `.ico` or macOS `.icns`:

- **Windows:** Convert `build/icon.png` to multi-size `.ico` (e.g. using [png-to-ico](https://www.npmjs.com/package/png-to-ico) or an online converter) and save as `build/icon.ico`.
- **macOS:** On macOS, use `iconutil -c icns icon.iconset`; elsewhere convert at [convertio.co/png-icns](https://convertio.co/png-icns/) and save as `build/icon.icns`.

Then update `package.json` build config to use `build/icon.ico` for Windows and `build/icon.icns` for macOS.

### No icons (development)

You can build without icons. The build may warn but will complete; the app will use the default Electron icon.

## Other build resources

You can add other assets here (e.g. DMG background, installer graphics, license files).
