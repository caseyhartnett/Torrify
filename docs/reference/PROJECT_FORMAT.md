# Torrify Project File Format

## Overview

Torrify projects are saved as JSON files with the `.torrify` extension. These files contain all the state needed to restore a project session: code, 3D model (STL), and chat history (including any image attachments).

## File Format Specification

### Version 1 (Current)

```typescript
interface TorrifyProject {
  version: number              // Format version (currently 1)
  savedAt: string             // ISO 8601 timestamp (e.g., "2026-01-24T12:34:56.789Z")
  code: string                // OpenSCAD or build123d source code
  stlBase64: string | null    // Base64-encoded STL file (null if not rendered)
  chat: ChatMessage[]         // Array of chat messages
  cadBackend?: 'openscad' | 'build123d' // Backend used when the project was saved
}

interface ChatMessage {
  id: number                  // Unique message ID (timestamp-based)
  text: string                // Message content
  sender: 'user' | 'bot'      // Message sender
  timestamp: string           // ISO 8601 timestamp
  error?: boolean             // Optional: true if message is an error
  imageDataUrls?: string[]    // Optional: image attachments (data URLs)
}
```

## Example Project File

```json
{
  "version": 1,
  "savedAt": "2026-01-24T12:34:56.789Z",
  "code": "cube([10, 10, 10]);",
  "stlBase64": "U0FMVEVEX0ZJTEU...",
  "cadBackend": "openscad",
  "chat": [
    {
      "id": 1,
      "text": "Hello! I'm your OpenSCAD assistant...",
      "sender": "bot",
      "timestamp": "2026-01-24T12:30:00.000Z"
    },
    {
      "id": 1706100000000,
      "text": "How do I make a sphere?",
      "sender": "user",
      "timestamp": "2026-01-24T12:33:20.000Z",
      "imageDataUrls": [
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
      ]
    },
    {
      "id": 1706100001000,
      "text": "You can create a sphere using: sphere(r=10, $fn=100);",
      "sender": "bot",
      "timestamp": "2026-01-24T12:33:21.000Z"
    }
  ]
}
```

## Field Descriptions

### `version`
- **Type**: `number`
- **Required**: Yes
- **Description**: Format version number. Currently `1`. Used for backward compatibility in future versions.

### `savedAt`
- **Type**: `string` (ISO 8601)
- **Required**: Yes
- **Description**: Timestamp when the project was saved.

### `code`
- **Type**: `string`
- **Required**: Yes
- **Description**: Complete OpenSCAD **or** build123d source code as it appears in the editor.

### `stlBase64`
- **Type**: `string | null`
- **Required**: Yes (can be null)
- **Description**: Base64-encoded STL file data. `null` if the model hasn't been rendered yet or if rendering failed.

### `chat`
- **Type**: `ChatMessage[]`
- **Required**: Yes
- **Description**: Array of chat messages in chronological order. Includes both user messages and AI assistant responses, plus optional image attachments.

### `cadBackend`
- **Type**: `'openscad' | 'build123d'`
- **Required**: No
- **Description**: The CAD backend active when the project was saved. When present, Torrify restores that backend automatically on load.

### `imageDataUrls` (chat message)
- **Type**: `string[]`
- **Required**: No
- **Description**: Attached images stored as data URLs. This enables image-to-3D prompts to be restored on load.

## Loading Behavior

When loading a project:
1. Code is restored to the editor
2. STL is restored if available (enables 3D preview)
3. Chat history is restored with timestamps converted back to `Date` objects
4. If `chat` is missing or invalid, default welcome message is shown
5. If `cadBackend` is present and supported by the current runtime, Torrify restores it automatically.
6. If `cadBackend` is missing or unsupported by the current runtime, Torrify falls back to the runtime default backend.

## File Size Considerations

- **STL files**: Can be large when base64-encoded. A typical STL might add 500KB-5MB to the project file.
- **Chat history**: Grows with usage. Consider implementing chat history limits in future versions.
- **Code**: Typically small (<100KB for most projects).

## Future Compatibility

When adding new fields in future versions:
- Always increment `version`
- Make new fields optional
- Provide migration logic for older versions
- Document breaking changes

## Implementation Notes

- Project files are saved via Electron's `dialog.showSaveDialog()`
- Files are loaded via Electron's `dialog.showOpenDialog()`
- JSON is pretty-printed with 2-space indentation
- Timestamps are stored as ISO strings for JSON compatibility
- Base64 encoding is used for binary STL data
