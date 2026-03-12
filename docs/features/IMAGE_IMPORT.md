# Image Import in Chat

Torrify lets you attach reference images to chat messages so the AI can model from photos, sketches, or dimension references.

## How To Use

1. Click the 📎 paperclip in the chat input.
2. Select one or more images.
3. Review thumbnails before sending.
4. Send your message with a description of what you need.

## What The AI Sees

- The text you write
- The current CAD code (if any)
- Attached images
- Optional 3D snapshot from the preview panel

## Project Persistence

Images are saved into `.torrify` project files as data URLs:

- They reload when a project is opened.
- They are visible in the chat history.

## Files Involved

- `src/components/ChatPanel.tsx` (image picker + preview)
- `electron/llm/GeminiService.ts` (image payloads)
- `electron/llm/OpenRouterService.ts` (image payloads)

## Tips

- Include a ruler or known object for scale.
- Use clear, well-lit images with minimal background clutter.

